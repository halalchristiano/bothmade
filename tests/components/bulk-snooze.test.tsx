import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListView } from '@/components/admin/sales/ListView';

/**
 * Snoozing a batch of follow-ups, and being told when it did not happen.
 *
 * The bulk bar on the leads list drives four things across up to five hundred
 * businesses at a time — snooze, reassign, write emails, delete — and none of
 * it had a test. Mutating the snooze handler to send nothing at all and clear
 * the selection anyway left the whole suite green.
 *
 * Under that cover was a real one. It fired N requests through `Promise.all`
 * and read none of the responses. `fetch` resolves on a 403 and a 500 exactly
 * as it does on a 200, so every PATCH could fail and the handler still
 * cleared the selection and reloaded — the list came back with the same dates
 * on it and nothing said why. Snoozing is what somebody does to get twenty
 * leads out of today's queue; the failure mode was those twenty quietly
 * staying in it, which is the rot the button exists to prevent, with a rep who
 * now believes it is handled.
 *
 * A dropped connection was worse still: `Promise.all` rejects on the first
 * failure and there was no `catch`, so the rejection escaped the handler.
 * Nothing cleared, nothing reloaded, nothing said — a button that appeared to
 * do nothing whatsoever.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const LEADS = [
  { id: 'l1', company: 'Alpha Roofing' },
  { id: 'l2', company: 'Beta Dental' },
  { id: 'l3', company: 'Gamma Vets' },
].map((l) => ({
  ...l,
  contactName: null,
  email: `${l.id}@example.test`,
  phone: null,
  status: 'contacted',
  estimatedValue: null,
  dealValue: null,
  dealValueIsFirm: false,
  hotLead: false,
  qualifiedAt: null,
  updatedAt: new Date().toISOString(),
  lastActivityAt: null,
  assignedTo: null,
  activities: [],
  nextFollowUpAt: null,
  emailDeliveryFailedAt: null,
  doNotContact: false,
  addedAt: new Date().toISOString(),
}));

/** PATCH responses, in the order the handler fires them. */
let patchResults: Array<'ok' | 'server-error' | 'offline'> = [];
let patched: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  patchResults = [];
  patched = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (init?.method === 'PATCH') {
        const id = path.split('/').pop()!;
        patched.push(id);
        const outcome = patchResults.shift() ?? 'ok';
        if (outcome === 'offline') throw new TypeError('Failed to fetch');
        if (outcome === 'server-error') {
          return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => ({ success: true }) } as unknown as Response;
      }
      if (path.startsWith('/api/admin/leads')) {
        return { ok: true, status: 200, json: async () => ({ success: true, leads: LEADS }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ success: true, users: [] }) } as unknown as Response;
    })
  );
});

/*
 * jsdom applies no media queries, so the mobile card list and the desktop
 * table both render and every row checkbox exists twice. Taking the first is
 * enough — they are the same control wired to the same state, which is the
 * thing worth knowing.
 */
const box = (company: string) =>
  screen.getAllByRole('checkbox', { name: `Select ${company}` })[0]!;
const findBox = async (company: string) =>
  (await screen.findAllByRole('checkbox', { name: `Select ${company}` }))[0]!;

/** Tick the first two rows, then press Snooze 3d. */
const snoozeTwo = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await findBox('Alpha Roofing'));
  await user.click(box('Beta Dental'));
  await user.click(await screen.findByRole('button', { name: /Snooze 3d/ }));
};

describe('snoozing a batch of follow-ups', () => {
  it('sends one request per selected lead and clears the selection', async () => {
    const user = userEvent.setup();
    render(<ListView />);

    await snoozeTwo(user);

    await waitFor(() => expect(patched.sort()).toEqual(['l1', 'l2']));
    await waitFor(() => expect(box('Alpha Roofing')).not.toBeChecked());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('pushes the follow-up out by the number of days on the button', async () => {
    const user = userEvent.setup();
    render(<ListView />);

    await snoozeTwo(user);

    await waitFor(() => expect(patched).toHaveLength(2));
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => (c[1] as RequestInit | undefined)?.method === 'PATCH'
    )!;
    const sent = new Date(JSON.parse((call[1] as RequestInit).body as string).nextFollowUpAt);
    const days = (sent.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThan(3.1);
  });

  /** The whole point: a 500 is not a snooze. */
  it('says so when the server refuses, instead of looking like it worked', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    patchResults = ['server-error', 'server-error'];

    await snoozeTwo(user);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("Couldn't snooze those 2 leads — they are still due. Try again.");
  });

  /**
   * Partial failure is the common one — one lead deleted in another tab, a
   * single request timing out — and it is the case where a bare count is a
   * lie in both directions.
   */
  it('reports how many of them actually moved', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    patchResults = ['ok', 'server-error'];

    await snoozeTwo(user);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('1 of 2');
    // Reads as English at one as well as at ten.
    expect(alert.textContent).toContain('The other one is still due and stays selected');
  });

  it('keeps the ones that failed selected, so retrying means only those', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    patchResults = ['ok', 'server-error'];

    await snoozeTwo(user);

    await screen.findByRole('alert');
    expect(box('Alpha Roofing')).not.toBeChecked();
    expect(box('Beta Dental')).toBeChecked();
  });

  /**
   * A rejected fetch, not a bad status. This used to escape the handler
   * entirely through an uncaught `Promise.all` rejection.
   */
  it('survives a dropped connection and still says something', async () => {
    const user = userEvent.setup();
    render(<ListView />);
    patchResults = ['offline', 'offline'];

    await snoozeTwo(user);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/still due/i);
    // Not stuck mid-flight: the button has to come back.
    await waitFor(() => expect(screen.getByRole('button', { name: /Snooze 3d/ })).toBeEnabled());
  });
});

/**
 * The column that drives all of it.
 *
 * Every box here — the select-all and one per row — announced as "checkbox,
 * not checked" and nothing else, while the bar they feed offers delete,
 * reassign and a mass email. There was no way to tell the select-all from a
 * row, or a row from the business it belonged to; the only way to know what
 * was about to be deleted was to be able to see the screen.
 */
describe('the bulk-select column', () => {
  it('names each row checkbox after its business', async () => {
    render(<ListView />);
    for (const company of ['Alpha Roofing', 'Beta Dental', 'Gamma Vets']) {
      expect(await findBox(company)).toBeTruthy();
    }
  });

  it('names the select-all, and counts what it would take', async () => {
    render(<ListView />);
    expect(await screen.findByRole('checkbox', { name: 'Select all 3 leads shown' })).toBeTruthy();
  });

  it('leaves no unnamed checkbox behind for a screen reader to guess at', async () => {
    const { container } = render(<ListView />);
    await findBox('Alpha Roofing');

    const unnamed = Array.from(container.querySelectorAll('input[type="checkbox"]')).filter(
      (el) => !el.getAttribute('aria-label') && !el.closest('label') && el.getAttribute('aria-hidden') !== 'true'
    );
    expect(unnamed, 'every checkbox is either named or explicitly decorative').toHaveLength(0);
  });
});
