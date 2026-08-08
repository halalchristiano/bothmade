import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusPage from '@/app/status/[projectId]/page';

/**
 * What a client sees when their status link does not load.
 *
 * This is the page a client is told to check, and the one the API's own
 * comment describes as "a read-only snapshot a client can forward to their
 * own team". It had one failure branch, headed "Not found", printing whatever
 * string came back — so a dropped connection read "Not found — Failed to
 * fetch", a 500 read "Internal server error", and a proxy returning HTML read
 * as a JSON parse error. All of it in front of somebody who is paying us, and
 * the heading was wrong in two cases out of three.
 *
 * A dead link and a bad minute are different things. Only one of them is
 * worth a retry.
 */

vi.mock('next/navigation', () => ({ useParams: () => ({ projectId: 'p1' }) }));

const PROJECT = {
  name: 'Acme — Website',
  company: 'Acme Dental',
  statusStage: 2,
  estimatedCompletionDate: null,
  liveUrl: null,
  updates: [],
};

const res = (over: Partial<{ ok: boolean; status: number; json: () => Promise<unknown> }>) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, project: PROJECT }), ...over }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(res({}));
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState({}, '', '/status/p1?t=tok');
});

describe('a link that is never going to work', () => {
  it('says the link expired, not "not found"', async () => {
    fetchMock.mockResolvedValue(res({ ok: false, status: 404, json: async () => ({ error: 'Not found' }) }));
    render(<StatusPage />);

    await waitFor(() => expect(screen.getByText(/this link has expired/i)).toBeTruthy());
    expect(screen.getByText(/ask us for a fresh link/i)).toBeTruthy();
  });

  it('offers no retry, because pressing it would never help', async () => {
    fetchMock.mockResolvedValue(res({ ok: false, status: 404, json: async () => ({ error: 'Not found' }) }));
    render(<StatusPage />);

    await waitFor(() => expect(screen.getByText(/this link has expired/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
});

describe('a load that failed this time', () => {
  it('says so in words a client can act on, and never shows the server error', async () => {
    fetchMock.mockResolvedValue(
      res({ ok: false, status: 500, json: async () => ({ error: 'Internal server error' }) })
    );
    render(<StatusPage />);

    await waitFor(() => expect(screen.getByText(/couldn't load this just now/i)).toBeTruthy());
    expect(screen.queryByText(/internal server error/i)).toBeNull();
  });

  it('does not show a network error message to the client', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<StatusPage />);

    await waitFor(() => expect(screen.getByText(/couldn't load this just now/i)).toBeTruthy());
    expect(screen.queryByText(/failed to fetch/i)).toBeNull();
  });

  it('survives a response that is not JSON at all', async () => {
    // A proxy or CDN error page: 200, HTML body. `res.json()` throws.
    fetchMock.mockResolvedValue(
      res({
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      })
    );
    render(<StatusPage />);

    await waitFor(() => expect(screen.getByText(/couldn't load this just now/i)).toBeTruthy());
    expect(screen.queryByText(/unexpected token/i)).toBeNull();
  });

  it('lets them try again, and shows the project when it works', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(res({ ok: false, status: 503, json: async () => ({}) }));
    render(<StatusPage />);

    await waitFor(() => expect(screen.getByText(/couldn't load this just now/i)).toBeTruthy());

    fetchMock.mockResolvedValue(res({}));
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(screen.getByText('Acme — Website')).toBeTruthy());
  });
});

describe('a load that works', () => {
  it('shows the project', async () => {
    render(<StatusPage />);
    await waitFor(() => expect(screen.getByText('Acme — Website')).toBeTruthy());
  });
});
