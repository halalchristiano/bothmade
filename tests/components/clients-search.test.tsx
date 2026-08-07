import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The Clients page had its own search box: a bare input with a placeholder and
 * nothing else, while Design, Projects and Mockups all use the shared one.
 *
 * Three things follow from that, none visible in a screenshot. The placeholder
 * vanishes the moment anybody types, so a screen reader announces the field as
 * unnamed and the only clue to what it filters is gone exactly when it is
 * being used. There is no clear button, so the way back to the full list is to
 * select the text and delete it. And with no match count, a search that finds
 * nothing looks the same as a client list that has lost its rows — the same
 * confusion the empty-state work was about, one control along.
 */

const push = vi.fn();
const router = { push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/admin/clients',
  useSearchParams: () => new URLSearchParams(),
}));

const ClientsPage = (await import('@/app/admin/clients/page')).default;

const CLIENTS = [
  { id: 'c1', company: 'Okafor Plumbing', email: 'dana@okafor.co.uk', archivedAt: null, projects: [] },
  { id: 'c2', company: 'Havis Roofing', email: 'sam@havis.co.uk', archivedAt: null, projects: [] },
];

function mockFetch(clients = CLIENTS) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, clients }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const searchBox = () => screen.getByLabelText(/search by email or company/i);

/*
 * getAllByText, not getByText: the page renders a card list for mobile and a
 * table for desktop, both always in the DOM with one hidden by CSS. A company
 * therefore legitimately appears twice, and jsdom applies no media queries.
 */
const shown = (company: string) => screen.queryAllByText(company).length > 0;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch();
});

async function renderLoaded() {
  render(<ClientsPage />);
  await waitFor(() => expect(shown('Okafor Plumbing')).toBe(true));
}

describe('searching the client list', () => {
  /**
   * Through the accessible name, not the placeholder — a placeholder is not a
   * label, and querying by one would go on passing after the label was lost.
   */
  it('has a name assistive tech can resolve', async () => {
    await renderLoaded();

    expect(searchBox()).toBeInTheDocument();
  });

  it('filters on what was typed', async () => {
    await renderLoaded();

    await userEvent.type(searchBox(), 'havis');

    expect(shown('Havis Roofing')).toBe(true);
    expect(shown('Okafor Plumbing')).toBe(false);
  });

  it('says how many matched, so an empty result is not a lost list', async () => {
    await renderLoaded();

    await userEvent.type(searchBox(), 'havis');

    expect(screen.getByText(/1 of 2 match/i)).toBeInTheDocument();
  });

  it('says plainly when nothing matches', async () => {
    await renderLoaded();

    await userEvent.type(searchBox(), 'nobody at all');

    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
  });

  it('offers a way back to the full list without retyping', async () => {
    await renderLoaded();

    await userEvent.type(searchBox(), 'havis');
    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));

    expect(searchBox()).toHaveValue('');
    expect(shown('Okafor Plumbing')).toBe(true);
  });

  it('stays quiet about counts before anybody searches', async () => {
    await renderLoaded();

    expect(screen.queryByText(/of 2 match/i)).toBeNull();
  });
});
