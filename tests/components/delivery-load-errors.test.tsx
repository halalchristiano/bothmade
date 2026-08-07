import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * What the Delivery pages say when they cannot load.
 *
 * All five held their rows in a `[]` that a failed request never replaced,
 * then rendered the empty state — so an API that was down announced "Nothing
 * in design right now", "Projects appear here once they reach Build. Nothing
 * has yet.", and "Nothing needs you right now."
 *
 * On a work queue that is not a display state, it is an instruction. It says
 * today's design round is nobody's problem, no launch is waiting, and there
 * is nothing to chase — and it says it in the studio's own confident voice,
 * which is exactly why nobody would think to reload.
 *
 * Priorities was worse again: a non-`success` body returned early and left
 * `rows` at its null loading sentinel, so the page sat on "Loading
 * priorities…" indefinitely. A spinner with no end is the one failure with
 * nothing to read and nothing to press.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/design',
  useSearchParams: () => new URLSearchParams(),
}));

const DesignPage = (await import('@/app/admin/design/page')).default;
const DeploymentPage = (await import('@/app/admin/deployment/page')).default;
const PrioritiesPage = (await import('@/app/admin/priorities/page')).default;

/** A fetch that fails the way a real one does: 500, or nothing at all. */
function failWith(mode: 'status' | 'throw' | 'unsuccessful') {
  const fetchMock = vi.fn(async () => {
    if (mode === 'throw') throw new TypeError('Failed to fetch');
    if (mode === 'status') return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ success: false }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function succeedWith(body: unknown) {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const alert = () => screen.getByRole('alert');
const retry = () => screen.getByRole('button', { name: /try again/i });

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each([
  [
    'Design',
    () => <DesignPage />,
    /could not load the design queue/i,
    /nothing in design right now/i,
    /^Loading the design queue/i,
  ],
  [
    'Deployment',
    () => <DeploymentPage />,
    /could not load the launch board/i,
    /nothing has yet/i,
    /^Loading the launch board/i,
  ],
  [
    'Priorities',
    () => <PrioritiesPage />,
    /could not load the priority list/i,
    /nothing needs you right now/i,
    /^Loading priorities/i,
  ],
] as const)('%s', (_name, renderPage, errorText, emptyText, spinnerText) => {
  it('says the load failed instead of showing an empty queue', async () => {
    failWith('status');

    render(renderPage());

    await waitFor(() => expect(alert()).toBeInTheDocument());
    expect(alert()).toHaveTextContent(errorText);
    // The dangerous sentence: confident, specific, and untrue.
    expect(screen.queryByText(emptyText)).toBeNull();
  });

  it('treats a network failure the same as a bad status', async () => {
    failWith('throw');

    render(renderPage());

    await waitFor(() => expect(alert()).toBeInTheDocument());
    expect(screen.queryByText(emptyText)).toBeNull();
  });

  it('treats a 200 that is not a success as a failure too', async () => {
    failWith('unsuccessful');

    render(renderPage());

    await waitFor(() => expect(alert()).toBeInTheDocument());
  });

  it('never strands the page on a spinner', async () => {
    failWith('unsuccessful');

    render(renderPage());

    // Priorities used to return early here and leave its loading sentinel in
    // place, so the page never resolved to anything at all. Matched on the
    // page's own spinner copy — a loose /loading/ also hits the word inside
    // the error card, which would make this pass for the wrong reason.
    await waitFor(() => expect(screen.queryByText(spinnerText)).toBeNull());
  });

  it('offers a way back rather than just an apology', async () => {
    const fetchMock = failWith('status');

    render(renderPage());
    await waitFor(() => expect(alert()).toBeInTheDocument());

    const callsBefore = fetchMock.mock.calls.length;
    await userEvent.click(retry());

    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

describe('a load that works', () => {
  it('shows the real empty state, not the error, when the queue is genuinely empty', async () => {
    succeedWith({ success: true, projects: [] });

    render(<DesignPage />);

    await waitFor(() => expect(screen.getByText(/nothing in design right now/i)).toBeInTheDocument());
    // "Nothing to do" is still a sentence this page is allowed to say — when
    // it knows it is true.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
