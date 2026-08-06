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
    },
  });

  if (!lead) return { sent: false, reason: 'no such lead' };
  if (lead.coldEmailOpenNotifiedAt) return { sent: false, reason: 'already alerted' };

  const reading = readOpens(lead);
  // A mail server fetching the image on delivery is not news, and telling
  // somebody it is would make every future alert worthless.
  if (!reading.callable) return { sent: false, reason: 'not a person yet' };

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

  // In the app first, because it is the surface a rep already has open and it
  // costs nothing. Marked urgent so it sorts to the top of the thread.
  await postSystemMessage({
    content: `${lead.company} opened your cold email (${times}). ${
      lead.phone ? `Call ${lead.phone} — they are` : 'They are'
    } at the top of the call sheet now.`,
    fromUserId: lead.assignedTo?.id ?? null,
    relatedLeadId: lead.id,
    urgent: true,
  }).catch((err) => console.error('Open alert chat message failed:', err));

  // And to the inbox, because that is what reaches a phone. Deliberately
  // short: this email exists to cause one phone call, so the only things in
  // it are who, how many times, and the number to ring.
  const to = lead.assignedTo?.email;
  if (to) {
    await sendEmail({
      to,
      subject: `${lead.company} just opened your email`,
      html: renderShell({
        eyebrow: 'Opened',
        title: `${lead.company} is reading it`,
        bodyHtml:
          `<p style="margin:0 0 14px;">${esc(who)} opened your cold email <strong>${esc(
            times
          )}</strong>.</p>` +
          `<p style="margin:0 0 14px;">${
            lead.phone
              ? `Their number is <strong>${esc(lead.phone)}</strong>.`
              : 'There is no phone number on this lead — the address is all we have.'
          } They are on the call sheet now, at the top.</p>` +
          `<p style="margin:0; font-size:13px; color:rgba(255,255,255,0.5);">One open means the message reached a live mailbox and somebody looked at it. It does not mean they read every word — but it is the best moment you will get to ring them.</p>`,
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
