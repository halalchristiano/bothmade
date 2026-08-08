import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardView } from '@/components/admin/sales/BoardView';

/**
 * Where a card sits in its column after somebody works the lead.
 *
 * THE REQUEST. Log a note, a call or an email against a business and it
 * should go to the top of the column it is already in.
 *
 * It did not, and it half-looked as though it did. A stage column holds
 * several statuses — Talking is contacted, replied and qualified — and status
 * won the sort outright, so a qualified lead could never rise above a
 * contacted one however recently it was touched. Leads sharing a status then
 * kept whatever order the API happened to return, which was `updatedAt desc`:
 * bumped by any write at all, so a bulk tag edit or an importer pass
 * reshuffled the column for work nobody had done.
 *
 * So the order reads the activity timeline — the actual record of notes,
 * calls, emails and dials — and the pipeline reading is still one click away
 * for whoever wants the board to answer "where is everything" instead.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('@/components/admin/LogTouchPopover', () => ({ LogTouchPopover: () => null }));
vi.mock('@/components/admin/LostReasonModal', () => ({ LostReasonModal: () => null }));

const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

/** All three sit in the "Talking" column, at three different statuses. */
const LEADS = [
  {
    id: 'l_contacted', company: 'Alpha Roofing', contactName: null, email: null, phone: null,
    status: 'contacted', estimatedValue: null, dealValue: null, dealValueIsFirm: false,
    hotLead: false, qualifiedAt: null, updatedAt: ago(1),
    lastActivityAt: ago(600), assignedTo: null,
  },
  {
    id: 'l_qualified', company: 'Beta Dental', contactName: null, email: null, phone: null,
    status: 'qualified', estimatedValue: null, dealValue: null, dealValueIsFirm: false,
    hotLead: false, qualifiedAt: null, updatedAt: ago(900),
    // Just worked — the lead the request is about.
    lastActivityAt: ago(2), assignedTo: null,
  },
  {
    id: 'l_replied', company: 'Gamma Vets', contactName: null, email: null, phone: null,
    status: 'replied', estimatedValue: null, dealValue: null, dealValueIsFirm: false,
    hotLead: false, qualifiedAt: null, updatedAt: ago(5),
    lastActivityAt: null, assignedTo: null,
  },
  {
    // Same status as Alpha, worked more recently. Only the tie-break separates them.
    id: 'l_contacted_2', company: 'Delta Plumbing', contactName: null, email: null, phone: null,
    status: 'contacted', estimatedValue: null, dealValue: null, dealValueIsFirm: false,
    hotLead: false, qualifiedAt: null, updatedAt: ago(3),
    lastActivityAt: ago(30), assignedTo: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  try { localStorage.clear(); } catch { /* private browsing */ }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, leads: LEADS }) }) as unknown as Response)
  );
});

/** Company names down the Talking column, top first. */
const talkingOrder = async () => {
  const heading = await screen.findByRole('heading', { name: 'Talking' });
  const column = heading.closest('div')!.parentElement!;
  return within(column)
    .getAllByRole('link')
    .map((a) => a.textContent?.trim())
    .filter((t): t is string => !!t && LEADS.some((l) => t.startsWith(l.company)));
};

describe('after somebody works a lead', () => {
  it('puts it at the top of its own column', async () => {
    render(<BoardView />);
    await waitFor(async () => expect((await talkingOrder())[0]).toContain('Beta Dental'));
  });

  /**
   * The half-working part. Beta is `qualified` and Alpha is `contacted`, so
   * under the old sort Alpha was above it permanently — logging a call on
   * Beta moved nothing, which is the whole complaint.
   */
  it('lifts it past a lead at an earlier status in the same column', async () => {
    render(<BoardView />);
    await waitFor(async () => {
      const order = await talkingOrder();
      expect(order.indexOf(order.find((c) => c.includes('Beta Dental'))!)).toBeLessThan(
        order.indexOf(order.find((c) => c.includes('Alpha Roofing'))!)
      );
    });
  });

  /**
   * Never touched is not the same as touched longest ago. A lead nobody has
   * worked must not read as the most recent thing anybody did.
   */
  it('sorts a lead nobody has worked to the bottom, not the top', async () => {
    render(<BoardView />);
    await waitFor(async () => expect((await talkingOrder()).at(-1)).toContain('Gamma Vets'));
  });

  it('says when each card was last worked, so the order explains itself', async () => {
    render(<BoardView />);
    // Three of the four have been worked; the fourth says so in words.
    expect(await screen.findAllByText(/Worked .* ago/)).toHaveLength(3);
    expect(await screen.findByText('Not worked yet')).toBeTruthy();
  });
});

describe('the pipeline reading, still one click away', () => {
  it('goes back to status order', async () => {
    const user = userEvent.setup();
    render(<BoardView />);
    await screen.findByRole('heading', { name: 'Talking' });

    await user.click(screen.getByRole('button', { name: 'Pipeline order' }));

    await waitFor(async () => {
      const order = await talkingOrder();
      expect(order.slice(0, 2).join(' ')).toContain('Alpha Roofing'); // contacted
      expect(order.at(-1)).toContain('Beta Dental'); // qualified
    });
  });

  /**
   * Two leads at the same status used to keep whatever order the API returned,
   * which was `updatedAt desc` — a column that reshuffled itself after a bulk
   * tag edit or an importer pass, for work nobody had done. Alpha's `updatedAt`
   * is the newer of the two here and its activity the older, so a board reading
   * `updatedAt` puts it first and a board reading the timeline does not.
   */
  it('separates two leads at the same status by who was worked last', async () => {
    const user = userEvent.setup();
    render(<BoardView />);
    await screen.findByRole('heading', { name: 'Talking' });

    await user.click(screen.getByRole('button', { name: 'Pipeline order' }));

    await waitFor(async () => {
      const order = await talkingOrder();
      const at = (c: string) => order.findIndex((t) => t.includes(c));
      expect(at('Delta Plumbing')).toBeLessThan(at('Alpha Roofing'));
    });
  });

  it('drops the "worked" line, which only explains the other order', async () => {
    const user = userEvent.setup();
    render(<BoardView />);
    await screen.findAllByText(/Worked .* ago/);

    await user.click(screen.getByRole('button', { name: 'Pipeline order' }));

    await waitFor(() => expect(screen.queryAllByText(/Worked .* ago/)).toHaveLength(0));
    expect(screen.queryByText('Not worked yet')).toBeNull();
  });

  it('remembers the choice, because it is a preference and not a filter', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BoardView />);
    await screen.findByRole('heading', { name: 'Talking' });
    await user.click(screen.getByRole('button', { name: 'Pipeline order' }));
    unmount();

    render(<BoardView />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Pipeline order' })).toHaveAttribute('aria-pressed', 'true')
    );
  });
});
