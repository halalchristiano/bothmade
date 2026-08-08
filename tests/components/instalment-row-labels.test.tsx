import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InstalmentPanel } from '@/components/admin/InstalmentPanel';

/**
 * The row you read before billing somebody.
 *
 * This panel sits in the project page's left column, roughly a third the
 * width it was drawn against. The Send button is `shrink-0` and the text
 * beside it truncates, so a button labelled "Send Payment 2 of 3" pushed the
 * row down to "Pay…" over "On d…" — the payment's name and its trigger, the
 * two things worth checking before an invoice goes to a client, squeezed out
 * by a button repeating one of them.
 *
 * The visible label is now just the verb. The full name moved to the
 * accessible label, which costs no width and is where it does the most good:
 * three rows of "Send" are indistinguishable to anyone not looking at them.
 */

const INSTALMENTS = [
  { id: 'i_0', index: 0, label: 'Deposit', amountCents: 483_333, percent: 33, trigger: 'signing',
    status: 'paid', dueAt: null, invoicedAt: null, paidAt: new Date().toISOString(),
    invoiceNumber: 'BM-2026-0021', stripeSessionId: null, paymentUrl: null, emailSentAt: null,
    payUrl: 'http://test/pay/i_0' },
  { id: 'i_1', index: 1, label: 'Payment 2 of 3', amountCents: 483_333, percent: 33,
    trigger: 'design-approval', status: 'scheduled', dueAt: null, invoicedAt: null, paidAt: null,
    invoiceNumber: null, stripeSessionId: null, paymentUrl: null, emailSentAt: null,
    payUrl: 'http://test/pay/i_1' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, instalments: INSTALMENTS }) }) as unknown as Response)
  );
});

describe('the send control on the next payment', () => {
  it('keeps its visible label short, so the row it sits in stays readable', async () => {
    render(<InstalmentPanel projectId="p_1" />);

    const button = await screen.findByRole('button', { name: 'Send Payment 2 of 3' });
    expect(button.textContent).toBe('Send');
  });

  it('still says which payment it sends, for anyone not looking at it', async () => {
    render(<InstalmentPanel projectId="p_1" />);

    // Found by its accessible name, which is the whole point — the visible
    // text alone would be three identical "Send"s on a longer schedule.
    expect(await screen.findByRole('button', { name: 'Send Payment 2 of 3' })).toBeInTheDocument();
  });

  it('leaves the payment name and its trigger in the row itself', async () => {
    render(<InstalmentPanel projectId="p_1" />);

    expect(await screen.findByText(/Payment 2 of 3/)).toBeInTheDocument();
    expect(screen.getByText(/design approval/i)).toBeInTheDocument();
  });

  it('names a re-send as a re-send', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          instalments: [INSTALMENTS[0], { ...INSTALMENTS[1], status: 'due', invoiceNumber: 'BM-2026-0031' }],
        }),
      }) as unknown as Response)
    );

    render(<InstalmentPanel projectId="p_1" />);

    const button = await screen.findByRole('button', { name: 'Re-send Payment 2 of 3' });
    expect(button.textContent).toBe('Re-send');
  });
});
