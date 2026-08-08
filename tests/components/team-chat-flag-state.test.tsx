import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TeamChatPage from '@/app/admin/team-chat/page';

/**
 * A flag one person clears, on everybody else's screen.
 *
 * The chat polls every ten seconds for `createdAt > lastSeen`, which is the
 * right question for "what has been said since" and the wrong one for "what
 * has changed". Resolving edits a row without moving its timestamp, so it was
 * invisible to every other tab: the rail kept counting an urgent question
 * somebody had already dealt with, and the Flags view kept offering to
 * resolve it, until that person happened to reload the page.
 *
 * The composer says a flagged question "stays on the board until someone
 * resolves it". That is the promise, and it was only being kept for whoever
 * clicked.
 */

// A stable router object on purpose. `load` is a useCallback keyed on it, and
// the polling effect is keyed on `load` — hand back a fresh object each render
// and the effect re-runs, re-issuing the *initial* fetch. That would quietly
// paper over the very bug under test: the page would look like it had picked
// up the resolve when all it had done was reload the world.
const router = { push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('../../app/admin/layout', () => ({
  useAdminSession: () => ({ userName: 'Kiana', userId: 'u_me', userRole: 'owner' }),
}));

const FLAGGED = {
  id: 'm_1',
  content: 'Can we quote below the floor on Acme?',
  kind: 'chat' as const,
  fromUserId: 'u_evan',
  fromUser: { id: 'u_evan', name: 'Evan', email: 'evan@bothmade.studio' },
  toUserId: null,
  relatedLeadId: null,
  relatedProjectId: null,
  urgent: true,
  resolved: false,
  attachments: [],
  createdAt: '2026-08-08T10:00:00.000Z',
};

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;
/** What the next poll will say about the flagged set. */
let flagState: Array<{ id: string; resolved: boolean }> | undefined;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  flagState = undefined;
  fetchMock = vi.fn(async (url: string) => {
    const target = String(url);
    if (target.startsWith('/api/admin/users')) return json({ success: true, users: [] });
    if (target.startsWith('/api/admin/team-messages?after=')) {
      // A poll: no new messages, only the state of the flags.
      return json({ success: true, messages: [], ...(flagState ? { flags: flagState } : {}) });
    }
    if (target.startsWith('/api/admin/team-messages')) {
      // The first load, which happens once and reads the flag as still open.
      // Everything after it has to arrive through the poll.
      return json({ success: true, messages: [FLAGGED] });
    }
    return json({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Ten seconds of polling, the interval the page actually runs on. */
const poll = async () => {
  await vi.advanceTimersByTimeAsync(10_000);
};

describe('a flag somebody else resolved', () => {
  it('stops being counted on the rail', async () => {
    render(<TeamChatPage />);
    await waitFor(() => expect(screen.getByText('Mark resolved')).toBeTruthy());

    // The rail's count, beside the Flags view.
    expect(screen.getByText('1')).toBeTruthy();

    flagState = [{ id: 'm_1', resolved: true }];
    await poll();

    await waitFor(() => expect(screen.queryByText('Mark resolved')).toBeNull());
    expect(screen.getByText('Reopen')).toBeTruthy();
  });

  it('comes back when they reopen it', async () => {
    render(<TeamChatPage />);
    await waitFor(() => expect(screen.getByText('Mark resolved')).toBeTruthy());

    flagState = [{ id: 'm_1', resolved: true }];
    await poll();
    await waitFor(() => expect(screen.getByText('Reopen')).toBeTruthy());

    flagState = [{ id: 'm_1', resolved: false }];
    await poll();
    await waitFor(() => expect(screen.getByText('Mark resolved')).toBeTruthy());
  });

  it('leaves the message itself alone — this reconciles state, not content', async () => {
    render(<TeamChatPage />);
    await waitFor(() => expect(screen.getByText(FLAGGED.content)).toBeTruthy());

    flagState = [{ id: 'm_1', resolved: true }];
    await poll();

    await waitFor(() => expect(screen.getByText('Reopen')).toBeTruthy());
    expect(screen.getByText(FLAGGED.content)).toBeTruthy();
  });

  it('ignores ids it has never seen rather than inventing rows for them', async () => {
    render(<TeamChatPage />);
    await waitFor(() => expect(screen.getByText('Mark resolved')).toBeTruthy());

    flagState = [{ id: 'm_from_a_dm_i_cannot_see', resolved: true }];
    await poll();

    // Nothing about our own flag changed, and nothing appeared.
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('after='))).toBe(true));
    expect(screen.getByText('Mark resolved')).toBeTruthy();
    expect(screen.getByText(FLAGGED.content)).toBeTruthy();
  });

  it('survives a poll that carries no flag state at all', async () => {
    render(<TeamChatPage />);
    await waitFor(() => expect(screen.getByText('Mark resolved')).toBeTruthy());

    flagState = undefined;
    await poll();

    expect(screen.getByText('Mark resolved')).toBeTruthy();
  });
});
