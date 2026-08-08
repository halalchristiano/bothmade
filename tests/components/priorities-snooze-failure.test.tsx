import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * What Priorities says when a snooze does not take.
 *
 * Snooze is the only thing this page can *do*. Every other row is a link out;
 * the reason the list stays readable is that a problem you cannot act on
 * today can be put down without pretending it is finished.
 *
 * A failed PATCH was a bare `return`. The row stayed, nothing was said, and
 * the button had simply not worked. That is worse than a visibly broken
 * button: you press "a week", the row does not move, you assume you
 * misclicked, and either way the project is back tomorrow having been — as
 * far as you know — dealt with. A network throw was worse still, escaping the
 * handler entirely as an unhandled rejection.
 *
 * The row must stay put, because the snooze genuinely did not happen. The
 * page just has to say so.
 */

/*
 * One router object for the whole file, not a fresh one per render.
 *
 * `load` is a useCallback keyed on `router`, so a mock that returns a new
 * object every call re-fires the effect on every render and the page refetches
 * forever — which in this file would swallow the state change under test.
 * The real useRouter() is stable; the mock has to be too.
 */
const push = vi.fn();
const router = { push, replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/admin/priorities',
  useSearchParams: () => new URLSearchParams(),
}));

const PrioritiesPage = (await import('@/app/admin/priorities/page')).default;

/** One project, quiet for a fortnight — a row with snooze buttons on it. */
const STATS = {
  success: true,
  stats: {
    newHandoffs: [],
    atRiskProjects: [{ id: 'p1', name: 'Okafor Plumbing Site', company: 'Okafor Plumbing', daysSinceUpdate: 14 }],
    overdueBalances: [],
    unbilledInstalments: [],
    projectsAwaitingReply: [],
    readyToDeliver: [],
    unreadDesignFeedback: [],
    snoozed: [],
  },
};

/**
 * The load succeeds; the snooze PATCH does whatever the test asks for. Two
 * separate behaviours on one mock, because the page fetches both.
 */
function mockFetch(onSnooze: () => unknown) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/snooze')) return onSnooze();
    return { ok: true, status: 200, json: async () => STATS };
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

const rowIsStillThere = () => screen.getByText('Okafor Plumbing');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a snooze the server refuses', () => {
  it('says so, names the project, and leaves the row where it was', async () => {
    mockFetch(() => ({ ok: false, status: 500, json: async () => ({}) }));
    render(<PrioritiesPage />);
    await screen.findByText('Okafor Plumbing');

    await userEvent.click(screen.getByRole('button', { name: 'a week' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Okafor Plumbing could not be snoozed/i);
    // The half that matters: not just "it failed" but what that means for
    // the list you are looking at.
    expect(alert).toHaveTextContent(/still on the list/i);
    expect(rowIsStillThere()).toBeInTheDocument();
  });

  it('prefers the route’s own sentence when it has one', async () => {
    mockFetch(() => ({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Project not found' }),
    }));
    render(<PrioritiesPage />);
    await screen.findByText('Okafor Plumbing');

    await userEvent.click(screen.getByRole('button', { name: '3 days' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Project not found');
  });

  it('survives a request that never lands', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    render(<PrioritiesPage />);
    await screen.findByText('Okafor Plumbing');

    await userEvent.click(screen.getByRole('button', { name: 'tomorrow' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/did not get through/i);
    expect(rowIsStillThere()).toBeInTheDocument();
  });

  it('offers the press again rather than making you find the row', async () => {
    let fail = true;
    mockFetch(() => {
      if (fail) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    });
    render(<PrioritiesPage />);
    await screen.findByText('Okafor Plumbing');
    await userEvent.click(screen.getByRole('button', { name: 'a week' }));
    await screen.findByRole('alert');

    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    // Moved into the snoozed section — which is what the press meant. The
    // heading interleaves an icon with its text, so the row's own control is
    // the readable signal that it landed there.
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /bring back/i })).toBeInTheDocument();
  });

  it('can be dismissed without retrying', async () => {
    mockFetch(() => ({ ok: false, status: 500, json: async () => ({}) }));
    render(<PrioritiesPage />);
    await screen.findByText('Okafor Plumbing');
    await userEvent.click(screen.getByRole('button', { name: 'a week' }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(rowIsStillThere()).toBeInTheDocument();
  });
});

describe('a snooze that works', () => {
  it('says nothing at all', async () => {
    mockFetch(() => ({ ok: true, status: 200, json: async () => ({ success: true }) }));
    render(<PrioritiesPage />);
    await screen.findByText('Okafor Plumbing');

    await userEvent.click(screen.getByRole('button', { name: 'a week' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /bring back/i })).toBeInTheDocument()
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
