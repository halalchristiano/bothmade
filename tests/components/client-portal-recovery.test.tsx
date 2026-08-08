import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The two things that happen to a client when something goes wrong.
 *
 * They see an error, and they get sent to the login page. Both were worse
 * than they needed to be.
 *
 * The portal put the exception's own message on screen — `err instanceof
 * Error ? err.message : '…'` reads as careful and does the opposite, because
 * the fallback only ever showed for a thrown non-Error. So a dropped
 * connection said "Failed to fetch" and a proxy serving HTML said "Unexpected
 * token < in JSON", to somebody who is paying us. Seven places did it.
 *
 * And an expired session threw away where they were going: a link from an
 * email to a project became the project list, with no memory of the thing we
 * had just emailed them about.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
  useParams: () => ({ projectId: 'proj_9' }),
}));

import LoginPage from '@/app/client/login/page';
import ProjectsPage from '@/app/client/projects/page';
import ProjectPage from '@/app/client/[projectId]/page';

/** The Project shape the page renders, trimmed to what it actually reads. */
const PROJECT = {
  id: 'proj_9',
  name: 'Acme — Website',
  status: 'IN_PROGRESS',
  statusStage: 2,
  timeline: '6 weeks',
  baseService: 'website-build',
  addOns: [],
  totalPrice: 480_000,
  amountPaid: 240_000,
  balanceDue: 240_000,
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
};

const res = (over: Partial<{ ok: boolean; status: number; json: () => Promise<unknown> }>) =>
  ({ ok: true, status: 200, json: async () => ({ success: true }), ...over }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  push.mockClear();
  fetchMock = vi.fn().mockResolvedValue(res({}));
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState({}, '', '/client/login');
});

describe('an error a client is shown', () => {
  it('never carries the exception text from a dropped connection', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ProjectsPage />);

    await waitFor(() => expect(screen.getByText(/failed to load projects/i)).toBeTruthy());
    expect(screen.queryByText(/failed to fetch/i)).toBeNull();
  });

  it('never carries a JSON parse error from a proxy serving HTML', async () => {
    fetchMock.mockResolvedValue(
      res({
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      })
    );
    render(<ProjectsPage />);

    await waitFor(() => expect(screen.getByText(/failed to load projects/i)).toBeTruthy());
    expect(screen.queryByText(/unexpected token/i)).toBeNull();
  });
});

describe('signing back in after being timed out', () => {
  it('finishes the journey the client started', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/client/login?next=%2Fclient%2Fproj_9%3Ftab%3Dinvoices');
    fetchMock.mockResolvedValue(res({ json: async () => ({ success: true, client: {} }) }));

    render(<LoginPage />);
    await user.type(screen.getByLabelText(/email/i), 'a@b.test');
    await user.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/client/proj_9?tab=invoices'));
  });

  it('goes to the list when there was nowhere in particular', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(res({ json: async () => ({ success: true, client: {} }) }));

    render(<LoginPage />);
    await user.type(screen.getByLabelText(/email/i), 'a@b.test');
    await user.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/client/projects'));
  });

  it('refuses to be pointed at another site', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/client/login?next=https%3A%2F%2Fevil.test%2Fsteal');
    fetchMock.mockResolvedValue(res({ json: async () => ({ success: true, client: {} }) }));

    render(<LoginPage />);
    await user.type(screen.getByLabelText(/email/i), 'a@b.test');
    await user.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/client/projects'));
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('evil.test'));
  });

  it('still forces a generated password to be replaced first', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/client/login?next=%2Fclient%2Fproj_9');
    fetchMock.mockResolvedValue(
      res({ json: async () => ({ success: true, client: { mustChangePassword: true } }) })
    );

    render(<LoginPage />);
    await user.type(screen.getByLabelText(/email/i), 'a@b.test');
    await user.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    // The rest of the portal refuses them until it is changed, so honouring
    // `next` here would be a redirect into a wall.
    await waitFor(() => expect(push).toHaveBeenCalledWith('/client/settings?force=1'));
  });
});

describe('a project that will not load', () => {
  it('never prints the API’s own error string', async () => {
    // The one the screenshots caught: `data.error || '…'` looks like a
    // fallback and is really a passthrough, so "Internal server error" was the
    // sentence on screen.
    fetchMock.mockResolvedValue(
      res({ ok: false, status: 500, json: async () => ({ error: 'Internal server error' }) })
    );
    render(<ProjectPage />);

    await waitFor(() => expect(screen.getByText(/couldn't load this just now/i)).toBeTruthy());
    expect(screen.queryByText(/internal server error/i)).toBeNull();
  });

  it('offers a retry for a bad minute, and loads on the second try', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(res({ ok: false, status: 503, json: async () => ({}) }));
    render(<ProjectPage />);

    await waitFor(() => expect(screen.getByText(/couldn't load this just now/i)).toBeTruthy());

    fetchMock.mockResolvedValue(res({ json: async () => ({ success: true, project: PROJECT }) }));
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(screen.getByText('Acme — Website')).toBeTruthy());
  });

  it('offers no retry for a project that is not theirs, because it never will be', async () => {
    fetchMock.mockResolvedValue(res({ ok: false, status: 404, json: async () => ({ error: 'Not found' }) }));
    render(<ProjectPage />);

    await waitFor(() => expect(screen.getByText(/can’t find this project/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('sends them back to log in, carrying where they were going', async () => {
    window.history.replaceState({}, '', '/client/proj_9?tab=invoices');
    fetchMock.mockResolvedValue(res({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) }));
    render(<ProjectPage />);

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/client/login?next=${encodeURIComponent('/client/proj_9?tab=invoices')}`)
    );
  });
});
