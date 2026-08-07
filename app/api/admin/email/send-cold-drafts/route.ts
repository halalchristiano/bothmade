import { NextRequest, NextResponse } from 'next/server';
import { checkSendBudget } from '@/lib/send-budget';
import { BounceWatch, recentBounceRate, verifiedFirst } from '@/lib/send-safety';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { renderShell } from '@/lib/email';
import { escParagraphs } from '@/lib/html';
import { sendAsUser, createGmailBatchTransport } from '@/lib/mailer';
import { isDomainDelegationConfigured } from '@/lib/gmail-delegated';
import { createGmailOAuthBatchClient } from '@/lib/gmail-oauth';
import { decryptSecret } from '@/lib/crypto';
import { buildFallbackColdEmailDraft, advanceToContactedOnOutreach } from '@/lib/leads';
import { FALLBACK_SENDER_NAME, renderColdEmail } from '@/lib/cold-email';
import { leadOpenPixelUrl } from '@/lib/lead-opens';
import { resolveSiteUrl } from '@/lib/site-url';

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
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

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

    /*
     * The daily ceiling, checked before a single message goes.
     *
     * The per-request cap above was the only limit there had ever been, so
     * four presses of send was eight hundred emails and Google restricted the
     * account. Trimmed rather than refused: a batch that can send forty
     * should send forty and say so, because refusing the whole thing is what
     * teaches somebody to press send again.
     */
    const budget = await checkSendBudget(session.userId, leadIds.length);
    if (budget.error) {
      return NextResponse.json({ error: budget.error, budget }, { status: 429 });
    }

    /*
     * Yesterday's bounces, before today's batch.
     *
     * A hard bounce arrives minutes or hours after the send loop has already
     * finished, so the in-flight watch below cannot see it — by the time the
     * postmaster replies, the batch is long done. Checking the standing rate
     * first is what turns last week's evidence into this week's decision,
     * and it is the only guard that can stop a bad list before any of it
     * goes out. Refused rather than trimmed: there is no safe amount of a
     * list that is bouncing.
     */
    const recent = await recentBounceRate();
    if (recent.sent >= 20 && recent.rate >= 0.1) {
      return NextResponse.json(
        {
          error: `${recent.bounced} of the last ${recent.sent} cold emails bounced (${Math.round(
            recent.rate * 100
          )}%). Anything over about 2% puts a sending account at risk, and most of these addresses were guessed from a domain rather than found published. Verify the list before sending more.`,
          bounceRate: recent.rate,
        },
        { status: 409 }
      );
    }

    /*
     * Ordered before it is trimmed, which is the whole point of ordering.
     *
     * Roughly three quarters of this book carries an `info@` guessed from the
     * company domain rather than an address anybody has seen. When the daily
     * ceiling cuts a batch of a hundred down to forty, whatever sits at the
     * front is what actually goes — so a limited and hard-won allowance was
     * being spent on whichever addresses happened to be selected first,
     * guesses included. Verified addresses now lead.
     */
    const selected = await prisma.lead.findMany({ where: { id: { in: leadIds } } });
    const leads = verifiedFirst(selected).slice(0, budget.allowed);
    const idsToSend = leads.map((l) => l.id);

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

    /*
     * Watching the batch as it goes.
     *
     * A run that is being refused one message in five is not a list with a
     * few dead addresses in it — it is a list the provider is already unhappy
     * about, and every further message makes the account's position worse.
     * The remaining leads are reported as held back rather than failed, so
     * nothing is marked as attempted that never was.
     */
    const bounces = new BounceWatch();
    let haltedBy: string | undefined;

    for (const lead of leads) {
      if (haltedBy) {
        results.push({ leadId: lead.id, company: lead.company, ok: false, reason: 'Held back — batch stopped' });
        continue;
      }
      // A hard stop, not a preference. The mockup-send route already refused
      // these; this one did not, so a business that asked to be left alone was
      // still emailed by a batch send — and the record showed we knew.
      if (lead.doNotContact) {
        results.push({
          leadId: lead.id,
          company: lead.company,
          ok: false,
          reason: 'Marked do-not-contact — nothing sent',
        });
        continue;
      }
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

      // The draft comes from a research CSV someone imported and the
      // substituted name from the lead record — neither is markup, and both
      // end up in a client's inbox.
      const bodyHtml = escParagraphs(body);

      const html = renderShell({
        title: subject,
        bodyHtml,
        footerNote: `${sender.name || 'Bothmade'} — bothmade.studio`,
        footerAvatarUrl: sender.avatarUrl,
        // One pixel, so the silence afterwards can be read. Without it every
        // unanswered lead looks the same as every other one and they get
        // called in whatever order the list happens to be in.
        trackingPixelUrl: leadOpenPixelUrl(resolveSiteUrl(), lead.id),
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

      // Only what the mail server actually refused counts toward the rate —
      // a lead skipped for do-not-contact or a missing address says nothing
      // about deliverability, and counting it would halt a batch for being
      // careful.
      bounces.record(result.ok);

      if (!result.ok) {
        const reason = "Couldn't send — the address may be invalid or no longer active. Call instead.";
        results.push({ leadId: lead.id, company: lead.company, ok: false, reason });
        await prisma.lead
          .update({ where: { id: lead.id }, data: { emailDeliveryFailedAt: new Date(), emailDeliveryFailedReason: reason } })
          .catch(() => null);
        haltedBy = bounces.verdict().reason;
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
            // A resend starts the count again. Opens of the previous email
            // are not evidence about this one, and leaving them would put a
            // lead at the top of the queue for something it did last month.
            coldEmailOpens: 0,
            coldEmailOpenedAt: null,
            coldEmailLastOpenedAt: null,
            // The next email is a new question and deserves its own answer,
            // so the alert is armed again along with the counters.
            coldEmailOpenNotifiedAt: null,
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
    /*
     * `heldBack` is reported rather than left to be inferred from a count
     * that came back smaller than the one that went in — a trim nobody was
     * told about is how somebody presses send a second time.
     */
    const heldBack = leadIds.length - idsToSend.length;
    return NextResponse.json(
      {
        success: true,
        sentCount,
        total: results.length,
        results,
        sentViaResend,
        heldBack,
        // Reported separately from a per-lead failure: this is the batch
        // being stopped, not a lead being skipped, and it is the one thing
        // here that should change what somebody does next.
        haltedBy: haltedBy ?? null,
        bounceRate: bounces.verdict().rate,
        budget: { limit: budget.limit, used: budget.used + sentCount, remaining: Math.max(0, budget.remaining - sentCount) },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Send cold drafts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
