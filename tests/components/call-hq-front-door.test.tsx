import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CallHqIndex from '@/app/admin/call/page';

/**
 * Clicking "Call HQ" in the sidebar used to open a lead.
 *
 * The route had no page of its own: it fetched the call list and immediately
 * replaced itself with whoever was top of the queue. Press the sidebar link
 * on Monday and you got Brandon Roofing. Press it again on Tuesday, still
 * Brandon Roofing — the same lead every time, with no way to see the queue
 * behind it, and no clue that the link had done anything other than break.
 *
 * The dive-straight-in behaviour is still right for a button that says
 * "Start calling", so it moved behind `?start=1` rather than being deleted.
 * These tests hold both halves apart, because collapsing them again is a
 * one-line change that looks like a tidy-up.
 */

const replace = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
}));

// The queue itself is covered where it lives. Here it only needs to be
// identifiable, and it fetches on mount, which would fight the stub below.
vi.mock('@/components/admin/sales/QueueView', () => ({
  QueueView: () => <div data-testid="queue-view" />,
}));

/** The call list as the API returns it, ranked, top of the queue first. */
function callList(callable: Array<{ id: string }>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, callable }),
  } as unknown as Response;
}

function visit(search: string) {
  window.history.replaceState({}, '', `/admin/call${search}`);
}

beforeEach(() => {
  replace.mockClear();
  push.mockClear();
  visit('');
});

describe('the sidebar link', () => {
  it('lands on Call HQ itself rather than opening somebody', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(callList([{ id: 'brandon' }]));

    render(<CallHqIndex />);

    expect(await screen.findByRole('heading', { name: /call hq/i })).toBeInTheDocument();
    expect(await screen.findByTestId('queue-view')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    // Not even quietly, in the background: nothing about arriving on the page
    // should decide who you are ringing.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('offers the top of the queue as a choice, not as the destination', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(callList([{ id: 'brandon' }]));
    const user = userEvent.setup();

    render(<CallHqIndex />);
    await user.click(await screen.findByRole('button', { name: /start at the top/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/call/brandon'));
  });
});

describe('a "Start calling" button', () => {
  it('still goes straight into the top of the queue', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(callList([{ id: 'brandon' }, { id: 'other' }]));
    visit('?start=1');

    render(<CallHqIndex />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/call/brandon'));
  });

  it('shows the page instead of hanging when there is nobody to ring', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(callList([]));
    visit('?start=1');

    render(<CallHqIndex />);

    expect(await screen.findByRole('heading', { name: /call hq/i })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends a signed-out rep to the login rather than a dead spinner', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as unknown as Response);
    visit('?start=1');

    render(<CallHqIndex />);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/login'));
  });

  it('says so when the queue cannot be loaded', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    visit('?start=1');

    render(<CallHqIndex />);

    expect(await screen.findByText(/couldn't load the queue/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open call hq/i })).toBeInTheDocument();
  });
});
