import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Picking a stage the project has already passed.
 *
 * The stage copy is written forward — "Design has started", "Discovery's done
 * and we're designing" — and the picker loaded it for whatever you chose,
 * including a stage you were moving BACK to. Under a button that says "Send
 * Status Update". Pressing it told a client whose site was in Build that
 * design had just begun, in our own words, apparently on purpose.
 *
 * So the picker now fills in nothing on the way back, which is what makes the
 * route treat it as a correction and tell nobody — and the page says so
 * before the press rather than after it.
 */

const push = vi.fn();
/* Stable: an unstable router remounts the page and resets the draft. */
const router = { push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => ({ projectId: 'proj_1' }),
  usePathname: () => '/admin/projects/proj_1',
  useSearchParams: () => new URLSearchParams(),
}));

const ProjectDetailPage = (await import('@/app/admin/projects/[projectId]/page')).default;

/** Sitting at Build, so design and discovery are behind it. */
const PROJECT = {
  id: 'proj_1',
  name: 'Havisham Joinery — Custom Website',
  status: 'build',
  statusStage: 2,
  totalPrice: 600000,
  basePrice: 600000,
  baseService: 'custom',
  addOns: '',
  liveUrl: null,
  designUrl: null,
  estimatedCompletionDate: null,
  handoffAcknowledgedAt: null,
  createdAt: '2026-07-01T09:00:00.000Z',
  updatedAt: '2026-08-06T09:00:00.000Z',
  client: { id: 'c1', company: 'Havisham Joinery', contactName: 'Ruth', email: 'ruth@havisham.co.uk' },
  updates: [],
  messages: [],
  payments: [],
  onboardingQuestions: [],
  deliverables: [],
};

/*
 * The page loads five things, and a panel handed `undefined` where it expects
 * a list throws during render — which shows up as an empty document rather
 * than a failed assertion. Each one gets its real shape.
 */
function mockFetch(onStatusPatch: () => unknown) {
  const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    const u = String(url);
    if (u.includes('/status') && init?.method === 'PATCH') return onStatusPatch();
    if (u.includes('/notes')) return { ok: true, status: 200, json: async () => ({ success: true, notes: [] }) };
    if (u.includes('/onboarding')) return { ok: true, status: 200, json: async () => ({ success: true, questions: [] }) };
    if (u.includes('/instalments')) return { ok: true, status: 200, json: async () => ({ success: true, instalments: [] }) };
    if (u.includes('/recurring')) return { ok: true, status: 200, json: async () => ({ success: true, offers: [] }) };
    return { ok: true, status: 200, json: async () => ({ success: true, project: PROJECT }) };
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

const ok = () => ({ ok: true, status: 200, json: async () => ({ success: true }) });
const corrected = () => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, correctedSilently: true, update: null, gateOpened: null }),
});

const stagePicker = () => screen.getByRole('combobox');
const message = () => screen.getByPlaceholderText(/Describe this update for the client/i);

async function renderLoaded() {
  render(<ProjectDetailPage />);
  await waitFor(() => expect(stagePicker()).toBeInTheDocument(), { timeout: 8000 });
}

/** The status PATCH bodies actually sent. */
function statusBodies(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls
    .filter(
      (c) =>
        String(c[0]).includes('/status') &&
        (c[1] as { method?: string } | undefined)?.method === 'PATCH'
    )
    .map((c) => JSON.parse((c[1] as { body: string }).body));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('picking a stage the project has already passed', () => {
  it('fills in nothing, rather than that stage’s opening announcement', async () => {
    mockFetch(ok);
    await renderLoaded();

    await userEvent.selectOptions(stagePicker(), 'design');

    // "Design has started — Discovery's done and we're designing…" is exactly
    // what must NOT be sitting in the box.
    expect(message()).toHaveValue('');
  });

  it('says what pressing it will do, before it is pressed', async () => {
    mockFetch(ok);
    await renderLoaded();

    await userEvent.selectOptions(stagePicker(), 'design');

    const note = await screen.findByText(/a correction/i);
    expect(note).toHaveTextContent(/the client is not told/i);
  });

  it('stops calling itself an update', async () => {
    mockFetch(ok);
    await renderLoaded();

    await userEvent.selectOptions(stagePicker(), 'design');

    expect(screen.getByRole('button', { name: /correct the stage/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send status update/i })).not.toBeInTheDocument();
  });

  it('sends no description, which is what makes it a correction', async () => {
    const fetchMock = mockFetch(corrected);
    await renderLoaded();
    await userEvent.selectOptions(stagePicker(), 'design');

    await userEvent.click(screen.getByRole('button', { name: /correct the stage/i }));

    await waitFor(() => expect(statusBodies(fetchMock)).toHaveLength(1));
    expect(statusBodies(fetchMock)[0]).toEqual({ status: 'design', description: '' });
  });

  it('reports afterwards that nobody was told', async () => {
    mockFetch(corrected);
    await renderLoaded();
    await userEvent.selectOptions(stagePicker(), 'design');

    await userEvent.click(screen.getByRole('button', { name: /correct the stage/i }));

    expect(await screen.findByText(/was not emailed/i)).toBeInTheDocument();
  });

  /** Writing something turns it back into a deliberate message. */
  it('goes back to being a send once something is written', async () => {
    mockFetch(ok);
    await renderLoaded();
    await userEvent.selectOptions(stagePicker(), 'design');

    await userEvent.type(message(), 'Reopening the design — new brand guidelines.');

    expect(screen.getByRole('button', { name: /send status update/i })).toBeInTheDocument();
    expect(screen.getByText(/they will be emailed it/i)).toBeInTheDocument();
  });
});

describe('picking a stage the project has not reached', () => {
  it('still fills in that stage’s words, which is the whole feature', async () => {
    mockFetch(ok);
    await renderLoaded();

    await userEvent.selectOptions(stagePicker(), 'launch');

    await waitFor(() => expect(message()).not.toHaveValue(''));
    expect(screen.getByRole('button', { name: /send status update/i })).toBeInTheDocument();
    expect(screen.queryByText(/a correction/i)).not.toBeInTheDocument();
  });
});
