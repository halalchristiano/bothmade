import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { renderShell } from '@/lib/email';
import { sendAsUser, createGmailBatchTransport } from '@/lib/mailer';
import { isDomainDelegationConfigured } from '@/lib/gmail-delegated';
import { createGmailOAuthBatchClient } from '@/lib/gmail-oauth';
import { decryptSecret } from '@/lib/crypto';
import { buildFallbackColdEmailDraft, advanceToContactedOnOutreach } from '@/lib/leads';
import { FALLBACK_SENDER_NAME, renderColdEmail } from '@/lib/cold-email';

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

    const leads = await prisma.lead.findMany({ where: { id: { in: leadIds } } });

    const results: Array<{ leadId: string; company: string; ok: boolean; reason?: string; sentVia?: string }> = [];

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

    for (const lead of leads) {
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

      const { subject, body } = renderColdEmail(draft, lead, sender.name || FALLBACK_SENDER_NAME);

      const bodyHtml = body
        .split(/\n{2,}/)
        .map((para) => `<p>${para.replace(/\n/g, '<br/>')}</p>`)
        .join('');

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
