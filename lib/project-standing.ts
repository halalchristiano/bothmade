import { prisma } from '@/lib/prisma';
import { OWED_INSTALMENT_STATUSES } from '@/lib/instalments';
import { formatCentsExact } from '@/lib/pricing';

/**
 * Where the client stands once this payment has landed, in one sentence.
 *
 * Read from the instalment rows after the settling transaction has committed,
 * so it reflects what was just paid rather than what was owed a moment ago.
 *
 * Only ever 'owing' or 'settled': a project always has a standing, one way or
 * the other. The receipt's third state, 'unrelated', is not this function's to
 * return — it belongs to one-off charges, which never consult the schedule.
 */
export async function projectStanding(
  projectId: string
): Promise<{ kind: 'owing'; label: string } | { kind: 'settled' }> {
  const open = await prisma.instalment.findMany({
    // Not `not: 'paid'` — that counts voided rows as owed. See
    // OWED_INSTALMENT_STATUSES for what it cost the last time.
    where: { projectId, status: { in: OWED_INSTALMENT_STATUSES } },
    orderBy: { index: 'asc' },
    select: { label: true, amountCents: true },
  });
  if (open.length === 0) return { kind: 'settled' };

  const total = open.reduce((sum, row) => sum + row.amountCents, 0);
  return {
    kind: 'owing',
    label: `${open.length} payment${open.length === 1 ? '' : 's'} still to come, totalling ${formatCentsExact(
      total
    )} — the next is ${open[0].label}. We invoice each one when it falls due, so there is nothing to do now.`,
  };
}
