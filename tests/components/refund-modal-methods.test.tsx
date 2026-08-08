import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InvoiceActions, type ActionableInvoice } from '@/components/admin/InvoiceActions';

/**
 * Offering a refund method that is going to be refused.
 *
 * A card refund needs a charge to reverse. The route finds one by reading the
 * Checkout Session off a Payment row, so an invoice whose money arrived by
 * bank transfer — recorded by hand, or part paid — has nothing for Stripe to
 * touch, and the route says so with a 409.
 *
 * It said so after the amount, the reason and the button. That is the third
 * time this component has offered an action it was always going to refuse:
 * Send on an instalment, Cancel on a part-paid invoice, and now this. The
 * cost is higher here, because the person reading the refusal is mid-refund
 * on a cancelled project with a client waiting, and the error names Stripe
 * rather than naming the thing they should have picked.
 *
 * Withheld on `false`, not on absent: a payload written before the flag
 * existed knows nothing, and hiding the right answer on a guess is worse than
 * the refusal this replaces.
 */

const invoice = (over: Partial<ActionableInvoice> = {}): ActionableInvoice => ({
  id: 'invoice_1',
  number: 'BM-2026-0031',
  description: 'Brand photography day',
  amountCents: 180_000,
  status: 'paid',
  refundedCents: 0,
  sentToEmail: 'owner@vellum.test',
  ...over,
});

function openRefund(over: Partial<ActionableInvoice> = {}) {
  render(<InvoiceActions invoice={invoice(over)} onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Refund' }));
}

const cardOption = () => screen.getByRole('radio', { name: /original card/i });

describe('the refund method on an invoice that never saw a card', () => {
  it('does not offer to reverse a charge that does not exist', () => {
    openRefund({ hasCardPayment: false });

    expect(cardOption()).toBeDisabled();
    expect(screen.getByText(/no card payment on this invoice/i)).toBeInTheDocument();
  });

  it('starts on the method that will actually work', () => {
    openRefund({ hasCardPayment: false });

    expect(screen.getByRole('radio', { name: /outside Stripe/i })).toBeChecked();
    expect(cardOption()).not.toBeChecked();
  });

  it('leaves the card option alone when the money did come through Stripe', () => {
    openRefund({ hasCardPayment: true });

    expect(cardOption()).toBeEnabled();
    expect(cardOption()).toBeChecked();
  });

  /* An older payload knows nothing about this. Guessing "no card" there would
     hide the only method that moves money on an invoice that was paid by one. */
  it('keeps offering it when nothing is known either way', () => {
    openRefund({});

    expect(cardOption()).toBeEnabled();
    expect(cardOption()).toBeChecked();
  });
});

/**
 * The other half: a part-paid invoice caps the refund at what came in, which
 * is a number the box had no way of explaining. It showed the invoice's face
 * value, refused anything above $900 of it, and never said where $900 came
 * from.
 */
describe('the ceiling on a part-paid invoice', () => {
  const partPaid = {
    status: 'open',
    grossReceivedCents: 90_000,
    receivedCents: 90_000,
    hasCardPayment: false,
  };

  it('says how much of the invoice actually came in', () => {
    openRefund(partPaid);

    expect(screen.getByText(/\$900 of it came in/)).toBeInTheDocument();
  });

  it('offers to give back what came in, not what was asked for', () => {
    openRefund(partPaid);

    expect(screen.getByDisplayValue('900.00')).toBeInTheDocument();
  });

  it('refuses more than that, before anything is sent', () => {
    openRefund(partPaid);

    fireEvent.change(screen.getByDisplayValue('900.00'), { target: { value: '1800' } });

    expect(screen.getByText(/the most you can refund is \$900/i)).toBeInTheDocument();
  });

  /* A settled invoice reads off its own face value, exactly as before. */
  it('leaves a paid invoice reading the whole amount', () => {
    openRefund({ hasCardPayment: true });

    expect(screen.getByDisplayValue('1800.00')).toBeInTheDocument();
    expect(screen.queryByText(/of it came in/)).not.toBeInTheDocument();
  });
});
