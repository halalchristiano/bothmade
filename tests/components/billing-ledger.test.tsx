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

const PART_PAID = {
  ...CHASED,
  id: 'inv_4',
  number: 'BM-2026-0027',
  description: 'Brand photography day',
  amountCents: 180_000,
  createdAt: day(22),
  lineItems: [{ label: 'Photography day', priceCents: 180_000 }],
  receivedCents: 90_000,
  grossReceivedCents: 90_000,
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

describe('an invoice with money already against it', () => {
  const PART_PAID = { ...CHASED, id: 'inv_7', number: 'BM-2026-0027', receivedCents: 60_000 };

  /*
   * Cancelling writes off a payment that really happened. Offering the button
   * and refusing after two clicks is the pattern this page removed once
   * already, for Send on instalments.
   */
  it('does not offer to cancel it', async () => {
    invoices = [PART_PAID];
    stubFetch();

    render(<BillingPage />);

    await screen.findByText(/open 31 days/);
    // Exactly "Cancel" — the "Cancelled" filter chip is a button too, and a
    // loose match finds it and proves nothing.
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    // Recording the rest is still the point of the row.
    expect(screen.getByRole('button', { name: /Mark paid/ })).toBeTruthy();
  });

  it('says part paid on the badge, not just open', async () => {
    invoices = [PART_PAID];
    stubFetch();

    render(<BillingPage />);

    // "Open" is what the badge said while an invoice was all-or-nothing. On a
    // row with half a client's money against it, that is a different thing to
    // chase and a different thing to say on the phone.
    expect(await screen.findByText('Part paid')).toBeTruthy();
    expect(screen.queryByText('Open')).toBeNull();
  });

  it('says how much is left, which is the figure that decides what to do next', async () => {
    invoices = [PART_PAID];
    stubFetch();

    render(<BillingPage />);

    expect(await screen.findByText(/\$600 left of \$1,200/)).toBeTruthy();
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

/**
 * Raising a charge used to end in one green sentence and a dead end. The
 * response has always carried the pay link and the filed PDF and both were
 * thrown away — so the next move was scrolling the ledger to find the row
 * you had just created, to get at the link you wanted to paste into a
 * message.
 */
describe('after a charge is raised', () => {
  const RAISED = {
    success: true,
    invoice: {
      number: 'BM-2026-0032',
      amountCents: 120_000,
      paymentUrl: 'https://pay.test/new',
      pdfUrl: 'https://blob.test/new.pdf',
      sentToEmail: 'dana@northgate.test',
      client: { company: 'Northgate Dental' },
    },
    clientDelivered: true,
    warnings: [],
  };

  function stubRaise(body: Record<string, unknown> = RAISED, ok = true) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST') {
          return new Response(JSON.stringify(body), {
            status: ok ? 201 : 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const payload = url.includes('/api/admin/billing/charges')
          ? { success: true, invoices, totals: TOTALS, matching: invoices.length, truncated: false }
          : {
              success: true,
              customers: [
                {
                  id: 'c1',
                  company: 'Northgate Dental',
                  contactName: 'Dana',
                  email: 'dana@northgate.test',
                  projects: [{ id: 'p1', name: 'Northgate — Website', status: 'build', totalPrice: 1 }],
                },
              ],
            };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
  }

  async function raise() {
    render(<BillingPage />);
    await userEvent.type(screen.getByPlaceholderText(/Search by company/), 'north');
    // By role, not by text: the ledger row shows the same company name, and
    // the row's meta line puts it in its own element so an exact text match
    // now finds two.
    await userEvent.click(await screen.findByRole('button', { name: /Northgate Dental/ }));
    await userEvent.type(screen.getByPlaceholderText(/e\.g\. Extra round/), 'Third design round');
    await userEvent.type(screen.getAllByPlaceholderText('Description')[0], 'Design round');
    await userEvent.type(screen.getByPlaceholderText('0.00'), '1200');
    await userEvent.click(screen.getByRole('button', { name: /^Charge / }));
  }

  /*
   * These were five loose inputs and a button with an onClick, so Enter did
   * nothing in any of them — and on a phone the keyboard's return key, the
   * one thing under your thumb after typing an amount, was dead across the
   * whole form. Safe because the studio-wide send guard sits in front of the
   * route rather than the button: return opens the confirmation, it does not
   * put anything in an inbox.
   */
  it('can be raised from the keyboard', async () => {
    stubRaise();
    render(<BillingPage />);
    await userEvent.type(screen.getByPlaceholderText(/Search by company/), 'north');
    await userEvent.click(await screen.findByRole('button', { name: /Northgate Dental/ }));
    await userEvent.type(screen.getByPlaceholderText(/e\.g\. Extra round/), 'Third design round');
    await userEvent.type(screen.getAllByPlaceholderText('Description')[0], 'Design round');
    await userEvent.type(screen.getByPlaceholderText('0.00'), '1200{Enter}');

    expect(await screen.findByRole('status', { name: 'Charge raised' })).toBeTruthy();
  });

  /* Adding a line is not raising a charge. */
  it('does not raise anything when a helper button inside the form is pressed', async () => {
    stubRaise();
    render(<BillingPage />);
    await userEvent.type(screen.getByPlaceholderText(/Search by company/), 'north');
    await userEvent.click(await screen.findByRole('button', { name: /Northgate Dental/ }));
    await userEvent.click(screen.getByRole('button', { name: '+ Add line' }));

    expect(screen.queryByRole('status', { name: 'Charge raised' })).toBeNull();
    expect(screen.getAllByPlaceholderText('Description')).toHaveLength(2);
  });

  it('hands over the pay link and the invoice, rather than a number to go hunting with', async () => {
    stubRaise();
    await raise();

    const box = within(await screen.findByRole('status', { name: 'Charge raised' }));
    expect(box.getByText(/BM-2026-0032 raised for/)).toBeTruthy();
    expect(box.getByRole('button', { name: 'Copy pay link' })).toBeTruthy();
    expect(box.getByRole('link', { name: 'Open the invoice' }).getAttribute('href')).toBe(
      'https://blob.test/new.pdf'
    );
  });

  /*
   * A send that failed reports a warning, and the headline must not contradict
   * it. "Emailed to dana@" above "the client's copy didn't send" is the pair
   * that gets an invoice forgotten about.
   */
  it('does not claim it was emailed when the send failed', async () => {
    stubRaise({
      ...RAISED,
      clientDelivered: false,
      warnings: ["The client's copy didn't send: mailbox full"],
    });
    await raise();

    const box = within(await screen.findByRole('status', { name: 'Charge raised' }));
    expect(box.getByText(/not emailed/)).toBeTruthy();
    expect(box.getByText(/mailbox full/)).toBeTruthy();
  });

  it('can be dismissed rather than sitting there forever', async () => {
    stubRaise();
    await raise();

    await screen.findByRole('status', { name: 'Charge raised' });
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('status', { name: 'Charge raised' })).toBeNull();
  });
});


/**
 * The row that can no longer be chased, and what replaces the chase.
 *
 * A resend rebuilds the ORIGINAL demand — the invoice total in the PDF and
 * the email, and a fixed-amount pay link for it — so a part-paid invoice
 * cannot be sent again without asking for the full $1,800 a second time. The
 * right move is a new charge for what is actually left.
 *
 * Which was true before this button existed and took eight steps: read the
 * row, scroll up, search the client by name, pick the project, retype a
 * description, work out the difference, type it in. Every one of those is a
 * chance to charge the wrong number to the wrong project.
 */
describe('charging the balance of a part-paid invoice', () => {
  beforeEach(() => {
    invoices = [PART_PAID];
    stubFetch();
  });

  it('offers the remaining amount as the next move, not a dead end', async () => {
    render(<BillingPage />);

    expect(await screen.findByRole('button', { name: 'Charge the $900 left' })).toBeTruthy();
    // Sending it again would re-demand the whole $1,800.
    expect(screen.queryByRole('button', { name: /^Send/ })).toBeNull();
  });

  it('fills the form with the client, the project and the difference', async () => {
    const user = userEvent.setup();
    render(<BillingPage />);

    await user.click(await screen.findByRole('button', { name: 'Charge the $900 left' }));

    // The customer is chosen, so the row's own "clear this customer" control
    // is on screen — the search box alone never has one.
    expect(screen.getByRole('button', { name: 'Choose a different customer' })).toBeTruthy();
    expect(screen.getByDisplayValue('Balance of BM-2026-0027 — Brand photography day')).toBeTruthy();
    expect(screen.getByDisplayValue('900.00')).toBeTruthy();
    // The arithmetic is done, so the button is armed with the right figure.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Charge \$900/ })).toBeTruthy()
    );
  });

  /* It fills the form; it does not raise anything. The wording, the amount
     and whether the client is emailed are all still somebody's to decide. */
  it('raises nothing by itself', async () => {
    const user = userEvent.setup();
    render(<BillingPage />);

    await user.click(await screen.findByRole('button', { name: 'Charge the $900 left' }));

    const posts = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('leaves an invoice nothing has come in against alone', async () => {
    invoices = [CHASED];
    stubFetch();
    render(<BillingPage />);

    await screen.findByText('open 31 days · sent 3×');
    expect(screen.queryByRole('button', { name: /Charge the .* left/ })).toBeNull();
  });
});


/**
 * An invoice that took more than it asked for.
 *
 * Money arrives by transfer, then the client's original pay link — a
 * fixed-amount link for the WHOLE invoice — takes it again on top. Both are
 * real payments, the invoice reads "Paid", and it is: it is also holding $900
 * of somebody else's money, which nothing on the page said.
 */
describe('an invoice with more money on it than it asked for', () => {
  beforeEach(() => {
    invoices = [
      {
        ...PART_PAID,
        status: 'paid',
        receivedCents: 270_000,
        grossReceivedCents: 270_000,
      },
    ];
    stubFetch();
  });

  it('says how much is over, rather than only that it is paid', async () => {
    render(<BillingPage />);

    expect(await screen.findByText('$900 overpaid')).toBeTruthy();
  });

  /* Refund is what returns it, so the row has to be offering one. */
  it('offers the action that gives it back', async () => {
    render(<BillingPage />);

    expect(await screen.findByRole('button', { name: 'Refund' })).toBeTruthy();
  });

  it('says nothing on an invoice paid exactly once', async () => {
    invoices = [{ ...PART_PAID, status: 'paid', receivedCents: 180_000, grossReceivedCents: 180_000 }];
    stubFetch();
    render(<BillingPage />);

    await screen.findByRole('button', { name: 'Refund' });
    expect(screen.queryByText(/overpaid/)).toBeNull();
  });
});


/**
 * The hundred-and-first invoice.
 *
 * The list stopped at a hundred and said so, which was honest and still left
 * the older rows unreachable from this screen: findable only by remembering
 * something to type in the box, which is precisely what somebody hunting an
 * old unpaid invoice does not have.
 */
describe('reaching past the first hundred', () => {
  const page2 = { ...CHASED, id: 'inv_9', number: 'BM-2025-0004', description: 'Last winter' };

  function stubPaged() {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (!url.includes('/api/admin/billing/charges')) {
          return new Response(JSON.stringify({ success: true, customers: [] }), { status: 200 });
        }
        const second = url.includes('before=');
        call += 1;
        return new Response(
          JSON.stringify({
            success: true,
            invoices: second ? [page2] : [CHASED],
            totals: TOTALS,
            matching: 140,
            truncated: !second,
            nextCursor: second ? null : '2026-03-16T10:00:00.000Z_inv_1',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return () => call;
  }

  it('offers to show the rest, and says how many', async () => {
    stubPaged();
    render(<BillingPage />);

    expect(await screen.findByRole('button', { name: 'Show 100 more' })).toBeTruthy();
  });

  it('adds the next page rather than replacing what is on screen', async () => {
    const user = userEvent.setup();
    stubPaged();
    render(<BillingPage />);

    await user.click(await screen.findByRole('button', { name: 'Show 100 more' }));

    await waitFor(() => expect(screen.getByText('Last winter')).toBeTruthy());
    // The first page is still there — this is "more", not "instead".
    expect(screen.getByText('Second round of homepage design')).toBeTruthy();
  });

  it('asks the server to resume after the last row, not to skip a count', async () => {
    const user = userEvent.setup();
    stubPaged();
    render(<BillingPage />);

    await user.click(await screen.findByRole('button', { name: 'Show 100 more' }));

    await waitFor(() => {
      const asked = vi.mocked(fetch).mock.calls.map(([u]) => String(u));
      expect(asked.some((u) => u.includes('before=2026-03-16T10%3A00%3A00.000Z_inv_1'))).toBe(true);
      expect(asked.some((u) => u.includes('offset=') || u.includes('skip='))).toBe(false);
    });
  });

  it('stops offering it once the list is complete', async () => {
    const user = userEvent.setup();
    stubPaged();
    render(<BillingPage />);

    await user.click(await screen.findByRole('button', { name: 'Show 100 more' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /Show .* more/ })).toBeNull());
  });

  it('offers nothing when everything already fits', async () => {
    invoices = [CHASED];
    stubFetch();
    render(<BillingPage />);

    await screen.findByText('open 31 days · sent 3×');
    expect(screen.queryByRole('button', { name: /Show .* more/ })).toBeNull();
  });
});


/* The sentence under a truncated list has to match the order it is in, or
   it describes a different hundred rows than the ones on screen. */
describe('what the truncation sentence says about the chase list', () => {
  it('calls them the longest outstanding, not the most recent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes('/api/admin/billing/charges')
          ? new Response(
              JSON.stringify({
                success: true,
                invoices: [CHASED],
                totals: TOTALS,
                matching: 140,
                truncated: true,
                nextCursor: 'c',
                oldestFirst: true,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          : new Response(JSON.stringify({ success: true, customers: [] }), { status: 200 })
      )
    );
    render(<BillingPage />);

    expect(await screen.findByText(/longest outstanding of 140 matching/)).toBeTruthy();
    // And the card's own caption, which is the thing read first and was
    // still promising the opposite order.
    expect(screen.getByText(/longest outstanding first/)).toBeTruthy();
  });

  it('says newest first on a history', async () => {
    invoices = [CHASED];
    stubFetch();
    render(<BillingPage />);

    expect(await screen.findByText(/newest first/)).toBeTruthy();
  });
});


/**
 * A response that arrives after the question changed.
 *
 * "Show more" appends. Every other load replaces. Nothing told the two
 * apart in flight, so pressing Show more and then switching bucket — which
 * is exactly what somebody does when the extra rows are not what they
 * wanted — appended page two of Needs chasing onto the Paid list. Cancelled
 * invoices under a Paid heading, on the screen used to reconcile against a
 * bank statement.
 *
 * The plain loads race each other the same way: two filter presses in quick
 * succession settle in whatever order the network returns them, and the
 * slower one wins. The chips show the second bucket; the rows are the first.
 */
describe('a load that comes back after the question changed', () => {
  /** Holds each charges request open until the test lets it answer. */
  function stubDeferred() {
    const pending: Array<{ url: string; send: (body: unknown) => void }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (!url.includes('/api/admin/billing/charges')) {
          return new Response(JSON.stringify({ success: true, customers: [] }), { status: 200 });
        }
        return new Promise((resolve) => {
          pending.push({
            url,
            send: (body) =>
              resolve(
                new Response(JSON.stringify(body), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                })
              ),
          });
        });
      })
    );
    return pending;
  }

  const page = (rows: unknown[], over: Record<string, unknown> = {}) => ({
    success: true,
    invoices: rows,
    totals: TOTALS,
    matching: 140,
    truncated: true,
    nextCursor: 'cursor_1',
    oldestFirst: true,
    ...over,
  });

  it('does not append the previous bucket onto the new one', async () => {
    const user = userEvent.setup();
    const pending = stubDeferred();
    render(<BillingPage />);

    // First bucket lands.
    await waitFor(() => expect(pending.length).toBe(1));
    pending[0].send(page([CHASED]));
    await screen.findByText('Second round of homepage design');

    // Show more goes out...
    await user.click(await screen.findByRole('button', { name: /Show .* more/ }));
    await waitFor(() => expect(pending.length).toBe(2));

    // ...and the bucket changes before it comes back.
    await user.click(screen.getByRole('button', { name: 'Paid' }));
    await waitFor(() => expect(pending.length).toBe(3));

    // The new bucket answers first, then the stale page-two arrives.
    pending[2].send(page([{ ...CHASED, id: 'inv_p', description: 'Settled work' }], { oldestFirst: false }));
    await screen.findByText('Settled work');
    pending[1].send(page([{ ...CHASED, id: 'inv_old', description: 'From the chase list' }]));

    await waitFor(() => expect(screen.getByText('Settled work')).toBeTruthy());
    expect(screen.queryByText('From the chase list')).toBeNull();
  });

  it('lets the newest question win when two plain loads race', async () => {
    const user = userEvent.setup();
    const pending = stubDeferred();
    render(<BillingPage />);

    await waitFor(() => expect(pending.length).toBe(1));
    pending[0].send(page([CHASED]));
    await screen.findByText('Second round of homepage design');

    await user.click(screen.getByRole('button', { name: 'Paid' }));
    await waitFor(() => expect(pending.length).toBe(2));
    await user.click(screen.getByRole('button', { name: 'Cancelled' }));
    await waitFor(() => expect(pending.length).toBe(3));

    // Cancelled answers, then the slower Paid response turns up behind it.
    pending[2].send(page([{ ...CHASED, id: 'inv_v', description: 'Cancelled work' }]));
    await screen.findByText('Cancelled work');
    pending[1].send(page([{ ...CHASED, id: 'inv_p', description: 'Settled work' }]));

    await waitFor(() => expect(screen.getByText('Cancelled work')).toBeTruthy());
    expect(screen.queryByText('Settled work')).toBeNull();
  });
});


/**
 * The file an accountant asks for.
 *
 * The link has to carry the same question the list is asking, or the download
 * quietly covers a different set than the screen — which is worse than no
 * download, because the file looks complete and the person checking it
 * against a bank statement is checking the bank statement.
 */
describe('downloading the ledger', () => {
  const href = () =>
    (screen.getByRole('link', { name: /Download .* as CSV/ }) as HTMLAnchorElement).getAttribute('href') || '';

  it('offers every matching invoice, not the page on screen', async () => {
    invoices = [CHASED];
    stubFetch();
    render(<BillingPage />);

    // TOTALS.count is the whole book; `matching` is what the filter selects.
    expect(await screen.findByRole('link', { name: /Download 1 invoice as CSV/ })).toBeTruthy();
  });

  it('carries the bucket the chips are on', async () => {
    const user = userEvent.setup();
    invoices = [CHASED];
    stubFetch();
    render(<BillingPage />);
    await screen.findByText('open 31 days · sent 3×');

    await user.click(screen.getByRole('button', { name: 'Paid' }));

    await waitFor(() => expect(href()).toContain('status=paid'));
  });

  it('carries what was typed in the search box', async () => {
    const user = userEvent.setup();
    invoices = [CHASED];
    stubFetch();
    render(<BillingPage />);
    await screen.findByText('open 31 days · sent 3×');

    await user.type(
      screen.getByPlaceholderText('Find by company, invoice number or what it was for'),
      'northgate'
    );

    await waitFor(() => expect(href()).toContain('q=northgate'));
  });

  it('asks for everything when nothing is selected', async () => {
    const user = userEvent.setup();
    invoices = [CHASED];
    stubFetch();
    render(<BillingPage />);
    await screen.findByText('open 31 days · sent 3×');

    await user.click(screen.getByRole('button', { name: 'All' }));

    await waitFor(() => expect(href()).toBe('/api/admin/billing/charges/export'));
  });
});
