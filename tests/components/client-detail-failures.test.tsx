import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * What the client page did when a write failed, which was nothing.
 *
 * Every mutation on it read `if (response.ok)` and had no else. Save left the
 * form in edit mode with the change apparently accepted. Delete left you on
 * the page having already typed the company name to confirm. And Decommission
 * — which blocks the client's login — stopped spinning and changed nothing at
 * all.
 *
 * That last one is the reason this matters rather than being untidy. The
 * belief it leaves behind is that an account has been cut off. Nobody
 * re-checks a thing they watched themselves do, so the way you find out is
 * when someone who should have been locked out signs in.
 *
 * A failed initial load was the same shape: it fell through `loading ||
 * !client` and sat on "Loading client…" for as long as the tab stayed open.
 */

const push = vi.fn();
const router = { push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => ({ clientId: 'c1' }),
  usePathname: () => '/admin/clients/c1',
  useSearchParams: () => new URLSearchParams(),
}));

const ClientDetailPage = (await import('@/app/admin/clients/[clientId]/page')).default;

const CLIENT = {
  id: 'c1',
  company: 'Okafor Plumbing',
  contactName: 'Dana Okafor',
  email: 'dana@okafor.co.uk',
  phone: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  archivedAt: null,
  projects: [],
  signatureRecords: [],
};

/** Loads fine, then fails every write — the state this file is about. */
function loadsThenFails(error?: string) {
  let first = true;
  const fetchMock = vi.fn(async () => {
    if (first) {
      first = false;
      return { ok: true, status: 200, json: async () => ({ success: true, client: CLIENT }) };
    }
    return { ok: false, status: 500, json: async () => (error ? { error } : {}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function failsToLoad() {
  const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const decommission = () => screen.getByRole('button', { name: /decommission/i });

beforeEach(() => {
  vi.clearAllMocks();
});

async function renderLoaded() {
  render(<ClientDetailPage />);
  await waitFor(() => expect(screen.getAllByText('Okafor Plumbing').length).toBeGreaterThan(0));
}

describe('a write that fails', () => {
  it('says the client was not decommissioned, in as many words', async () => {
    loadsThenFails();
    await renderLoaded();

    await userEvent.click(decommission());

    const alert = await screen.findByRole('alert');
    // Specifically that their login still works — the fact the reader needs
    // and would otherwise assume the opposite of.
    expect(alert).toHaveTextContent(/NOT decommissioned/i);
    expect(alert).toHaveTextContent(/login still works/i);
  });

  it('passes on the reason the server gave rather than inventing one', async () => {
    loadsThenFails('This client still has live projects.');
    await renderLoaded();

    await userEvent.click(decommission());

    expect(await screen.findByRole('alert')).toHaveTextContent(/still has live projects/i);
  });

  it('stops spinning, so the button is not left mid-action', async () => {
    loadsThenFails();
    await renderLoaded();

    await userEvent.click(decommission());
    await screen.findByRole('alert');

    expect(screen.queryByText(/decommissioning\.\.\./i)).toBeNull();
  });
});

describe('a write that succeeds', () => {
  it('says nothing at all', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, client: CLIENT }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await renderLoaded();
    await userEvent.click(decommission());

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('a page that cannot load at all', () => {
  it('does not sit on the spinner forever', async () => {
    failsToLoad();

    render(<ClientDetailPage />);

    await waitFor(() => expect(screen.queryByText(/loading client/i)).toBeNull());
  });

  it('says so, and offers a way to try again', async () => {
    const fetchMock = failsToLoad();

    render(<ClientDetailPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load/i);

    const before = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  });
});
