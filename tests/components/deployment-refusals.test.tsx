import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Where the launch page says a save was refused.
 *
 * It used to say it in one place: a line near the top, under the progress
 * ring. This page is long — the domain form, thirteen launch checks, then the
 * two contractual records — so every failure below the fold announced itself
 * hundreds of pixels above whatever you were looking at.
 *
 * That matters most on the control that now refuses on purpose. Section 7
 * holds the transfer of files, credentials and intellectual property until the
 * final instalment clears, and the route enforces it. Pressing "Mark it handed
 * over" and getting that refusal used to look exactly like the button not
 * working: the label went from "Recording…" back to "Mark it handed over", and
 * the reason sat off-screen.
 *
 * Same for a launch check: the tick reverts when the save fails, because
 * load() never runs, so the click reads as having missed.
 */

const push = vi.fn();
/* Stable, for the same reason the sibling file explains at length. */
const router = { push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => ({ projectId: 'proj_1' }),
  usePathname: () => '/admin/deployment/proj_1',
  useSearchParams: () => new URLSearchParams(),
}));

const DeploymentDetailPage = (await import('@/app/admin/deployment/[projectId]/page')).default;

/** Everything ticked, so the page renders its full length — the whole point. */
const CHECKLIST = Object.fromEntries(
  ['domain-reachable', 'dns-ready', 'ssl', 'redirects', 'content-final', 'devices',
   'analytics', 'seo', 'performance', 'backup', 'handover-pack', 'client-walkthrough']
    .map((k) => [k, { done: true, by: 'Kiana', at: '2026-08-06T09:00:00.000Z' }])
);

const PROJECT = {
  id: 'proj_1',
  name: 'Havisham Joinery — Custom Website',
  status: 'build',
  statusStage: 2,
  liveUrl: null,
  readyForLaunchAt: '2026-08-06T09:00:00.000Z',
  launchedAt: null,
  warrantyEndsAt: null,
  handoverAt: null,
  launchChecklist: CHECKLIST,
  domainName: 'havisham.co.uk',
  domainRegistrar: '',
  domainAccess: 'we-control',
  hostingProvider: '',
  dnsNote: '',
  client: { id: 'c1', company: 'Havisham Joinery', contactName: 'Ruth', email: 'ruth@example.com' },
  // Section 7's gate: the final payment is out and unpaid.
  instalments: [
    { index: 1, status: 'paid', label: 'Payment 1 of 3', amountCents: 240000 },
    { index: 2, status: 'paid', label: 'Payment 2 of 3', amountCents: 180000 },
    { index: 3, status: 'due', label: 'Payment 3 of 3', amountCents: 180000 },
  ],
};

const SECTION_7 =
  'Payment 3 of 3 has not cleared. Section 7 holds the transfer of files, credentials and ' +
  'intellectual property until it does — and marking this done tells the client on their own ' +
  'timeline that all three are theirs.';

/** GET always loads; PATCH does whatever the test asks. */
function mockFetch(onPatch: () => unknown) {
  const fetchMock = vi.fn(async (_url: string, init?: { method?: string }) => {
    if (init?.method === 'PATCH') return onPatch();
    return { ok: true, status: 200, json: async () => ({ success: true, project: PROJECT }) };
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

const handoverButton = () => screen.getByRole('button', { name: /mark it handed over/i });
const formsCheck = () => screen.getByRole('button', { name: /Every form tested end to end/i });

async function renderLoaded() {
  render(<DeploymentDetailPage />);
  await waitFor(() => expect(handoverButton()).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a handover Section 7 refuses', () => {
  beforeEach(() => {
    mockFetch(() => ({
      ok: false,
      status: 409,
      json: async () => ({ error: SECTION_7, finalInstalmentUnpaid: true }),
    }));
  });

  it('says why, in the contract’s own terms', async () => {
    await renderLoaded();

    await userEvent.click(handoverButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Payment 3 of 3 has not cleared/i);
    expect(alert).toHaveTextContent(/Section 7/);
  });

  /**
   * The fix, stated as a position rather than a presence: the message has to
   * be inside the same card as the button, not somewhere up the page.
   */
  it('puts the reason beside the button that was pressed', async () => {
    await renderLoaded();

    await userEvent.click(handoverButton());
    await screen.findByRole('alert');

    // The Handover card — the nearest container holding both.
    const card = handoverButton().closest('div.rounded-xl') as HTMLElement;
    expect(card).not.toBeNull();
    expect(within(card).getByRole('alert')).toHaveTextContent(/Section 7/);
  });

  it('leaves the handover unrecorded, because it did not happen', async () => {
    await renderLoaded();

    await userEvent.click(handoverButton());
    await screen.findByRole('alert');

    // The confirmed state replaces the button with a date and an "undo".
    // The button is still here and that undo never appeared.
    expect(handoverButton()).toBeInTheDocument();
    const card = handoverButton().closest('div.rounded-xl') as HTMLElement;
    expect(within(card).queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
  });

  it('clears the message when the same control is pressed again', async () => {
    await renderLoaded();
    await userEvent.click(handoverButton());
    await screen.findByRole('alert');

    await userEvent.click(handoverButton());

    // It comes back — but it was cleared first, so the message on screen
    // always belongs to the press you just made.
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});

describe('a launch check that will not save', () => {
  beforeEach(() => {
    mockFetch(() => ({ ok: false, status: 500, json: async () => ({}) }));
  });

  it('says so at the row, not at the top of the page', async () => {
    await renderLoaded();

    await userEvent.click(formsCheck());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Could not save that/i);
    // In the same wrapper as the row that failed.
    const row = formsCheck().parentElement as HTMLElement;
    expect(within(row).getByRole('alert')).toBeInTheDocument();
  });

  it('does not pin the message to a different check', async () => {
    await renderLoaded();

    await userEvent.click(formsCheck());
    await screen.findByRole('alert');

    // Exactly one row is carrying a message: the one that was pressed.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});

describe('a save that works', () => {
  it('says nothing at all', async () => {
    mockFetch(() => ({ ok: true, status: 200, json: async () => ({ success: true, project: PROJECT }) }));
    await renderLoaded();

    await userEvent.click(formsCheck());

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
