import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The internal notes panel — the last place the "empty or failed?" lie was
 * still being told.
 *
 * All five Delivery lists were fixed for this: a failed request left the rows
 * at [] and the page announced the empty state in the studio's own confident
 * voice. This panel does the same thing on the project page, and it was
 * missed. `loadNotes` checked neither the status nor the network, so a 500 or
 * a dead connection said "No internal notes yet." on a project where somebody
 * had written "spoke to Dana, she wants the booking form above the fold".
 *
 * And adding one had no catch and no check: the text stayed in the box, which
 * is right, but nothing said why — and a note still sitting there reads as
 * "it saved and the panel is slow".
 */

const push = vi.fn();
const router = { push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => ({ projectId: 'proj_1' }),
  usePathname: () => '/admin/projects/proj_1',
  useSearchParams: () => new URLSearchParams(),
}));

const ProjectDetailPage = (await import('@/app/admin/projects/[projectId]/page')).default;

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

const NOTE = {
  id: 'n1',
  content: 'Spoke to Dana — booking form above the fold.',
  createdAt: '2026-08-05T09:00:00.000Z',
  author: { id: 'u1', name: 'Kiana' },
};

/** Each panel gets its real shape; only the notes calls vary. */
function mockFetch(onNotesGet: () => unknown, onNotesPost: () => unknown = () => ({ ok: true, status: 201, json: async () => ({ success: true }) })) {
  const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    const u = String(url);
    if (u.includes('/notes')) return init?.method === 'POST' ? onNotesPost() : onNotesGet();
    if (u.includes('/onboarding')) return { ok: true, status: 200, json: async () => ({ success: true, questions: [] }) };
    if (u.includes('/instalments')) return { ok: true, status: 200, json: async () => ({ success: true, instalments: [] }) };
    if (u.includes('/recurring')) return { ok: true, status: 200, json: async () => ({ success: true, offers: [] }) };
    return { ok: true, status: 200, json: async () => ({ success: true, project: PROJECT }) };
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

const notesOk = (notes: unknown[]) => () => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, notes }),
});

const box = () => screen.getByPlaceholderText(/Note to the rest of the team/i);
const addButton = () => screen.getByRole('button', { name: /add internal note/i });

async function renderLoaded() {
  render(<ProjectDetailPage />);
  await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument(), { timeout: 8000 });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('when the notes cannot be loaded', () => {
  it('does not claim the project has none', async () => {
    mockFetch(() => ({ ok: false, status: 500, json: async () => ({}) }));
    await renderLoaded();

    const said = await screen.findByRole('alert');
    expect(said).toHaveTextContent(/could not be loaded/i);
    expect(said).toHaveTextContent(/not a project with nothing written on it/i);
    expect(screen.queryByText(/No internal notes yet/i)).not.toBeInTheDocument();
  });

  it('offers to try again', async () => {
    mockFetch(() => ({ ok: false, status: 500, json: async () => ({}) }));
    await renderLoaded();
    await screen.findByRole('alert');

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('says the same when the request never lands', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await renderLoaded();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
  });
});

describe('when there genuinely are none', () => {
  it('says so, which is the whole point of telling the two apart', async () => {
    mockFetch(notesOk([]));
    await renderLoaded();

    await waitFor(() => expect(screen.getByText(/No internal notes yet/i)).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the notes when there are some', async () => {
    mockFetch(notesOk([NOTE]));
    await renderLoaded();

    // The panel and the activity feed can both carry it; one is enough.
    await waitFor(() =>
      expect(screen.getAllByText(/booking form above the fold/i).length).toBeGreaterThan(0)
    );
  });
});

describe('adding a note that will not save', () => {
  it('says so rather than leaving it looking slow', async () => {
    mockFetch(notesOk([]), () => ({ ok: false, status: 500, json: async () => ({}) }));
    await renderLoaded();
    await waitFor(() => expect(screen.getByText(/No internal notes yet/i)).toBeInTheDocument());

    await userEvent.type(box(), 'Chased the logo files.');
    await userEvent.click(addButton());

    expect(await screen.findByText(/was not saved/i)).toBeInTheDocument();
  });

  it('keeps what was typed, so it is not lost', async () => {
    mockFetch(notesOk([]), () => ({ ok: false, status: 500, json: async () => ({}) }));
    await renderLoaded();
    await waitFor(() => expect(screen.getByText(/No internal notes yet/i)).toBeInTheDocument());

    await userEvent.type(box(), 'Chased the logo files.');
    await userEvent.click(addButton());
    await screen.findByText(/was not saved/i);

    expect(box()).toHaveValue('Chased the logo files.');
  });

  it('prefers the route’s own sentence', async () => {
    mockFetch(notesOk([]), () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Write something first — a blank note helps nobody.' }),
    }));
    await renderLoaded();
    await waitFor(() => expect(screen.getByText(/No internal notes yet/i)).toBeInTheDocument());

    await userEvent.type(box(), 'x');
    await userEvent.click(addButton());

    expect(await screen.findByText(/a blank note helps nobody/i)).toBeInTheDocument();
  });

  it('says nothing at all when it works', async () => {
    mockFetch(notesOk([]));
    await renderLoaded();
    await waitFor(() => expect(screen.getByText(/No internal notes yet/i)).toBeInTheDocument());

    await userEvent.type(box(), 'Chased the logo files.');
    await userEvent.click(addButton());

    await waitFor(() => expect(box()).toHaveValue(''));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
