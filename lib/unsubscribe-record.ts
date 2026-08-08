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
export async function recordUnsubscribe(
  token: string
): Promise<{ found: boolean; recorded: boolean }> {
  const lead = await prisma.lead
    .findUnique({ where: { shareToken: token }, select: { id: true, doNotContact: true } })
    .catch(() => null);

  if (!lead) return { found: false, recorded: false };
  if (lead.doNotContact) return { found: true, recorded: true };

  /*
   * The one write that has to have happened.
   *
   * This used to swallow a failure into a console line and carry on, and the
   * two callers both ignored the answer, so a failed write produced a page
   * reading "That's done — we'll stop." while the column still said we could
   * email them. The sequence carried on, the recipient watched us ignore a
   * request they had made and been thanked for, and the only record of it was
   * a server log nobody reads. Of everything in this codebase that is allowed
   * to be best-effort, an unsubscribe is not.
   */
  const recorded = await prisma.lead
    .update({
      where: { id: lead.id },
      data: { doNotContact: true, doNotContactReason: 'Unsubscribed from a follow-up email.' },
    })
    .then(() => true)
    .catch((e) => {
      console.error('Unsubscribe not recorded:', e);
      return false;
    });

  // And the note only if it did. Writing it regardless left the timeline
  // saying "Do not contact by email" beside a lead the sender was still free
  // to email — a rep reading the one place this is meant to be explained
  // would have been told the opposite of what was true.
  if (!recorded) return { found: true, recorded: false };

  // On the timeline rather than only in a column, so a rep who wonders why
  // this lead went quiet sees the answer in the same place as everything else
  // that happened to them.
  await prisma.leadActivity
    .create({
      data: {
        leadId: lead.id,
        type: 'note',
        content: 'Unsubscribed from follow-up emails. Do not contact by email.',
        // The recipient did this to us. Counting it as work would put the one
        // lead nobody may email again at the top of somebody's column.
        automated: true,
      },
    })
    .catch((e) => console.error('Unsubscribe activity not written:', e));

  return { found: true, recorded: true };
}
