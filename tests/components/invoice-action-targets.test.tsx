import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvoiceActions, type ActionableInvoice } from '@/components/admin/InvoiceActions';

/**
 * The money actions on an invoice row have to be hittable with a thumb.
 *
 * They rendered as bare 11px text and measured 17px tall on a 390px phone —
 * under the 24px WCAG 2.5.8 asks for, and far under what a finger wants. Worse
 * than the size was the pairing: Mark paid and Cancel sat twelve pixels apart
 * on the same line. One settles an invoice, the other voids it, and twelve
 * pixels between them on a touch screen is a money mistake made with a
 * fingertip.
 *
 * The height was fixed from another session while this was being written, by
 * padding the row rather than flooring it — same 25px, and it is what shipped,
 * so this holds that. What that fix did not cover is the pairing, which is the
 * half that turns a small target into a wrong decision.
 *
 * jsdom has no layout engine, so this cannot measure. What it can hold is the
 * contract that produces the measurement. The real numbers were checked in a
 * browser — 17px to 25px, and a 12px gap to 20px — which a unit test could
 * never have seen.
 */

const invoice = (over: Partial<ActionableInvoice> = {}): ActionableInvoice => ({
  id: 'invoice_1',
  number: 'BM-2026-0007',
  description: 'Payment 2 of 3 — Acme Site',
  amountCents: 600_000,
  status: 'open',
  refundedCents: 0,
  sentToEmail: 'client@acme.test',
  sendCount: 1,
  ...over,
});

/** Every control this component renders, whatever the invoice's state. */
const actionButtons = () =>
  screen.getAllByRole('button').filter((b) =>
    /send|mark paid|cancel|refund/i.test(b.textContent || '')
  );

/**
 * Send, on an invoice money has already moved against.
 *
 * A resend rebuilds the original demand — the invoice total in the PDF and
 * the email, and a freshly minted fixed-amount pay link if one is missing.
 * The route refuses it now; this is the row not offering it in the first
 * place, which is the same lesson Send-on-an-instalment and Cancel-on-a-
 * part-paid-invoice each taught this file once already.
 */
describe('chasing an invoice that has been part paid', () => {
  const names = () => screen.getAllByRole('button').map((b) => b.textContent?.trim());

  it('offers no Send on one with the client\'s money in it', () => {
    render(
      <InvoiceActions invoice={invoice({ grossReceivedCents: 60_000, receivedCents: 60_000 })} onDone={vi.fn()} />
    );

    expect(names()).not.toContain('Send');
    expect(names()).not.toContain('Send again');
  });

  it('offers no Send on one we have refunded either', () => {
    render(<InvoiceActions invoice={invoice({ refundedCents: 60_000, grossReceivedCents: 60_000 })} onDone={vi.fn()} />);

    expect(names()).not.toContain('Send');
    expect(names()).not.toContain('Send again');
  });

  /* The ordinary open invoice still gets chased — a rule that hides
     everything is not the rule. */
  it('still offers it on one nothing has come in against', () => {
    render(<InvoiceActions invoice={invoice()} onDone={vi.fn()} />);

    expect(names().join(' ')).toMatch(/Send/);
  });
});

describe('an invoice row on a phone', () => {
  it('pads every action into a real touch target', () => {
    render(<InvoiceActions invoice={invoice()} onDone={vi.fn()} />);

    const buttons = actionButtons();
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(b.className, `"${b.textContent?.trim()}" has no vertical padding`).toMatch(/\bpy-1\b/);
    }
  });

  it('covers a paid invoice too, where Refund is the live one', () => {
    render(<InvoiceActions invoice={invoice({ status: 'paid' })} onDone={vi.fn()} />);

    const buttons = actionButtons();
    expect(buttons.map((b) => b.textContent?.trim())).toContain('Refund');
    for (const b of buttons) expect(b.className).toMatch(/\bpy-1\b/);
  });

  /**
   * The separation is the point, not the pixel value. Settle and void are the
   * two most consequential things on the row and they were adjacent.
   */
  it('holds Cancel away from Mark paid', () => {
    render(<InvoiceActions invoice={invoice()} onDone={vi.fn()} />);

    const cancel = screen.getByRole('button', { name: /cancel/i });
    const markPaid = screen.getByRole('button', { name: /mark paid/i });

    expect(markPaid).toBeInTheDocument();
    expect(cancel.className, 'Cancel sits next to Mark paid with no gap').toMatch(/\bml-2\b/);
  });

  it('renders nothing at all when no action is available', () => {
    const { container } = render(
      <InvoiceActions invoice={invoice({ status: 'void' })} onDone={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
