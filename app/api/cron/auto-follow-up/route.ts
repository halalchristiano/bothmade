import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCronAuth } from '@/lib/cron-auth';
import { decryptSecret } from '@/lib/crypto';
import { sendAsUser } from '@/lib/mailer';
import { renderShell } from '@/lib/email';
import { resolveSiteUrl } from '@/lib/site-url';
import { advanceToContactedOnOutreach } from '@/lib/leads';
import { checkSendBudget } from '@/lib/send-budget';
import {
  AUTO_FOLLOW_UP_MAX_PER_RUN,
  autoFollowUpEmail,
  autoFollowUpSender,
} from '@/lib/auto-follow-up';

// One Gmail call per lead, up to forty of them. The platform default would
// cut the run off partway and leave the rest for tomorrow.
export const maxDuration = 300;

/**
 * Sends the second email to everybody whose call was three days ago.
 *
 * The whole point of this job is that it does not depend on anybody
 * remembering. It runs daily, picks up the leads whose due date has arrived,
 * sends one email each, and stamps them so a second run cannot send twice.
 *
 * ## What it refuses to send to, and why each one is checked here
 *
 * The due date was set three days ago and a lot can happen in three days.
 * Every one of these is a lead whose due date is still sitting there, correct
 * at the time it was set and wrong now:
 *
 *  - they wrote back — they are in a conversation, and an automated nudge
 *    arriving mid-thread is worse than none at all;
 *  - they asked to be left alone;
 *  - the deal closed, either way;
 *  - the address bounced, so the send would only push the bounce rate up;
 *  - a mockup went in for them, which is the follow-up.
 *
 * The alternative — trusting whoever changed the lead to have cleared the due
 * date — is how an automated email goes to somebody who told us to stop.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const senderEmail = autoFollowUpSender();

    /*
     * One named mailbox, and no falling back to another.
     *
     * These are automated cold-ish emails and they must come from the mailbox
     * chosen for them. Quietly sending them from whoever happens to have
     * Gmail connected is how a warming domain's work lands on a restricted
     * account instead — so a missing sender stops the run and says so.
     */
    const sender = await prisma.user.findFirst({
      where: { OR: [{ gmailAddress: senderEmail }, { email: senderEmail }] },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        gmailAddress: true,
        gmailAppPassword: true,
        googleRefreshToken: true,
      },
    });

    if (!sender) {
      console.error(`[auto-follow-up] No account for ${senderEmail} — nothing sent.`);
      return NextResponse.json(
        {
          error: `Automated follow-ups are set to send from ${senderEmail}, and no admin account has that address. Add it under Team, connect its Gmail, or point AUTO_FOLLOW_UP_FROM somewhere else.`,
        },
        { status: 503 }
      );
    }

    const due = await prisma.lead.findMany({
      where: {
        autoFollowUpDueAt: { lte: new Date() },
        autoFollowUpSentAt: null,
        replyReceivedAt: null,
        doNotContact: false,
        status: { notIn: ['won', 'lost'] },
        email: { not: null },
        emailDeliveryFailedAt: null,
        mockupRequested: false,
      },
      select: { id: true, company: true, contactName: true, email: true, shareToken: true, status: true },
      orderBy: { autoFollowUpDueAt: 'asc' },
      take: AUTO_FOLLOW_UP_MAX_PER_RUN,
    });

    if (due.length === 0) {
      return NextResponse.json({ success: true, sent: 0, failed: 0, overflow: 0 }, { status: 200 });
    }

    /*
     * Counted against the same daily ceiling as everything else.
     *
     * This job sends from its own mailbox and could happily ignore the limit,
     * which is exactly why it must not: the ceiling exists because an account
     * that goes over it gets restricted, and "it was the cron, not me" is not
     * a distinction Google draws.
     */
    const budget = await checkSendBudget(sender.id, due.length);
    const batch = due.slice(0, budget.allowed);

    const site = resolveSiteUrl();
    let sent = 0;
    let failed = 0;

    for (const lead of batch) {
      const mail = autoFollowUpEmail({
        company: lead.company,
        contactName: lead.contactName,
        stopUrl: `${site}/stop/${lead.shareToken}`,
      });

      const result = await sendAsUser(
        {
          name: sender.name,
          email: sender.email,
          gmailAddress: sender.gmailAddress,
          gmailAppPassword: sender.gmailAppPassword ? decryptSecret(sender.gmailAppPassword) : null,
          googleRefreshToken: sender.googleRefreshToken
            ? decryptSecret(sender.googleRefreshToken)
            : null,
        },
        { to: lead.email as string, subject: mail.subject, html: renderShell({ title: mail.subject, bodyHtml: mail.html, footerNote: `${sender.name || 'Bothmade'} — bothmade.studio` }) }
      );

      if (!result.ok) {
        failed++;
        /*
         * Stamped sent even though it failed, and the failure recorded
         * alongside it.
         *
         * Leaving it due means retrying a dead address every night forever,
         * and repeated sends to an address that refuses them is precisely the
         * pattern that restricted the account in the first place. The lead
         * surfaces on the call list as "couldn't reach — ring instead", which
         * is the honest next step for it anyway.
         */
        await prisma.lead
          .update({
            where: { id: lead.id },
            data: {
              autoFollowUpSentAt: new Date(),
              emailDeliveryFailedAt: new Date(),
              emailDeliveryFailedReason:
                "The automated follow-up couldn't be delivered — the address may be dead. Call instead.",
            },
          })
          .catch(() => null);
        continue;
      }

      sent++;
      await prisma
        .$transaction([
          prisma.leadActivity.create({
            data: {
              leadId: lead.id,
              type: 'email',
              content: `Automated follow-up sent — ${mail.subject}`,
              createdById: sender.id,
            },
          }),
          prisma.lead.update({
            where: { id: lead.id },
            data: {
              autoFollowUpSentAt: new Date(),
              status: advanceToContactedOnOutreach(lead.status),
              updatedAt: new Date(),
            },
          }),
        ])
        .catch((err) => console.error('[auto-follow-up] Could not record a sent email:', err));
    }

    return NextResponse.json(
      {
        success: true,
        sender: senderEmail,
        sent,
        failed,
        // Never silently dropped: a run that was trimmed says by how much, so
        // "40 sent" cannot be mistaken for "everybody who was due".
        heldBack: due.length - batch.length,
        budgetRemaining: Math.max(0, budget.remaining - sent),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Auto follow-up error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
