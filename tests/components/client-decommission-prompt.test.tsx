import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * What the client page does when decommissioning is refused.
 *
 * The button sits next to "Edit" and reads like tidying up. What it actually
 * does is lock the client out of their dashboard mid-session, make their
 * unpaid invoices unsendable, and drop their project off the priorities list
 * — none of it announced, and the client finds out by trying to log in.
 *
 * The route now refuses when there is work in flight and says what. A 409
 * with no second answer is just a message people learn to click past, so it
 * arrives as a decision: what is live, and two ways to respond.
 */

const push = vi.fn();
/* Stable — an unstable router remounts the page and swallows the state. */
const router = { push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => ({ clientId: 'client_1' }),
  usePathname: () => '/admin/clients/client_1',
  useSearchParams: () => new URLSearchParams(),
}));

const ClientDetailPage = (await import('@/app/admin/clients/[clientId]/page')).default;

const CLIENT = {
  id: 'client_1',
  email: 'dana@okafor.co.uk',
  company: 'Okafor Plumbing',
  phone: '',
  contactName: 'Dana Okafor',
  onboardingComplete: true,
  lastLoginAt: null,
  archivedAt: null,
  createdAt: '2026-07-01T09:00:00.000Z',
  projects: [],
  emailPreferences: null,
  signatureRecords: [],
};

const REFUSAL =
  'Okafor Plumbing has 1 project still open and 2 unpaid invoices. Decommissioning locks them ' +
  'out of their dashboard straight away and makes those invoices unsendable — they would find ' +
  'out by trying to log in.';

/** GET always loads; PATCH does whatever the test asks. */
function mockFetch(onPatch: () => unknown) {
  const fetchMock = vi.fn(async (_url: string, init?: { method?: string }) => {
    if (init?.method === 'PATCH') return onPatch();
    return { ok: true, status: 200, json: async () => ({ success: true, client: CLIENT }) };
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

const refuse = () => ({
  ok: false,
  status: 409,
  json: async () => ({ error: REFUSAL, liveWork: { projects: 1, unpaidInvoices: 2 } }),
});
const accept = () => ({ ok: true, status: 200, json: async () => ({ success: true, client: CLIENT }) });

const decommission = () => screen.getByRole('button', { name: /^decommission$/i });

async function renderLoaded() {
  render(<ClientDetailPage />);
  await waitFor(() => expect(decommission()).toBeInTheDocument());
}

/** The PATCH bodies actually sent, in order. */
function patchBodies(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls
    .filter((c) => (c[1] as { method?: string } | undefined)?.method === 'PATCH')
    .map((c) => JSON.parse((c[1] as { body: string }).body));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a decommission the route refuses', () => {
  it('says what is still live, and what pressing it would do', async () => {
    mockFetch(refuse);
    await renderLoaded();

    await userEvent.click(decommission());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/1 project still open and 2 unpaid invoices/);
    expect(alert).toHaveTextContent(/locks them out of their dashboard/i);
  });

  it('offers both answers rather than only a message', async () => {
    mockFetch(refuse);
    await renderLoaded();

    await userEvent.click(decommission());
    await screen.findByRole('alert');

    expect(screen.getByRole('button', { name: /decommission anyway/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /not now/i })).toBeInTheDocument();
  });

  /**
   * The half that matters: the first press must not have gone through. A
   * refusal that had already archived them would be worse than no check.
   */
  it('has not decommissioned anybody yet', async () => {
    const fetchMock = mockFetch(refuse);
    await renderLoaded();

    await userEvent.click(decommission());
    await screen.findByRole('alert');

    expect(patchBodies(fetchMock)).toEqual([{ archived: true }]);
    expect(decommission()).toBeInTheDocument();
  });

  it('goes through on the second press, and says so to the server', async () => {
    let refused = false;
    const fetchMock = mockFetch(() => {
      if (!refused) {
        refused = true;
        return refuse();
      }
      return accept();
    });
    await renderLoaded();
    await userEvent.click(decommission());
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: /decommission anyway/i }));

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(2));
    expect(patchBodies(fetchMock)[1]).toEqual({ archived: true, acknowledgeLiveWork: true });
  });

  it('"Not now" puts it down without sending anything', async () => {
    const fetchMock = mockFetch(refuse);
    await renderLoaded();
    await userEvent.click(decommission());
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: /not now/i }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(patchBodies(fetchMock)).toHaveLength(1);
    expect(decommission()).toBeInTheDocument();
  });
});

describe('a decommission with nothing in the way', () => {
  it('asks nothing and sends no acknowledgement', async () => {
    const fetchMock = mockFetch(accept);
    await renderLoaded();

    await userEvent.click(decommission());

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect(patchBodies(fetchMock)[0]).toEqual({ archived: true });
    expect(screen.queryByRole('button', { name: /decommission anyway/i })).not.toBeInTheDocument();
  });
});
