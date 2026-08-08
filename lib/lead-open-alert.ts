import { prisma } from '@/lib/prisma';
import { resolveSiteUrl } from '@/lib/site-url';
import { postSystemMessage } from '@/lib/team-chat';
import { renderShell, sendEmail } from '@/lib/email';
import { esc } from '@/lib/html';
import { readOpens } from '@/lib/lead-opens';

/**
 * "They just opened it."
 *
 * The counts have been landing on the lead since the pixel shipped, and the
 * call queue has been ranking on them — but only for whoever thought to open
 * the call queue. A prospect reading your email three times this morning is
 * the shortest-lived signal in this business, and it was sitting behind a page
 * nobody had a reason to refresh. So it now comes to you.
 *
 * ## Fired once, by the fetch that earns it
 *
 * Not every pixel fetch is news. The first one is usually a mail server, and
 * an alert per image load would train everybody to ignore the alerts within a
 * day. This fires on the single fetch that takes a lead from "no signal" to
 * "a person has looked at this" — see `callable` in lib/lead-opens.ts — and
 * the claim is made in the same UPDATE that checks it, so two mail clients
 * syncing the same message cannot both send one.
 *
 * A resend clears the claim along with the counters, because the next email is
 * a new question and deserves its own answer.
 */

/**
 * How many opens a lead needs before an alert is worth sending.
 *
 * One. Set by the studio's owner, and the reasoning is theirs to make: a
 * single eyeball on a cold email is worth knowing about, and a batch of a few
 * hundred that produces one notification looks indistinguishable from a
 * tracker that has stopped working.
 *
 * The bar has now been at one, then three, then one again, so the trade is
 * worth writing down rather than rediscovering. Three suppressed the noise
 * from Apple Mail Privacy Protection and Gmail's image proxy, both of which
 * fetch on delivery whether or not a human looks — so at one, some share of
 * these alerts are a machine, not a reader. What that buys is never missing
 * the ones that are real. At the volumes this studio sends, that is the right
 * side to err on; at a thousand a day it would not be, and the number to
 * change is here.
 *
 * The wording already tells the two apart on its own: `confirmedReader` is
 * what decides between "is reading it" and the flatter "opened it", so an
 * alert fired on a single open never claims more than it knows.
 */
export const ALERT_MIN_OPENS = 1;

/**
 * Who these leave from.
 *
 * Not the shared info@ inbox. An open alert is a machine telling you to pick
 * up the phone — nobody replies to it, and a reply that did arrive would land
 * in the inbox the studio answers clients from.
 *
 * The domain has to be verified with Resend, and ideally exist as a Workspace
 * mailbox so the delegated transport can use it too; a delegated failure
 * falls through to Resend, an unverified domain does not fall through to
 * anything. Overridable so that can be changed without a deploy.
 */
export const ALERT_FROM_EMAIL =
  process.env.ALERT_FROM_EMAIL?.trim() || 'no-reply@bothmadestudio.com';

export interface OpenAlertResult {
  /** Whether this fetch was the one that claimed the alert. */
  sent: boolean;
  reason?: string;
}

/**
 * Try to claim and send the alert for a lead that has just been opened.
 *
 * Returns quietly rather than throwing: this is called from the pixel route,
 * where nothing may be allowed to stop a transparent GIF being returned.
 */
export async function alertOnFirstRealOpen(leadId: string): Promise<OpenAlertResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      company: true,
      contactName: true,
      email: true,
      phone: true,
      estimatedValue: true,
      coldEmailSentAt: true,
      coldEmailOpens: true,
      coldEmailOpenedAt: true,
      coldEmailLastOpenedAt: true,
      coldEmailOpenNotifiedAt: true,
      assignedTo: { select: { id: true, email: true, name: true } },
      importedBy: { select: { id: true, email: true, name: true } },
    },
  });

  if (!lead) return { sent: false, reason: 'no such lead' };
  if (lead.coldEmailOpenNotifiedAt) return { sent: false, reason: 'already alerted' };

  const reading = readOpens(lead);
  /*
   * Three opens before anybody's phone buzzes.
   *
   * The bar has moved twice, and both moves were right at the time. It
   * required repetition, then it fired on any open — because an open is real
   * information and suppressing the alert threw the fact away. What changed
   * is the volume: at a thousand leads a day, "every first open" is a
   * notification every few minutes, and an alert stream nobody can keep up
   * with is one nobody reads. The fact is still kept — the count is on the
   * lead and the lead is on the call sheet from the very first open. This
   * only decides what is worth interrupting somebody for.
   *
   * Three, not two, because a privacy proxy fetching on delivery plus one
   * genuine open is already two. Three is the first number that cannot be
   * explained by a machine and a single glance.
   */
  if (reading.opens < ALERT_MIN_OPENS) {
    return { sent: false, reason: `only ${reading.opens} open(s) — below the alert threshold` };
  }
  /*
   * No second gate on `confirmedReader`.
   *
   * It used to require the open pattern to look like a person before anything
   * was sent, which at a threshold of one is a contradiction: a first open can
   * never have come back to anything. The distinction is not lost — it decides
   * the wording below, so a single open is reported as an open and only a
   * repeat one is called reading.
   */

  /*
   * The claim, and the check, in one statement.
   *
   * Two mail clients syncing the same message land here within milliseconds of
   * each other. Reading the column and then writing it would let both pass the
   * check and both send. `updateMany` with the null guard means exactly one
   * request comes back with a count of 1, and that one owns the alert.
   */
  const claimed = await prisma.lead.updateMany({
    where: { id: leadId, coldEmailOpenNotifiedAt: null },
    data: { coldEmailOpenNotifiedAt: new Date() },
  });
  if (claimed.count === 0) return { sent: false, reason: 'claimed by another fetch' };

  const siteUrl = resolveSiteUrl();
  const leadUrl = `${siteUrl}/admin/leads/${lead.id}`;
  const who = lead.contactName ? `${lead.contactName} at ${lead.company}` : lead.company;
  const times = reading.opens === 1 ? 'once' : `${reading.opens} times`;
  /*
   * Two different pieces of news, and they must not be worded the same.
   *
   * A confirmed reader has come back to the email — that is a person, and
   * "is reading it" is a true sentence about them. A single open is an open:
   * proof the address is live and somebody's mail system touched it, which
   * is worth telling you and worth a dial, but saying "is reading it" over it
   * is a claim the pixel cannot support. Both go on the sheet; only one gets
   * to make that claim.
   */
  const reader = reading.confirmedReader;

  // In the app first, because it is the surface a rep already has open and it
  // costs nothing. Marked urgent so it sorts to the top of the thread.
  await postSystemMessage({
    content: `${lead.company} ${
      reader ? `has opened your cold email ${times} — somebody is reading it` : 'opened your cold email'
    }. ${
      lead.phone
        ? `Call ${lead.phone} — they are ${reader ? 'at the top of' : 'on'} the call sheet now.`
        : 'No phone number on this lead, so they are under "No phone number on file" rather than on the call sheet. Reply to that email while it is still in front of them.'
    }`,
    fromUserId: lead.assignedTo?.id ?? null,
    relatedLeadId: lead.id,
    urgent: true,
  }).catch((err) => console.error('Open alert chat message failed:', err));

  /*
   * The person who uploaded the batch, first.
   *
   * They ran the import and they pressed send on the emails, so they are the
   * one sitting waiting to hear whether any of it landed — and a lead handed
   * to somebody else afterwards should not redirect that. The assignee is the
   * fallback, which is also what every lead that predates the column gets,
   * and is what this used to do for all of them.
   */
  const to = lead.importedBy?.email ?? lead.assignedTo?.email;
  if (to) {
    await sendEmail({
      to,
      // Not the shared client inbox: nobody replies to an alert, and a reply
      // that did arrive would land where the studio answers clients.
      from: ALERT_FROM_EMAIL,
      subject: reader
        ? `${lead.company} is reading your email`
        : `${lead.company} opened your email`,
      html: renderShell({
        eyebrow: 'Opened',
        title: reader ? `${lead.company} is reading it` : `${lead.company} opened it`,
        bodyHtml:
          `<p style="margin:0 0 14px;">${esc(who)} opened your cold email <strong>${esc(
            times
          )}</strong>.${
            reader ? ' They have come back to it, which a mail server does not do.' : ''
          }</p>` +
          /*
           * What to actually do, which is not the same sentence twice.
           *
           * This used to promise the call sheet either way. The call sheet is
           * built from leads that HAVE a number — one without lands under "No
           * phone number on file" at the bottom of the page, so a rep went
           * looking for a lead that was never going to be where they were
           * told. Say where it is, and give the move that exists: they are
           * reading the email right now, so reply to it.
           */
          `<p style="margin:0 0 14px;">${
            lead.phone
              ? `Their number is <strong>${esc(lead.phone)}</strong>. They are on the call sheet now, ${
                  reader ? 'at the top' : 'in the opened band'
                }.`
              : 'There is <strong>no phone number</strong> on this lead, so they are not on the call sheet — they are under "No phone number on file". Reply to that email while they still have it open, and find a number when you can.'
          }</p>` +
          `<p style="margin:0; font-size:13px; color:rgba(255,255,255,0.5);">${
            reader
              ? `Opened more than once, across time. That is a person rather than a mail server, and it is the best moment you will get to ${
                  lead.phone ? 'ring them' : 'land in front of them'
                }.`
              : 'One open proves the message cleared the spam filter and reached a live mailbox — which is more than most of your list. It does not prove anybody read it: a privacy proxy fetches images on delivery. Worth the call anyway.'
          }</p>`,
        ctaLabel: 'Open the lead',
        ctaUrl: leadUrl,
        footerNote: 'Bothmade — sent because a lead opened your email.',
      }),
    }).catch((err) => console.error('Open alert email failed:', err));
  }

  await prisma.leadActivity
    .create({
      data: {
        leadId: lead.id,
        type: 'note',
        content: `Opened the cold email ${times}. Alert sent${to ? ` to ${to}` : ''}.`,
        createdById: lead.assignedTo?.id ?? (await anyStaffId()),
      },
    })
    .catch((err) => console.error('Open alert activity not recorded:', err));

  return { sent: true };
}

/** The activity table wants an author and the pixel has no session. */
async function anyStaffId(): Promise<string> {
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) throw new Error('no staff account to attribute the activity to');
  return user.id;
}
