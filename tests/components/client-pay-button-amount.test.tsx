import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * What the big Pay button on a client's own dashboard says it will take.
 *
 * An instalment can be part paid — a bank transfer arrives against it and the
 * row stays `due`, because the rest genuinely is still owed. Two places on
 * this page already handled that correctly: the schedule row says "$6,000
 * received, thank you — $6,000 left", and the route mints a Stripe checkout
 * for the outstanding amount rather than the face value.
 *
 * The button between them still promised the face value. So a client who had
 * just transferred half was shown two different figures for one payment, and
 * the loud one asked for the whole thing again — which is the version most
 * likely to be believed, and the one most likely to stop them paying at all.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/client/proj_9',
  useParams: () => ({ projectId: 'proj_9' }),
}));

import ProjectPage from '@/app/client/[projectId]/page';

const instalment = (over: Record<string, unknown> = {}) => ({
  id: 'i_2',
  index: 2,
  label: 'Payment 2 of 3',
  amountCents: 1_200_000,
  percent: 33,
  trigger: 'design-approval',
  status: 'due',
  dueAt: null,
  paidAt: null,
  invoiceNumber: 'BM-2026-0031',
  ...over,
});

const PROJECT = {
  id: 'proj_9',
  name: 'Acme — Website',
  status: 'IN_PROGRESS',
  statusStage: 2,
  timeline: '6 weeks',
  baseService: 'website-build',
  addOns: [],
  totalPrice: 3_600_000,
  amountPaid: 1_200_000,
  balanceDue: 2_400_000,
  payments: [],
  invoices: [],
  estimatedCompletionDate: null,
  liveUrl: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
  messages: [],
  updates: [],
  deliverables: [],
  contractUrl: null,
  client: { company: 'Acme Dental', name: 'Acme Dental', email: 'owner@acmedental.test' },
  instalments: [instalment()],
};

/**
 * URL-aware, because the page loads its onboarding questions separately and
 * maps over them unguarded — one blanket response is a crash, not a fixture.
 */
function serve(project: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = String(url).includes('/onboarding')
        ? { success: true, questions: [] }
        : { success: true, project };
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('an instalment nothing has been paid toward', () => {
  it('offers the whole thing', async () => {
    serve(PROJECT);
    render(<ProjectPage />);

    expect(await screen.findByRole('button', { name: /Pay Payment 2 of 3 — \$12,000/ })).toBeInTheDocument();
  });
});

describe('an instalment half of which has already arrived', () => {
  it('asks for what is left, not the face value', async () => {
    serve({ ...PROJECT, instalments: [instalment({ receivedCents: 600_000 })] });
    render(<ProjectPage />);

    const button = await screen.findByRole('button', { name: /Pay the rest of Payment 2 of 3/ });
    expect(button).toHaveTextContent('$6,000');
    expect(button).not.toHaveTextContent('$12,000');
  });

  /*
   * The wording matters as much as the number. "Pay Payment 2 of 3 — $6,000"
   * beside a schedule row reading "$6,000 left" is still two sentences a
   * worried client has to reconcile; saying it is the rest closes that.
   */
  it('says it is the rest, so the smaller number reads as deliberate', async () => {
    serve({ ...PROJECT, instalments: [instalment({ receivedCents: 600_000 })] });
    render(<ProjectPage />);

    expect(await screen.findByRole('button', { name: /the rest of/i })).toBeInTheDocument();
  });

  it('never offers more than the instalment, whatever the ledger says', async () => {
    serve({ ...PROJECT, instalments: [instalment({ receivedCents: 9_900_000 })] });
    render(<ProjectPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Pay the rest of/ })).toBeTruthy());
    expect(screen.getByRole('button', { name: /Pay the rest of/ })).toHaveTextContent('$0');
  });
});

describe('a legacy project with no schedule', () => {
  it('falls back to the whole balance', async () => {
    serve({ ...PROJECT, instalments: [] });
    render(<ProjectPage />);

    expect(await screen.findByRole('button', { name: /Pay Balance — \$24,000/ })).toBeInTheDocument();
  });
});
