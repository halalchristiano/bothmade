import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The handover pack, when adding or removing a file does not work.
 *
 * Two halves of the same silence. Uploading awaited the blob upload and
 * caught its failures — and then made a second request, the one that actually
 * puts the file on the record, with no `ok` check at all. A 400 or a 500 fell
 * straight through to a reload: the bytes were in storage, the list came back
 * without them, and nothing was said. An upload that finished and a file that
 * is not there look identical.
 *
 * Deleting had no error handling whatsoever — no check, no catch. The list
 * redrew with the file still in it, which reads as a button that does not
 * work, on the one screen where the reason to remove something is usually
 * that it is the wrong file in front of a client.
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

const FILE = {
  id: 'd1',
  name: 'Brand guidelines.pdf',
  url: 'https://files.test/brand.pdf',
  size: '2.4 MB',
  addedAt: '2026-08-01T09:00:00.000Z',
};

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
  deliverables: [FILE],
};

/** Each panel handed its real shape, or a render throw empties the document. */
function mockFetch(onDelete: () => unknown) {
  const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    const u = String(url);
    if (u.includes('/deliverables') && init?.method === 'DELETE') return onDelete();
    if (u.includes('/notes')) return { ok: true, status: 200, json: async () => ({ success: true, notes: [] }) };
    if (u.includes('/onboarding')) return { ok: true, status: 200, json: async () => ({ success: true, questions: [] }) };
    if (u.includes('/instalments')) return { ok: true, status: 200, json: async () => ({ success: true, instalments: [] }) };
    if (u.includes('/recurring')) return { ok: true, status: 200, json: async () => ({ success: true, offers: [] }) };
    return { ok: true, status: 200, json: async () => ({ success: true, project: PROJECT }) };
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

const remove = () => screen.getAllByRole('button', { name: /remove|delete/i })[0];

async function renderLoaded() {
  render(<ProjectDetailPage />);
  await waitFor(() => expect(screen.getByText('Brand guidelines.pdf')).toBeInTheDocument(), {
    timeout: 8000,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('removing a file from the handover pack', () => {
  it('says so when the route refuses, in the route’s own words', async () => {
    mockFetch(() => ({
      ok: false,
      status: 404,
      json: async () => ({
        error: 'That file is not on this project — it may already have been removed.',
      }),
    }));
    await renderLoaded();

    await userEvent.click(remove());

    expect(
      await screen.findByText(/may already have been removed/i)
    ).toBeInTheDocument();
  });

  it('says so when the request never lands', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await renderLoaded();

    await userEvent.click(remove());

    const said = await screen.findByRole('alert');
    expect(said).toHaveTextContent(/could not reach the server/i);
    // The half that matters: what is still true of the project.
    expect(said).toHaveTextContent(/was not removed/i);
  });

  it('leaves the file where it is, because it is still there', async () => {
    mockFetch(() => ({ ok: false, status: 500, json: async () => ({}) }));
    await renderLoaded();

    await userEvent.click(remove());
    await screen.findByRole('alert');

    expect(screen.getByText('Brand guidelines.pdf')).toBeInTheDocument();
  });

  it('says nothing at all when it works', async () => {
    mockFetch(() => ({ ok: true, status: 200, json: async () => ({ success: true, deliverables: [] }) }));
    await renderLoaded();

    await userEvent.click(remove());

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
