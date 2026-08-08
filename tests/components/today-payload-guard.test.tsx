import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Today } from '@/components/admin/dashboard/Today';

/**
 * What this card does when the response is shaped like a success and isn't.
 *
 * The card has a designed failure state — "Couldn't load today's view, the
 * detail below still works" — whose whole purpose is that one panel failing
 * does not cost the dashboard. It was unreachable for this case. The load
 * checked `body.success` and nothing else, then handed the body to a render
 * that reads `deliver.unreadDesignFeedback` unguarded, so a success with a
 * missing lane threw during render instead. A render error goes to the
 * nearest boundary, which took the whole page with it.
 *
 * These render the card in isolation, so a throw here fails the test rather
 * than being swallowed by a boundary — which is exactly the distinction that
 * went unnoticed in the app.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const FULL = {
  success: true,
  sell: { overdueFollowUps: [], repliedCount: 0, neverContactedCount: 0, openedMockups: [] },
  deliver: { unreadDesignFeedback: [], mockupRequests: 0 },
  money: {},
};

function respond(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response));
}

const failureNotice = /Couldn't load today's view/i;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a response that claims success but is missing a lane', () => {
  it('shows the card\'s own failure state instead of throwing', async () => {
    respond({ success: true });

    render(<Today />);

    expect(await screen.findByText(failureNotice)).toBeInTheDocument();
  });

  it('does the same when only the delivery lane is missing', async () => {
    respond({ success: true, sell: FULL.sell, money: {} });

    render(<Today />);

    expect(await screen.findByText(failureNotice)).toBeInTheDocument();
  });

  it('does the same when only the money lane is missing', async () => {
    respond({ success: true, sell: FULL.sell, deliver: FULL.deliver });

    render(<Today />);

    expect(await screen.findByText(failureNotice)).toBeInTheDocument();
  });
});

describe('a response with everything in it', () => {
  it('renders the card rather than the failure state', async () => {
    respond(FULL);

    const { container } = render(<Today />);

    // Nothing to act on in an empty studio, so the assertion worth making is
    // the negative one: it got past the guard and did not report a failure.
    await vi.waitFor(() => expect(container.textContent).not.toMatch(failureNotice));
  });
});

describe('a response that does not claim success at all', () => {
  it('still reports the failure, as it always did', async () => {
    respond({ error: 'Internal server error' }, false);

    render(<Today />);

    expect(await screen.findByText(failureNotice)).toBeInTheDocument();
  });
});
