import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The billing page had no test at all.
 *
 * Everything shipped here over the last few rounds is pinned at the lib and
 * route level — the ageing rule, the filter buckets, the blocker sentences,
 * the totals arithmetic — and every one of those could be perfect while the
 * page rendered none of it. The lib says an invoice open thirty-one days and
 * chased three times reads "open 31 days · sent 3×"; nothing checked that the
 * sentence reached a screen.
 *
 * So this renders the real page against a stubbed API and reads it the way a
 * person would: the money at the top, whether a row says it has been chased,
 * what the dead Charge button is waiting for, and whether an empty bucket
 * explains itself.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/admin/billing',
  useSearchParams: () => new URLSearchParams(),
}));

// The refund estimator is a whole panel with its own endpoint and its own
// tests; it is not what this file is about.
vi.mock('@/components/admin/RefundEstimate', () => ({ RefundEstimate: () => null }));

const BillingPage = (await import('@/app/admin/billing/page')).default;

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const CHASED = {
  id: 'inv_1',
  number: 'BM-2026-0031',
  description: 'Second round of homepage design',
  amountCents: 120_000,
  status: 'open',
  pdfUrl: 'https://blob.test/a.pdf',
  paymentUrl: 'https://pay.test/a',
  sentToEmail: 'dana@northgate.test',
  sendCount: 3,
  lastSentAt: day(4),
  refundedCents: 0,
  refundMethod: null,
  refundReason: null,
  voidReason: null,
  createdAt: day(31),
  lineItems: [
    { label: 'Design round', priceCents: 90_000 },
    { label: 'Copywriting', priceCents: 30_000 },
  ],
  client: { id: 'c1', company: 'Northgate Dental', email: 'dana@northgate.test' },
  project: { id: 'p1', name: 'Northgate — Website' },
  issuedBy: { name: 'Evan', email: 'evan@bothmade.studio' },
};

const INSTALMENT = {
  ...CHASED,
  id: 'inv_2',
  number: 'BM-2026-0030',
  description: 'Payment 2 of 3 — Northgate Website',
  amountCents: 600_000,
  sendCount: 1,
  createdAt: day(9),
  isInstalment: true,
};

const NEVER_SENT = {
  ...CHASED,
  id: 'inv_3',
  number: 'BM-2026-0029',
  description: 'Retainer — March',
  amountCents: 90_000,
  pdfUrl: null,
  paymentUrl: null,
  sentToEmail: null,
  sendCount: 0,
  lastSentAt: null,
  createdAt: day(6),
  lineItems: [{ label: 'Retainer', priceCents: 90_000 }],
};

const TOTALS = {
  outstandingCents: 475_000,
  outstandingCount: 3,
  paidCents: 1_284_000,
  paidCount: 9,
  refundedCents: 19_000,
  creditedCents: 60_000,
  count: 13,
};

let invoices: unknown[] = [];

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/admin/billing/charges')
        ? { success: true, invoices, totals: TOTALS, matching: invoices.length, truncated: false }
        : { success: true, customers: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
}

beforeEach(() => {
  invoices = [CHASED, NEVER_SENT];
  stubFetch();
});

describe('the money at the top', () => {
  it('shows what is outstanding, what is paid, and what actually went back', async () => {
    render(<BillingPage />);

    expect(await screen.findByText('$4,750')).toBeTruthy();
    expect(screen.getByText('$12,840')).toBeTruthy();

    /*
     * A credit is not a refund — the cash is still here. These were one
     * figure until recently, which overstated what had left the account on
     * the page people reconcile against a bank statement.
     */
    expect(screen.getByText('$190')).toBeTruthy();
    expect(screen.getByText('+ $600 credited')).toBeTruthy();
  });
});

describe('a row that is still owed', () => {
  it('says how long it has sat there and whether anybody has asked', async () => {
    render(<BillingPage />);

    // Nineteen days with three reminders is a client ignoring you; nineteen
    // with none is an invoice nobody remembered to send. Both halves, or the
    // line answers neither question.
    expect(await screen.findByText('open 31 days · sent 3×')).toBeTruthy();
    expect(screen.getByText('open 6 days · never emailed')).toBeTruthy();
  });

  it('offers the actions that only make sense on an unpaid invoice', async () => {
    render(<BillingPage />);

    expect(await screen.findByRole('button', { name: /Send again/ })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Mark paid/ }).length).toBe(2);
  });

  /*
   * "What's the twelve hundred for" used to mean opening the PDF. The lines
   * were in the payload the whole time and nothing rendered them.
   */
  it('breaks the total down, and says who raised it', async () => {
    render(<BillingPage />);

    const toggle = await screen.findByRole('button', { name: '2 lines' });
    await userEvent.click(toggle);

    expect(screen.getByText('Design round')).toBeTruthy();
    expect(screen.getByText('Copywriting')).toBeTruthy();
    expect(screen.getByText(/Raised by Evan/)).toBeTruthy();
  });

  it('keeps the breakdown shut until it is asked for', async () => {
    render(<BillingPage />);

    await screen.findByRole('button', { name: '2 lines' });
    expect(screen.queryByText('Design round')).toBeNull();
  });
});

describe('the charge form', () => {
  /*
   * Five things can stop a charge and the server writes a good sentence for
   * each, but the button that would have fetched them is the thing switched
   * off. A disabled control with no reason reads as a broken page.
   */
  it('says what it is waiting for instead of going quietly dead', async () => {
    render(<BillingPage />);

    expect(await screen.findByText('Pick the customer this is for.')).toBeTruthy();
    const charge = screen.getByRole('button', { name: /Charge/ });
    expect(charge.hasAttribute('disabled')).toBe(true);
  });
});

describe('an empty bucket', () => {
  /*
   * Nothing outstanding is good news, and reads as a broken page unless the
   * screen says which of the two it is.
   */
  it('explains itself rather than looking broken', async () => {
    invoices = [];
    stubFetch();

    render(<BillingPage />);

    expect(await screen.findByText(/No invoices have been raised yet/)).toBeTruthy();
  });
});

describe('the pay link', () => {
  it('is copied by a button that says whether it worked', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<BillingPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Copy pay link' }));

    expect(writeText).toHaveBeenCalledWith('https://pay.test/a');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  });
});

describe('the sheet as a whole', () => {
  it('opens on what needs doing, not on what happened most recently', async () => {
    render(<BillingPage />);

    await screen.findByText('open 31 days · sent 3×');

    const calls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
    expect(calls.some((url) => url.includes('/api/admin/billing/charges?status=open'))).toBe(true);

    const chase = screen.getByRole('button', { name: 'Needs chasing' });
    expect(within(chase.parentElement as HTMLElement).getAllByRole('button').length).toBe(4);
  });
});

describe('finding one invoice', () => {
  /*
   * The box used to filter what was already on screen. Past a hundred
   * invoices that answers about the recent ones and says "nothing matches"
   * about the one from March — which is what somebody hunts for when a client
   * rings about an old unpaid bill.
   */
  it('asks the server, rather than filtering the page', async () => {
    render(<BillingPage />);
    await screen.findByText('open 31 days · sent 3×');

    await userEvent.type(
      screen.getByPlaceholderText(/Find by company, invoice number/),
      'northgate'
    );

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
      expect(calls.some((url) => url.includes('q=northgate'))).toBe(true);
    });
  });

  it('keeps the bucket it was searched inside', async () => {
    render(<BillingPage />);
    await screen.findByText('open 31 days · sent 3×');

    await userEvent.type(screen.getByPlaceholderText(/Find by company/), 'acme');

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
      expect(calls.some((url) => url.includes('status=open') && url.includes('q=acme'))).toBe(true);
    });
  });

  it('says which bucket came up empty rather than looking broken', async () => {
    render(<BillingPage />);
    await screen.findByText('open 31 days · sent 3×');

    invoices = [];
    stubFetch();
    await userEvent.type(screen.getByPlaceholderText(/Find by company/), 'nobody');

    expect(
      await screen.findByText(/Nothing in needs chasing matches/, {}, { timeout: 3000 })
    ).toBeTruthy();
    // And the box you would clear it in is still there. Gated on the rows
    // that came back, it unmounted itself and the only way out was a reload.
    expect(screen.getByPlaceholderText(/Find by company/)).toBeTruthy();
  });
});

describe('a scheduled payment in the list', () => {
  /*
   * Sent from the project, which holds the checkout session that pays it.
   * Offering Send here and refusing after two clicks is worse than not
   * offering it — and a disabled button with no onward route just sends
   * somebody hunting through the admin for where you can.
   */
  it('points at the schedule instead of offering a send that refuses', async () => {
    invoices = [INSTALMENT];
    stubFetch();

    render(<BillingPage />);

    const link = await screen.findByRole('link', { name: /Send from schedule/ });
    expect(link.getAttribute('href')).toBe('/admin/projects/p1');
    expect(screen.queryByRole('button', { name: /Send again/ })).toBeNull();
  });

  /*
   * Marking one paid by hand stays: that route settles the instalment row
   * alongside the invoice, so it is the one manual action that works on both.
   */
  it('still lets a transfer against it be recorded', async () => {
    invoices = [INSTALMENT];
    stubFetch();

    render(<BillingPage />);

    expect(await screen.findByRole('button', { name: /Mark paid/ })).toBeTruthy();
  });
});
