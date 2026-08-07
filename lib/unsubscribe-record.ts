import { prisma } from '@/lib/prisma';

/**
 * The database half of the unsubscribe, kept apart from the URL half.
 *
 * lib/unsubscribe.ts is pure string work and gets imported by the email
 * templates, which are imported by nearly everything. Putting a Prisma client
 * at the end of that chain would construct one wherever an email is merely
 * rendered — including in tests that never touch a database. So the write
 * lives here, where only the two routes that perform it reach for it.
 */
/**
 * Stops emailing whoever holds this token, and says so on their timeline.
 *
 * Shared by the button on the page and the mail client's one-click POST, so
 * the two cannot drift into meaning different things — an unsubscribe that
 * works from the footer but not from Gmail's own control is the version of
 * this bug that nobody would notice until the complaints came back.
 *
 * Idempotent on purpose. Unsubscribing twice is not an error, and telling
 * somebody their second attempt failed would be the worst possible moment to
 * do it.
 */
export async function recordUnsubscribe(token: string): Promise<{ found: boolean }> {
  const lead = await prisma.lead
    .findUnique({ where: { shareToken: token }, select: { id: true, doNotContact: true } })
    .catch(() => null);

  if (!lead) return { found: false };
  if (lead.doNotContact) return { found: true };

  await prisma.lead
    .update({
      where: { id: lead.id },
      data: { doNotContact: true, doNotContactReason: 'Unsubscribed from a follow-up email.' },
    })
    .catch((e) => console.error('Unsubscribe not recorded:', e));

  // On the timeline rather than only in a column, so a rep who wonders why
  // this lead went quiet sees the answer in the same place as everything else
  // that happened to them.
  await prisma.leadActivity
    .create({
      data: {
        leadId: lead.id,
        type: 'note',
        content: 'Unsubscribed from follow-up emails. Do not contact by email.',
      },
    })
    .catch((e) => console.error('Unsubscribe activity not written:', e));

  return { found: true };
}
