import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { renderShell } from '@/lib/email';
import { sendAsUser, createGmailBatchTransport } from '@/lib/mailer';
import { nextSendDelayMs, sendAllowanceFor, sleep } from '@/lib/send-limits';
import { buildColdEmail } from '@/lib/cold-email';
import { isDomainDelegationConfigured } from '@/lib/gmail-delegated';
import { createGmailOAuthBatchClient } from '@/lib/gmail-oauth';
import { decryptSecret } from '@/lib/crypto';
import { buildFallbackColdEmailDraft, advanceToContactedOnOutreach } from '@/lib/leads';

const MAX_LEADS = 200;

/**
 * Sends every selected lead's cold email draft one click, no per-recipient
 * typing. Uses the bespoke research draft when one was imported; otherwise
 * falls back to a generic first-contact template built from whatever
 * personalization is on file (observation, then pain points) so a lead
 * missing a hand-written draft doesn't just get silently skipped. Leads
 * without an email on file are skipped and reported so they can be called
 * instead.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { leadIds } = await request.json();
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'No leads selected' }, { status: 400 });
    }
    if (leadIds.length > MAX_LEADS) {
      return NextResponse.json({ error: `Max ${MAX_LEADS} leads per send` }, { status: 400 });
    }

    const sender = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        name: true,
        email: true,
        gmailAddress: true,
        gmailAppPassword: true,
        googleRefreshToken: true,
        avatarUrl: true,
      },
    });
    if (!sender) return unauthorizedResponse();

    const results: Array<{ leadId: string; company: string; ok: boolean; reason?: string; sentVia?: string }> = [];

    // Today's remaining allowance, checked before anything goes out.
    const allowance = await sendAllowanceFor(session.userId);
    if (allowance.remaining === 0) {
      return NextResponse.json(
        {
          error: `You've sent your ${allowance.cap} for today. This cap protects the domain's sending reputation — the invoices and password resets going to paying clients ride on it too. Picks up again tomorrow.`,
        },
        { status: 429 }
      );
    }

    const leads = await prisma.lead.findMany({ where: { id: { in: leadIds } } });

    // Cold outreach is for people we have not sold to. A lead that is won,
    // or already deep in the pipeline, is an active client or a live
    // negotiation — sending them a "I came across your business while
    // researching" opener is, at best, embarrassing. The UI filters for
    // this, but the UI is a list the user can have had open for an hour.
    const COLD_ELIGIBLE = new Set(['new', 'researched', 'contacted']);
    const eligible = leads.filter((l) => COLD_ELIGIBLE.has(l.status));
    for (const l of leads) {
      if (!COLD_ELIGIBLE.has(l.status)) {
        results.push({
          leadId: l.id,
          company: l.company,
          ok: false,
          reason: `Skipped — already at "${l.status}". Cold openers only go to leads nobody has spoken to yet.`,
        });
      }
    }

    // Trim to what's left of the daily allowance, and say what was held back
    // rather than silently dropping the tail.
    const toSend = eligible.slice(0, allowance.remaining);
    for (const l of eligible.slice(allowance.remaining)) {
      results.push({
        leadId: l.id,
        company: l.company,
        ok: false,
        reason: `Held back — daily cap of ${allowance.cap} reached. Send these tomorrow.`,
      });
    }

    // One authenticated client/connection for the whole batch — see
    // createGmailBatchTransport for why per-email connections silently fall
    // over to Resend past the first few sends in a loop this size.
    const gmailOAuthClient =
      !isDomainDelegationConfigured() && sender.googleRefreshToken
        ? createGmailOAuthBatchClient(decryptSecret(sender.googleRefreshToken))
        : undefined;
    const gmailTransport =
      !isDomainDelegationConfigured() && !gmailOAuthClient && sender.gmailAddress && sender.gmailAppPassword
        ? createGmailBatchTransport(sender.gmailAddress, sender.gmailAppPassword)
        : undefined;

    let sentThisBatch = 0;
    for (const lead of toSend) {
      // Space the sends out, with jitter. A burst of identically-spaced
      // near-identical messages is the easiest automation signature there
      // is; the delay is the difference between outreach and a pattern.
      if (sentThisBatch > 0) await sleep(nextSendDelayMs());

      if (!lead.email) {
        results.push({ leadId: lead.id, company: lead.company, ok: false, reason: 'No email on file — call instead' });
        continue;
      }
      const draft =
        lead.coldEmailDraft ||
        buildFallbackColdEmailDraft({
          company: lead.company,
          painPoints: lead.painPoints,
          personalizedObservation: lead.personalizedObservation,
        });

      const { subject, html: bodyHtml } = buildColdEmail({
        draft,
        company: lead.company,
        contactName: lead.contactName,
        senderName: sender.name,
      });

      const html = renderShell({
        title: subject,
        bodyHtml,
        footerNote: `${sender.name || 'Bothmade'} — bothmade.studio`,
        footerAvatarUrl: sender.avatarUrl,
      });

      const result = await sendAsUser(
        {
          name: sender.name,
          email: sender.email,
          gmailAddress: sender.gmailAddress,
          gmailAppPassword: sender.gmailAppPassword,
          googleRefreshToken: sender.googleRefreshToken,
        },
        { to: lead.email, subject, html },
        { gmailTransport, gmailOAuthClient }
      );

      if (!result.ok) {
        const reason = "Couldn't send — the address may be invalid or no longer active. Call instead.";
        results.push({ leadId: lead.id, company: lead.company, ok: false, reason });
        await prisma.lead
          .update({ where: { id: lead.id }, data: { emailDeliveryFailedAt: new Date(), emailDeliveryFailedReason: reason } })
          .catch(() => null);
        continue;
      }

      await prisma.lead
        .update({
          where: { id: lead.id },
          data: {
            coldEmailSentAt: new Date(),
            status: advanceToContactedOnOutreach(lead.status),
            emailDeliveryFailedAt: null,
            emailDeliveryFailedReason: null,
          },
        })
        .catch(() => null);
      await prisma.leadActivity
        .create({ data: { leadId: lead.id, type: 'email', content: subject, createdById: session.userId } })
        .catch(() => null);

      sentThisBatch += 1;
      results.push({ leadId: lead.id, company: lead.company, ok: true, sentVia: result.sentVia });
    }

    gmailTransport?.close();

    const sentCount = results.filter((r) => r.ok).length;
    const sentViaResend = results.filter((r) => r.ok && r.sentVia === 'resend').length;
    return NextResponse.json(
      { success: true, sentCount, total: results.length, results, sentViaResend },
      { status: 200 }
    );
  } catch (error) {
    console.error('Send cold drafts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
