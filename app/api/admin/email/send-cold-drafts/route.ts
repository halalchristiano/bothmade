import { NextRequest, NextResponse } from 'next/server';
import { checkSendBudget } from '@/lib/send-budget';
import { BounceWatch, recentBounceRate, verifiedFirst } from '@/lib/send-safety';
import {
  VERIFY_BATCH_SIZE,
  isSendableStatus,
  isVerificationConfigured,
  verifyBatch,
} from '@/lib/email-verification';
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

/*
 * Long enough for a verification call and a batch of sends in one request.
 *
 * The verifier documents up to 70 seconds for a full batch of 200, and the
 * send loop is sequential on top of that. On the platform default this route
 * would be killed partway through — with some emails sent, some not, and the
 * caller told only that it failed, which is the worst of every world.
 */
export const maxDuration = 300;

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
    const ordered = verifiedFirst(selected);

    /*
     * Check the addresses before using them, not after they bounce.
     *
     * Only the ones never checked, because an address does not change between
     * sends and a verification costs a credit. Only the batch about to go
     * out, which is capped at 200 by the route and by the provider alike, so
     * this is one call rather than a queue.
     *
     * Nothing is guessed when the check cannot run: a provider outage refuses
     * the batch rather than falling through to sending unverified addresses,
     * because "the safety check is down" is the worst possible moment to send
     * a thousand guesses. The whole point of this is that a bad list is more
     * expensive than a delayed one.
     */
    const unchecked = ordered.filter((l) => l.email && !l.emailVerifiedAt).slice(0, VERIFY_BATCH_SIZE);
    let verified = 0;
    let rejected = 0;
    const deleted: string[] = [];
    const dropped = new Set<string>();

    if (isVerificationConfigured() && unchecked.length > 0) {
      let results;
      try {
        results = await verifyBatch(unchecked.map((l) => l.email as string));
      } catch (err) {
        console.error('Email verification failed:', err);
        return NextResponse.json(
          {
            error:
              "Couldn't verify the addresses, so nothing was sent. This list is mostly guessed addresses and sending it unchecked is what got the account restricted last time — try again in a few minutes.",
          },
          { status: 503 }
        );
      }

      const now = new Date();
      await Promise.all(
        unchecked.map(async (lead) => {
          const r = results.get((lead.email as string).toLowerCase());
          if (!r) return; // no verdict — stays unverified, gets another chance
          verified++;
          if (isSendableStatus(r.status)) {
            await prisma.lead
              .update({
                where: { id: lead.id },
                data: {
                  emailVerifiedAt: now,
                  emailVerificationStatus: r.status,
                  emailVerificationSubStatus: r.subStatus,
                },
              })
              .catch(() => null);
            return;
          }

          rejected++;
          dropped.add(lead.id);

          /*
           * A dead address, and what is left of the lead decides its fate.
           *
           * With a phone number there is still a business to ring — that is
           * the whole call sheet, and the numbers in this book were expensive
           * to find. So the address is retired the way a real bounce is and
           * the lead stays workable by phone.
           *
           * With no phone and no address there is nothing left to do with it
           * at all, and keeping it means carrying a row that can only ever
           * take up space in a count. Those are deleted.
           */
          if (lead.phone) {
            await prisma.lead
              .update({
                where: { id: lead.id },
                data: {
                  emailVerifiedAt: now,
                  emailVerificationStatus: r.status,
                  emailVerificationSubStatus: r.subStatus,
                  emailDeliveryFailedAt: now,
                  emailDeliveryFailedReason: `Address verified as ${r.status}${
                    r.subStatus ? ` (${r.subStatus})` : ''
                  }. Nothing was sent — call instead.`,
                },
              })
              .catch(() => null);
            return;
          }

          deleted.push(lead.company);
          await prisma.lead.delete({ where: { id: lead.id } }).catch(() => null);
        })
      );

      // Re-read so the loop below sees the verdicts that were just written.
      for (const lead of unchecked) {
        const r = results.get((lead.email as string).toLowerCase());
        if (r) lead.emailVerificationStatus = r.status;
      }
    }

    /*
     * The daily allowance is spent AFTER the dead addresses come out, not
     * before.
     *
     * Trimming first meant a batch of five hundred that turned out to hold a
     * hundred dead addresses sent four hundred and burned the whole day's
     * ceiling doing it. Nothing was ever sent to those hundred, so nothing
     * should have been charged for them — the limit exists to cap what
     * reaches a mail server, and an address we refused to use never got near
     * one.
     */
    const sendable = ordered.filter(
      (l) => !dropped.has(l.id) && isSendableStatus(l.emailVerificationStatus)
    );
    const leads = sendable.slice(0, budget.allowed);
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
    // Only what the ceiling actually withheld. A dead address was never held
    // back for tomorrow — it is gone, and counting it here would tell somebody
    // to come back for leads that no longer exist.
    const heldBack = Math.max(0, sendable.length - idsToSend.length);
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
        // What the verifier did, so a batch that came back smaller has a
        // reason attached rather than looking like leads went missing.
        verified,
        rejected,
        deleted: deleted.length,
        deletedNames: deleted.slice(0, 5),
        budget: { limit: budget.limit, used: budget.used + sentCount, remaining: Math.max(0, budget.remaining - sentCount) },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Send cold drafts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
