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
}));

import LoginPage from '@/app/client/login/page';
import ProjectsPage from '@/app/client/projects/page';

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
