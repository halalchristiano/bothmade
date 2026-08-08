import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecurringCarePanel } from '@/components/admin/RecurringCarePanel';

/**
 * What the care-plan panel does when the response is shaped like a success
 * and isn't.
 *
 * It trusted `payload.success` and then read `payload.defaults.addOns`, and
 * in the render `data?.offers.find(...)`. That optional chain guards `data`
 * being null and nothing else — so a payload missing a key threw twice: once
 * inside the loader, where nothing catches it, and again during render. A
 * render error goes to the nearest boundary, which meant one panel with a bad
 * payload took the entire project page down. That page is the busiest screen
 * in the admin and the care plan is the least important thing on it.
 *
 * Rendered in isolation, so a throw fails the test instead of being swallowed
 * by a boundary — which is the distinction that let this sit unnoticed.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const FULL = {
  success: true,
  alreadyInScope: [],
  catalogue: [],
  defaults: { addOns: [], discountMonths: 3, freeMonths: 0, maxPercent: 30 },
  offers: [],
};

function respond(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response)
  );
}

const failureNotice = /Couldn't load the care plan/i;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a response that claims success but is missing a key', () => {
  it('says so instead of throwing, when there are no offers on it', async () => {
    respond({ success: true, defaults: FULL.defaults });

    render(<RecurringCarePanel projectId="p_1" />);

    expect(await screen.findByText(failureNotice)).toBeInTheDocument();
  });

  it('does the same when the defaults are missing', async () => {
    respond({ success: true, offers: [] });

    render(<RecurringCarePanel projectId="p_1" />);

    expect(await screen.findByText(failureNotice)).toBeInTheDocument();
  });

  it('does the same for a bare success', async () => {
    respond({ success: true });

    render(<RecurringCarePanel projectId="p_1" />);

    expect(await screen.findByText(failureNotice)).toBeInTheDocument();
  });
});

describe('a response that failed outright', () => {
  it('reports it rather than sitting on "Loading care plan…" forever', async () => {
    respond({ error: 'Internal server error' }, false);

    render(<RecurringCarePanel projectId="p_1" />);

    expect(await screen.findByText(failureNotice)).toBeInTheDocument();
  });

  it('reports it when the server cannot be reached at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch);

    render(<RecurringCarePanel projectId="p_1" />);

    expect(await screen.findByText(failureNotice)).toBeInTheDocument();
  });
});

describe('a well-formed response', () => {
  it('renders the panel and reports nothing', async () => {
    respond(FULL);

    const { container } = render(<RecurringCarePanel projectId="p_1" />);

    await vi.waitFor(() => expect(container.textContent).not.toMatch(/Loading care plan/i));
    expect(container.textContent).not.toMatch(failureNotice);
  });
});
