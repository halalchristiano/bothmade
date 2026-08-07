import { describe, expect, it } from 'vitest';
import { composeOnly } from '@/lib/email-preview';
import { sendPaymentReceiptEmail } from '@/lib/email';

/**
 * What a receipt is allowed to claim about what is still owed.
 *
 * The first version of this email took `outstandingLabel: string | null`, and
 * null was quietly doing two different jobs: "nothing left to pay" and "this
 * payment has nothing to do with the schedule". One-off charges for extra
 * work are the second kind — they settle their own invoice and say nothing
 * about the build — so every change-request receipt cheerfully told the
 * client their project was settled in full while two instalments were still
 * outstanding.
 *
 * That is the worst direction for this particular error to run in: a client
 * who believes they have paid in full is one who stops expecting invoices,
 * and the correction arrives as an argument rather than a bill.
 *
 * These compose the real email through the real transport seam, so what is
 * asserted is the message that would actually be transmitted.
 */

const BASE = {
  toEmail: 'owner@example.com',
  contactName: 'Dana Okafor',
  company: 'Okafor Plumbing',
  projectName: 'Okafor Plumbing Site',
  amountLabel: '$4,000.00',
  paidOnLabel: 'August 7, 2026',
  forLabel: 'Payment 2 of 3',
  dashboardUrl: 'https://bothmade.studio/client/project-1',
};

const SETTLED_CLAIM = 'settles the project in full';

async function compose(standing: Parameters<typeof sendPaymentReceiptEmail>[0]['standing']) {
  const [mail] = await composeOnly(() => sendPaymentReceiptEmail({ ...BASE, standing }));
  return mail;
}

describe('the payment receipt', () => {
  it('names what is still to come when the schedule has more in it', async () => {
    const mail = await compose({
      kind: 'owing',
      label: '1 payment still to come, totalling $6,000.00 — the next is Payment 3 of 3.',
      });

    expect(mail.html).toContain('1 payment still to come');
    expect(mail.html).toContain('Payment 3 of 3');
    expect(mail.html).not.toContain(SETTLED_CLAIM);
  });

  it('says the project is settled only when it actually is', async () => {
    const mail = await compose({ kind: 'settled' });

    expect(mail.html).toContain(SETTLED_CLAIM);
  });

  it('claims nothing about the schedule for a one-off charge', async () => {
    // The regression. A change-request invoice is unrelated to the build's
    // three instalments, so it must not pronounce on them in either
    // direction — least of all to say the whole project is paid off.
    const mail = await compose({ kind: 'unrelated' });

    expect(mail.html).not.toContain(SETTLED_CLAIM);
    expect(mail.html).not.toContain('still to come');
  });

  it('reads as a receipt rather than a demand, whatever the standing', async () => {
    for (const standing of [
      { kind: 'owing' as const, label: '1 payment still to come.' },
      { kind: 'settled' as const },
      { kind: 'unrelated' as const },
    ]) {
      const mail = await compose(standing);
      // An email that only states a figure is read as a request for it.
      expect(mail.html).toContain('This is a receipt, not a request for payment');
      expect(mail.subject).toContain('Payment received');
    }
  });

  it('carries the amount, the date and what it settled', async () => {
    const mail = await compose({ kind: 'settled' });

    expect(mail.html).toContain('$4,000.00');
    expect(mail.html).toContain('August 7, 2026');
    expect(mail.html).toContain('Payment 2 of 3');
    expect(mail.to).toEqual(['owner@example.com']);
  });

  it('shows the invoice number when the payment was written to one', async () => {
    const [mail] = await composeOnly(() =>
      sendPaymentReceiptEmail({ ...BASE, standing: { kind: 'settled' }, invoiceNumber: 'INV-2026-0042' })
    );

    expect(mail.html).toContain('INV-2026-0042');
  });
});

/**
 * The rule the receipt, the launch email and its preview all read.
 *
 * Two of those three had it written out longhand as `not: 'paid'`, which
 * silently includes `void` — the status a row takes when a change order
 * removes the scope it was billing for. Naming it once is the fix; this
 * asserts the name still means what the three callers assume, because a
 * change here is invisible at every call site.
 */
describe('what counts as money still owed', () => {
  it('is scheduled and due — never paid, never void', async () => {
    const { OWED_INSTALMENT_STATUSES } = await import('@/lib/instalments');

    expect([...OWED_INSTALMENT_STATUSES].sort()).toEqual(['due', 'scheduled']);
    expect(OWED_INSTALMENT_STATUSES).not.toContain('void');
    expect(OWED_INSTALMENT_STATUSES).not.toContain('paid');
  });

  it('agrees with fullyPaid(), which reads the same rule from the other end', async () => {
    const { OWED_INSTALMENT_STATUSES, fullyPaid } = await import('@/lib/instalments');

    // A project holding none of the owed statuses must read as fully paid,
    // or the launch email and the receipt would contradict each other.
    const settled = [{ status: 'paid' }, { status: 'void' }] as Parameters<typeof fullyPaid>[0];
    expect(fullyPaid(settled)).toBe(true);
    expect(settled.every((row) => !OWED_INSTALMENT_STATUSES.includes(row.status as never))).toBe(true);

    // And one that still holds a scheduled row must not.
    const owing = [{ status: 'paid' }, { status: 'scheduled' }] as Parameters<typeof fullyPaid>[0];
    expect(fullyPaid(owing)).toBe(false);
  });
});
