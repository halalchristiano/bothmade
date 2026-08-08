import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListView } from '@/components/admin/sales/ListView';

/**
 * The leads table's own behaviour: what the column headers do, what the
 * select-all takes, and what the export contains.
 *
 * None of it was covered. Three mutations proved it — inverting the "Last
 * worked" comparator, making the Company sort return 0, and pinning the sort
 * direction to ascending — and the full suite stayed green through all three.
 * Two more did too: exporting the whole book instead of the filtered rows,
 * and a select-all checkbox that reported the wrong state.
 *
 * The sort is not decoration. It is how somebody asks "who have we not
 * touched in a fortnight", and the export is what gets sent to whoever is
 * running a campaign, so silently exporting five hundred rows for a screen
 * showing twelve is a bigger mistake than the button not working.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

const lead = (over: Record<string, unknown>) => ({
  contactName: null,
  email: 'x@example.test',
  phone: null,
  status: 'contacted',
  estimatedValue: null,
  dealValue: null,
  dealValueIsFirm: false,
  hotLead: false,
  qualifiedAt: null,
  updatedAt: iso(0),
  lastActivityAt: null,
  assignedTo: null,
  activities: [],
  nextFollowUpAt: null,
  emailDeliveryFailedAt: null,
  doNotContact: false,
  addedAt: iso(30),
  coldEmailDraft: null,
  coldEmailSentAt: null,
  personalizedObservation: null,
  emailDeliveryFailedReason: null,
  painPoints: '',
  ...over,
});

const LEADS = [
  lead({ id: 'l_zeta', company: 'Zeta Plumbing', dealValue: 900_000, lastActivityAt: iso(1) }),
  lead({ id: 'l_alpha', company: 'Alpha Roofing', dealValue: 100_000, lastActivityAt: iso(20) }),
  lead({ id: 'l_mid', company: 'Mid Dental', dealValue: 400_000, lastActivityAt: iso(9) }),
  // Emailed nightly by the cron and never actually worked. The API reports
  // that as no last-worked date at all, which is the whole point of it.
  lead({ id: 'l_robot', company: 'Robot Vets', dealValue: 250_000, lastActivityAt: null }),
];

let objectUrls: Blob[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  objectUrls = [];
  try {
    localStorage.clear();
  } catch {
    /* private browsing */
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = String(url).startsWith('/api/admin/leads')
        ? { success: true, leads: LEADS }
        : { success: true, users: [] };
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    })
  );
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn((b: Blob) => {
      objectUrls.push(b);
      return 'blob:stub';
    }),
    revokeObjectURL: vi.fn(),
  });
});

/**
 * jsdom runs no media queries, so the mobile cards and the desktop table both
 * render. The sortable headers only exist in the table, so scope to it.
 */
const table = () => screen.getByRole('table');
const companyOrder = () =>
  within(table())
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.querySelector('td:nth-child(2)')?.textContent?.trim() ?? '');

const header = (name: string) => within(table()).getByRole('button', { name: new RegExp(`^${name}`) });

const ready = () => screen.findByRole('button', { name: /^Company/ });

describe('sorting the table', () => {
  it('takes Company A–Z on the first click and reverses on the second', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    await ready();

    await user.click(header('Company'));
    await waitFor(() => expect(companyOrder()[0]).toBe('Alpha Roofing'));
    expect(companyOrder().at(-1)).toBe('Zeta Plumbing');

    await user.click(header('Company'));
    await waitFor(() => expect(companyOrder()[0]).toBe('Zeta Plumbing'));
  });

  /**
   * Each column opens the way the click means it. Nobody clicking "Value"
   * wants the cheapest deal first, and nobody clicking "Company" wants Z.
   */
  it('opens Value on the biggest deal, not the smallest', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    await ready();

    await user.click(header('Value'));

    await waitFor(() => expect(companyOrder()[0]).toBe('Zeta Plumbing'));
  });

  it('opens Last worked on the most recent', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    await ready();

    await user.click(header('Last worked'));

    await waitFor(() => expect(companyOrder()[0]).toBe('Zeta Plumbing'));
    expect(companyOrder()[1]).toBe('Mid Dental');
  });

  /**
   * The reason this column exists, and the reason it has to agree with the
   * board.
   *
   * A lead the nightly cron emailed has a timeline row and no work behind it.
   * Sorted on the raw timeline it read as freshly attended to and sank out of
   * view — hiding it from the one sort somebody uses to find neglected
   * businesses, while the board on the next tab said "Not worked yet" about
   * the same company.
   */
  it('sorts a lead nobody has worked to the bottom, not into the middle', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    await ready();

    await user.click(header('Last worked'));

    await waitFor(() => expect(companyOrder().at(-1)).toBe('Robot Vets'));
  });

  it('brings the neglected ones to the top when reversed', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    await ready();

    await user.click(header('Last worked'));
    await user.click(header('Last worked'));

    await waitFor(() => expect(companyOrder()[0]).toBe('Robot Vets'));
    expect(companyOrder()[1]).toBe('Alpha Roofing'); // 20 days, the oldest real one
  });

  it('shows a dash rather than a date for a lead nobody has worked', async () => {
    render(<ListView />);
    await ready();

    const row = within(table())
      .getAllByRole('row')
      .find((r) => r.textContent?.includes('Robot Vets'))!;
    expect(row.querySelector('td:nth-child(7)')?.textContent?.trim()).toBe('—');
  });

  /** The only part of this a screen reader can read. */
  it('announces which column is sorted and which way', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    await ready();

    await user.click(header('Company'));
    await waitFor(() =>
      expect(header('Company').closest('th')).toHaveAttribute('aria-sort', 'ascending')
    );
    expect(header('Value').closest('th')).not.toHaveAttribute('aria-sort');

    await user.click(header('Company'));
    await waitFor(() =>
      expect(header('Company').closest('th')).toHaveAttribute('aria-sort', 'descending')
    );
  });
});

describe('select all', () => {
  const selectAll = () => screen.getByRole('checkbox', { name: /^Select all/ });

  it('takes every row on screen', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    await ready();

    await user.click(selectAll());

    await waitFor(() => expect(screen.getByText('4', { selector: 'strong' })).toBeTruthy());
    for (const company of ['Zeta Plumbing', 'Alpha Roofing', 'Mid Dental', 'Robot Vets']) {
      expect(screen.getAllByRole('checkbox', { name: `Select ${company}` })[0]).toBeChecked();
    }
  });

  /**
   * "All" means what is on screen. Selecting under a search and then deleting
   * must not reach the businesses the search hid.
   */
  it('takes only what the search left, and says so in its own name', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    await ready();

    await user.type(screen.getByPlaceholderText(/Search by business/i), 'Alpha');
    await waitFor(() => expect(companyOrder()).toEqual(['Alpha Roofing']));

    expect(screen.getByRole('checkbox', { name: 'Select all 1 leads shown' })).toBeTruthy();
    await user.click(selectAll());

    await waitFor(() => expect(screen.getByText('1', { selector: 'strong' })).toBeTruthy());
  });

  it('lets go of everything on a second click', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    await ready();

    await user.click(selectAll());
    await waitFor(() => expect(selectAll()).toBeChecked());

    await user.click(selectAll());

    await waitFor(() => expect(selectAll()).not.toBeChecked());
    expect(screen.getAllByRole('checkbox', { name: 'Select Zeta Plumbing' })[0]).not.toBeChecked();
  });
});

describe('the CSV export', () => {
  const exportCsv = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /Export CSV/ }));
    await waitFor(() => expect(objectUrls).toHaveLength(1));
    return objectUrls[0]!.text();
  };

  it('writes every lead on screen', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    await ready();

    const csv = await exportCsv(user);

    for (const company of ['Zeta Plumbing', 'Alpha Roofing', 'Mid Dental', 'Robot Vets']) {
      expect(csv).toContain(company);
    }
  });

  /**
   * An export should match the filters somebody just spent time setting. The
   * whole book arriving instead is the kind of mistake that only shows up
   * after it has been emailed to a mailing tool.
   */
  it('leaves out what the search filtered away', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    await ready();

    await user.type(screen.getByPlaceholderText(/Search by business/i), 'Alpha');
    await waitFor(() => expect(companyOrder()).toEqual(['Alpha Roofing']));

    const csv = await exportCsv(user);

    expect(csv).toContain('Alpha Roofing');
    expect(csv).not.toContain('Zeta Plumbing');
    expect(csv).not.toContain('Robot Vets');
  });

  it('comes out in the order the screen is in', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    await ready();

    await user.click(header('Company'));
    await waitFor(() => expect(companyOrder()[0]).toBe('Alpha Roofing'));

    const csv = await exportCsv(user);
    const rows = csv.trim().split('\n').slice(1);

    expect(rows[0]).toContain('Alpha Roofing');
    expect(rows.at(-1)).toContain('Zeta Plumbing');
  });
});
