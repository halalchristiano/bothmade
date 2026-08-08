import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '@/app/admin/settings/page';

/**
 * The one Gmail state that announced itself nowhere.
 *
 * Sending and reading are separate capabilities, and only one of them tells
 * you when it breaks. A send failure is somebody's email not going out. A
 * read failure is silent: the token still sends, so nothing changes on any
 * screen while replies stop being matched to their lead and bounce notices
 * stop turning dead addresses into "call instead".
 *
 * This panel keyed off `connected`, which is true the moment a refresh token
 * exists — so that state rendered a green tick and the word "Connected",
 * under a small amber chip reading "Send only". The page you would come to in
 * order to fix it was the page telling you nothing was wrong.
 *
 * And nothing here ever asked. `gmailNeedsReconnect` was written only by the
 * nightly bounce job, so the answer on screen could be a day old, or from
 * before the token was revoked.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams() }));

const CONNECTED = {
  connected: true,
  connectedVia: 'oauth' as 'oauth' | 'app-password',
  gmailAddress: 'kiana@bothmade.studio',
  connectedAt: '2026-02-01T00:00:00.000Z',
  googleOAuthAvailable: true,
  willLandInGmailSent: true,
  canReadInbox: true,
  needsReconnect: false,
  sendingCoveredOrgWide: false,
};

const json = (body: unknown, ok = true, status = ok ? 200 : 500) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

let gmailStatus: typeof CONNECTED;
let checkResponse: unknown;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  push.mockClear();
  gmailStatus = { ...CONNECTED };
  checkResponse = { success: true, canRead: true, needsReconnect: false, message: 'Checked — this connection can read your inbox, so replies and bounce notices are being seen.' };
  fetchMock = vi.fn(async (url: string) => {
    const target = String(url);
    if (target === '/api/admin/settings/gmail/check') return json(checkResponse);
    if (target.startsWith('/api/admin/settings/gmail')) return json(gmailStatus);
    if (target.startsWith('/api/admin/settings/profile')) return json({ success: true, user: {} });
    if (target.startsWith('/api/admin/settings/preferences')) return json({ success: true, preferences: {} });
    if (target.startsWith('/api/auth/me')) return json({ user: { id: 'u_me', role: 'owner', email: CONNECTED.gmailAddress } });
    return json({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
});

describe('a connection that can send but has stopped reading', () => {
  it('does not call itself connected', async () => {
    gmailStatus = { ...CONNECTED, canReadInbox: false, needsReconnect: true };
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText(/reading has stopped for/i)).toBeTruthy());
    expect(screen.queryByText(/^Connected as $/)).toBeNull();
  });

  it('says what has actually stopped, in terms of the work it breaks', async () => {
    gmailStatus = { ...CONNECTED, canReadInbox: false, needsReconnect: true };
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText(/replies are no longer matched to their lead/i)).toBeTruthy());
    expect(screen.getByText(/bounce notices are no longer/i)).toBeTruthy();
  });

  it('puts the way to fix it on the same panel', async () => {
    gmailStatus = { ...CONNECTED, canReadInbox: false, needsReconnect: true };
    render(<SettingsPage />);

    const link = await screen.findByRole('link', { name: /reconnect google/i });
    expect(link.getAttribute('href')).toBe('/api/admin/settings/gmail-oauth/start');
  });

  it('still shows the green panel when reading works', async () => {
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText(/connected as/i)).toBeTruthy());
    expect(screen.queryByText(/reading has stopped/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /reconnect google/i })).toBeNull();
  });
});

describe('checking the connection instead of reporting what we last thought', () => {
  it('asks Google, and says so when reading works', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(await screen.findByRole('button', { name: /check this connection/i }));

    await waitFor(() => expect(screen.getByText(/can read your inbox/i)).toBeTruthy());
    expect(fetchMock.mock.calls.some(([u, i]) => String(u) === '/api/admin/settings/gmail/check' && (i as RequestInit)?.method === 'POST')).toBe(true);
  });

  it('turns the panel amber in the same click when it finds reading has lapsed', async () => {
    const user = userEvent.setup();
    checkResponse = {
      success: true,
      canRead: false,
      needsReconnect: true,
      message: 'Google needs reconnecting — this connection can send but not read.',
    };
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText(/connected as/i)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /check this connection/i }));

    await waitFor(() => expect(screen.getByText(/reading has stopped for/i)).toBeTruthy());
    expect(screen.getByRole('link', { name: /reconnect google/i })).toBeTruthy();
  });

  it('clears a stale amber panel when the check finds reading fine', async () => {
    const user = userEvent.setup();
    gmailStatus = { ...CONNECTED, canReadInbox: false, needsReconnect: true };
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText(/reading has stopped for/i)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /check this connection/i }));

    await waitFor(() => expect(screen.queryByText(/reading has stopped for/i)).toBeNull());
    expect(screen.getByText(/connected as/i)).toBeTruthy();
  });

  it('does not declare the connection broken because Google was busy', async () => {
    const user = userEvent.setup();
    checkResponse = {
      success: true,
      canRead: false,
      needsReconnect: false,
      message: 'Google did not answer just now. That is usually temporary; try again in a moment.',
    };
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText(/connected as/i)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /check this connection/i }));

    await waitFor(() => expect(screen.getByText(/usually temporary/i)).toBeTruthy());
    // Still no reconnect prompt — a quota or a bad minute is not a reason to
    // tear down a working connection and rebuild it.
    expect(screen.queryByRole('link', { name: /reconnect google/i })).toBeNull();
    // And nothing about the connection is downgraded either: an inconclusive
    // check must not report an outage as a broken connection.
    expect(screen.getByText(/connected as/i)).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
  });

  it('is not offered for an App Password, which can never read', async () => {
    gmailStatus = { ...CONNECTED, connectedVia: 'app-password', canReadInbox: false, needsReconnect: false };
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText(/connected as/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /check this connection/i })).toBeNull();
  });
});

describe('a session that has run out', () => {
  it('sends them to log in rather than telling them Gmail is disconnected', async () => {
    // A 401 carries a JSON body, so `res.json()` resolved happily with
    // `{ error: 'Unauthorized' }` and this page set it as the Gmail status.
    // `connected` came out undefined, and the panel stated the studio's
    // mailbox was not set up — with a button offering to connect it.
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith('/api/admin/settings')
        ? json({ error: 'Unauthorized' }, false, 401)
        : json({ success: true })
    );
    render(<SettingsPage />);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/login'));
    expect(screen.queryByText(/not connected/i)).toBeNull();
  });
});
