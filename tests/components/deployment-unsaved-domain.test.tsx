import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The one block on the deployment page that does not save itself.
 *
 * Every checklist tick here PATCHes on click. The domain block does not — it
 * sits behind an explicit Save, and it is also the only place on the page
 * holding free text somebody typed once: "MX records point at Microsoft 365 —
 * do not touch them. Cutover agreed for Tuesday morning." That comes out of a
 * phone call with the client's IT company, at the point somebody finally got
 * hold of them, and it is not reconstructable from anywhere.
 *
 * The control that lost it was the "← Launch board" link three inches above.
 */

const push = vi.fn();
/*
 * One router object for the whole file, not a fresh one per call.
 *
 * `load` is a useCallback keyed on [projectId, router], and the effect that
 * runs it is keyed on [load]. A mock handing back a new object each render
 * gives it a new identity every time, so the page refetches on every render
 * and `load` resets domainDirty — which quietly makes it impossible to test
 * the unsaved state at all. Next's own useRouter is stable; a stub that is
 * not stable is testing a component nobody ships.
 */
const router = { push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => ({ projectId: 'proj_1' }),
  usePathname: () => '/admin/deployment/proj_1',
  useSearchParams: () => new URLSearchParams(),
}));

const DeploymentDetailPage = (await import('@/app/admin/deployment/[projectId]/page')).default;

const PROJECT = {
  id: 'proj_1',
  name: 'Okafor Plumbing Site',
  status: 'build',
  statusStage: 2,
  liveUrl: null,
  warrantyEndsAt: null,
  launchChecklist: {},
  domainName: 'okaforplumbing.co.uk',
  domainRegistrar: '',
  domainAccess: '',
  hostingProvider: '',
  dnsNote: '',
  client: { id: 'c1', company: 'Okafor Plumbing', contactName: 'Dana', email: 'dana@example.com' },
  instalments: [
    { index: 1, status: 'paid', label: 'Payment 1 of 3', amountCents: 100000 },
    { index: 2, status: 'paid', label: 'Payment 2 of 3', amountCents: 100000 },
    { index: 3, status: 'due', label: 'Payment 3 of 3', amountCents: 100000 },
  ],
};

function mockFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, project: PROJECT }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const dnsNote = () =>
  screen.getByPlaceholderText(/MX records point at Microsoft 365/i);
const backLink = () => screen.getByRole('link', { name: /launch board/i });

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch();
});

async function renderLoaded() {
  render(<DeploymentDetailPage />);
  await waitFor(() => expect(dnsNote()).toBeInTheDocument());
}

describe('unsaved DNS notes', () => {
  it('says so, rather than only offering a button', async () => {
    await renderLoaded();

    await userEvent.type(dnsNote(), 'Cutover agreed for Tuesday morning.');

    // A Save button appearing reads as an affordance, not a warning.
    expect(screen.getByText(/not saved yet/i)).toBeInTheDocument();
  });

  it('asks before letting a link throw them away', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderLoaded();

    await userEvent.type(dnsNote(), 'Do not touch the MX records.');
    await userEvent.click(backLink());

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatch(/not been saved/i);
  });

  it('lets them leave on the second thought, not hold them hostage', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderLoaded();

    await userEvent.type(dnsNote(), 'Anything at all');
    await userEvent.click(backLink());

    // Confirmed means confirmed — the navigation is not cancelled.
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('stays out of the way when nothing has been typed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderLoaded();

    await userEvent.click(backLink());

    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByText(/not saved yet/i)).toBeNull();
  });
});

/**
 * The board and this page have to agree about Section 7, and they did not:
 * both read "the final instalment" as the last element of an array, but only
 * this page's API ordered its rows.
 */
describe('the launch verdict on this page', () => {
  it('holds the launch on the unpaid final payment, not the last row it was handed', async () => {
    await renderLoaded();

    // Payments 1 and 2 are paid, 3 is due — reading positionally against an
    // unordered schedule is what called this project clear to go live.
    expect(screen.getByText(/Payment 3 of 3 has not cleared/i)).toBeInTheDocument();
  });
});
