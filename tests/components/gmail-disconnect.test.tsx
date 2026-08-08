import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '@/app/admin/settings/page';

/**
 * Severing the account every client email goes out as, one click at a time.
 *
 * "Disconnect" sat as a small grey text link at the end of the green
 * Connected row, next to nothing that said what it did. One click cleared
 * the address, the encrypted App Password and the Google refresh token —
 * with no confirmation, and no undo. Getting back to where you were means
 * Google's consent screen again or a fresh 16-character App Password, and
 * in between, replies stop being matched to their lead and bounce notices
 * stop turning dead addresses into "call instead". Neither of those
 * announces itself; that is the whole reason the panel above this one
 * exists.
 *
 * The handler made it worse in the other direction. It was
 * `await fetch(DELETE)` with the response dropped on the floor, so a 500
 * fell through to the reload and redrew the panel still connected — a
 * failure that looks exactly like the button not working, which invites a
 * second press. A network error had no catch at all: the click handler
 * rejected into nowhere and the spinner tidied itself away.
 *
 * So: a confirmation that names what stops, and a failure that says it
 * failed.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const CONNECTED = {
  connected: true,
  connectedVia: 'oauth' as const,
  gmailAddress: 'kiana@bothmade.studio',
  connectedAt: '2026-02-01T00:00:00.000Z',
  googleOAuthAvailable: true,
  willLandInGmailSent: true,
  canReadInbox: true,
  needsReconnect: false,
  sendingCoveredOrgWide: false,
};

const json = (body: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response;

let gmailStatus: typeof CONNECTED | { connected: false; connectedVia: null; gmailAddress: null };
/** How the DELETE behaves: succeed, fail with a status, or never arrive. */
let deleteBehaviour: 'ok' | 'server-error' | 'offline';
let fetchMock: ReturnType<typeof vi.fn>;

const DISCONNECTED = {
  connected: false as const,
  connectedVia: null,
  gmailAddress: null,
  connectedAt: null,
  googleOAuthAvailable: true,
  willLandInGmailSent: false,
  canReadInbox: false,
  needsReconnect: false,
  sendingCoveredOrgWide: false,
};

beforeEach(() => {
  gmailStatus = { ...CONNECTED };
  deleteBehaviour = 'ok';
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const target = String(url);
    if (target.startsWith('/api/admin/settings/gmail') && init?.method === 'DELETE') {
      if (deleteBehaviour === 'offline') throw new TypeError('Failed to fetch');
      if (deleteBehaviour === 'server-error') return json({ error: 'Internal server error' }, false);
      // A real disconnect changes what the next GET says. Without this the
      // "it worked" test would pass against a route that did nothing.
      gmailStatus = DISCONNECTED;
      return json({ success: true });
    }
    if (target === '/api/admin/settings/gmail/check') return json({ success: true, canRead: true, message: 'ok' });
    if (target.startsWith('/api/admin/settings/gmail')) return json(gmailStatus);
    if (target.startsWith('/api/admin/settings/profile')) return json({ success: true, user: {} });
    if (target.startsWith('/api/admin/settings/preferences')) return json({ success: true, preferences: {} });
    if (target.startsWith('/api/auth/me')) return json({ user: { id: 'u_me', role: 'owner', email: CONNECTED.gmailAddress } });
    return json({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
});

const sentDelete = () =>
  fetchMock.mock.calls.filter(
    ([u, i]) => String(u).startsWith('/api/admin/settings/gmail') && (i as RequestInit)?.method === 'DELETE'
  );

/** Renders, waits for the connected row, and presses Disconnect once. */
const pressDisconnect = async (user: ReturnType<typeof userEvent.setup>) => {
  render(<SettingsPage />);
  await user.click(await screen.findByRole('button', { name: 'Disconnect' }));
};

describe('pressing Disconnect', () => {
  it('does not disconnect anything on its own', async () => {
    const user = userEvent.setup();
    await pressDisconnect(user);

    // The whole point: the first click asks. It used to be the last click.
    expect(sentDelete(), 'the first press must not sever the account').toHaveLength(0);
  });

  it('names the account and what stops working', async () => {
    const user = userEvent.setup();
    await pressDisconnect(user);

    expect(screen.getByText(/Disconnect kiana@bothmade\.studio\?/)).toBeTruthy();
    const warning = screen.getByRole('group', { name: /confirm disconnecting/i });
    expect(warning).toHaveTextContent(/replies stop being matched to their lead/i);
    expect(warning).toHaveTextContent(/bounce notices stop/i);
    // The part that makes this different from a toggle.
    expect(warning).toHaveTextContent(/no undo/i);
  });

  it('lets you back out, leaving the connection alone', async () => {
    const user = userEvent.setup();
    await pressDisconnect(user);

    await user.click(screen.getByRole('button', { name: /keep it connected/i }));

    expect(screen.queryByRole('group', { name: /confirm disconnecting/i })).toBeNull();
    expect(sentDelete()).toHaveLength(0);
    expect(screen.getByText(/connected as/i)).toBeTruthy();
  });

  it('goes through on the second, deliberate press', async () => {
    const user = userEvent.setup();
    await pressDisconnect(user);

    await user.click(screen.getByRole('button', { name: /yes, disconnect/i }));

    await waitFor(() => expect(sentDelete()).toHaveLength(1));
    // And the panel reflects what actually happened, because it reloads.
    await waitFor(() => expect(screen.queryByText(/connected as/i)).toBeNull());
  });
});

describe('when the disconnect does not happen', () => {
  it('says so rather than redrawing as though it did', async () => {
    deleteBehaviour = 'server-error';
    const user = userEvent.setup();
    await pressDisconnect(user);

    await user.click(screen.getByRole('button', { name: /yes, disconnect/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not disconnect/i);
    // The important half of the sentence: it says which side of the failure
    // you are on. "Still connected" is the difference between trying again
    // and going to find out why emails stopped.
    expect(alert).toHaveTextContent(/still connected/i);
    expect(screen.getByText(/connected as/i)).toBeTruthy();
  });

  it('survives the request never arriving at all', async () => {
    deleteBehaviour = 'offline';
    const user = userEvent.setup();
    await pressDisconnect(user);

    await user.click(screen.getByRole('button', { name: /yes, disconnect/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not reach the server/i);
    expect(alert).toHaveTextContent(/nothing was disconnected/i);
    // And the button comes back, rather than sitting on "Disconnecting…"
    // for as long as the tab stays open.
    expect(screen.getByRole('button', { name: /yes, disconnect/i })).not.toBeDisabled();
  });

  it('lets a second attempt through, and clears the old failure', async () => {
    deleteBehaviour = 'server-error';
    const user = userEvent.setup();
    await pressDisconnect(user);
    await user.click(screen.getByRole('button', { name: /yes, disconnect/i }));
    await screen.findByRole('alert');

    deleteBehaviour = 'ok';
    await user.click(screen.getByRole('button', { name: /yes, disconnect/i }));

    await waitFor(() => expect(sentDelete()).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
