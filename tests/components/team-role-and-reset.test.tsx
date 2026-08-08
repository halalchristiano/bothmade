import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamPage from '@/app/admin/team/page';
import { USER_ROLE_DESCRIPTIONS } from '@/lib/roles';

/**
 * The two things an owner does to somebody else's account.
 *
 * Changing a role used to happen on the `change` event of a dropdown: no
 * statement of what was being granted, nothing to press to undo it, and it
 * sat one control away from a Remove button that has always asked first. The
 * grants are not small — Owner is team management and bulk deletion, and
 * Admin carries the authority to quote below the calculated floor — so the
 * page now says what it is about to hand over and waits.
 *
 * And there was no way to reset a teammate's password at all. The initial one
 * is shown once; after that a locked-out teammate's only route back was to be
 * deleted and re-added, which unassigns every lead they own and takes their
 * side of the team chat with it — and is refused outright for the last owner.
 */

const OWNER = { id: 'u_me', name: 'Kiana', email: 'kiana@bothmade.studio', role: 'owner', title: null, createdAt: '2026-01-01T00:00:00.000Z' };
const REP = { id: 'u_evan', name: 'Evan', email: 'evan@bothmade.studio', role: 'sales', title: null, createdAt: '2026-01-01T00:00:00.000Z' };

const json = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;
let members: typeof OWNER[];

/** The page's two loads, plus whatever the action under test calls. */
const route = (url: string): Response => {
  if (url.startsWith('/api/admin/users') === false && url.startsWith('/api/auth/me') === false) {
    throw new Error(`unexpected fetch: ${url}`);
  }
  if (url === '/api/auth/me') return json({ user: { id: OWNER.id, role: 'owner' } });
  return json({ success: true, users: members });
};

beforeEach(() => {
  members = [OWNER, REP];
  fetchMock = vi.fn(async (url: string) => route(url));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

const rowFor = async (name: string) => {
  const cell = await screen.findByText(name);
  return cell.closest('li') as HTMLElement;
};

describe('handing someone a different role', () => {
  it('does not change anything on the dropdown alone', async () => {
    const user = userEvent.setup();
    render(<TeamPage />);

    const row = await rowFor('Evan');
    await user.selectOptions(within(row).getByLabelText(/role for evan/i), 'owner');

    // Nothing has been sent. The PATCH is the thing that grants it.
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/api/admin/users/u_evan'))).toHaveLength(0);
  });

  it('says what the new role can do, in the role’s own words', async () => {
    const user = userEvent.setup();
    render(<TeamPage />);

    const row = await rowFor('Evan');
    await user.selectOptions(within(row).getByLabelText(/role for evan/i), 'owner');

    expect(await within(row).findByText(/make evan/i)).toBeTruthy();
    expect(within(row).getByText(USER_ROLE_DESCRIPTIONS.owner)).toBeTruthy();
  });

  it('sends it once confirmed', async () => {
    const user = userEvent.setup();
    render(<TeamPage />);

    const row = await rowFor('Evan');
    await user.selectOptions(within(row).getByLabelText(/role for evan/i), 'owner');
    await user.click(within(row).getByRole('button', { name: /change role/i }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([u]) => String(u) === '/api/admin/users/u_evan');
      expect(patch?.[1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ role: 'owner' }) });
    });
  });

  it('puts the dropdown back on cancel, and grants nothing', async () => {
    const user = userEvent.setup();
    render(<TeamPage />);

    const row = await rowFor('Evan');
    const select = within(row).getByLabelText(/role for evan/i) as HTMLSelectElement;
    await user.selectOptions(select, 'owner');
    await user.click(within(row).getByRole('button', { name: /cancel/i }));

    expect(select.value).toBe('sales');
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/u_evan'))).toHaveLength(0);
  });

  it('asks nothing when the dropdown lands back on the role they already have', async () => {
    const user = userEvent.setup();
    render(<TeamPage />);

    const row = await rowFor('Evan');
    const select = within(row).getByLabelText(/role for evan/i);
    await user.selectOptions(select, 'owner');
    await user.selectOptions(select, 'sales');

    expect(within(row).queryByRole('button', { name: /change role/i })).toBeNull();
  });
});

describe('resetting a teammate’s password', () => {
  it('hands back a password to send them, and says their sessions are gone', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/users/u_evan/reset-password' && init?.method === 'POST') {
        return json({ success: true, email: REP.email, initialPassword: 'Kq7-tPz9RmXw2BvN' });
      }
      return route(url);
    });
    render(<TeamPage />);

    const row = await rowFor('Evan');
    await user.click(within(row).getByRole('button', { name: /reset password for evan/i }));

    expect(await screen.findByText('Kq7-tPz9RmXw2BvN')).toBeTruthy();
    expect(screen.getByText(/signed out everywhere/i)).toBeTruthy();
  });

  it('asks first, and does nothing if the answer is no', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<TeamPage />);

    const row = await rowFor('Evan');
    await user.click(within(row).getByRole('button', { name: /reset password for evan/i }));

    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('reset-password'))).toHaveLength(0);
  });

  it('can be taken off the screen once it has been sent on', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/users/u_evan/reset-password' && init?.method === 'POST') {
        return json({ success: true, email: REP.email, initialPassword: 'Kq7-tPz9RmXw2BvN' });
      }
      return route(url);
    });
    render(<TeamPage />);

    const row = await rowFor('Evan');
    await user.click(within(row).getByRole('button', { name: /reset password for evan/i }));
    await screen.findByText('Kq7-tPz9RmXw2BvN');

    await user.click(screen.getByRole('button', { name: /hide this password/i }));

    await waitFor(() => expect(screen.queryByText('Kq7-tPz9RmXw2BvN')).toBeNull());
  });

  it('reports a refusal in words, not the raw failure', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/users/u_evan/reset-password' && init?.method === 'POST') {
        return json({ error: 'No such team member' }, false, 404);
      }
      return route(url);
    });
    render(<TeamPage />);

    const row = await rowFor('Evan');
    await user.click(within(row).getByRole('button', { name: /reset password for evan/i }));

    expect(await screen.findByText('No such team member')).toBeTruthy();
  });

  it('is not offered against your own account, which Settings does instead', async () => {
    render(<TeamPage />);

    const row = await rowFor('Kiana');
    expect(within(row).queryByRole('button', { name: /reset password/i })).toBeNull();
  });
});
