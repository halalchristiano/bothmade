import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkDeleteProjects } from '@/components/admin/BulkDeleteProjects';

/**
 * The confirmation in front of deleting several projects at once.
 *
 * The whole reason the phrase carries a count is that it has to go stale. A
 * confirmation typed for six projects must not still be armed once a seventh
 * is ticked — that is the failure mode a "type DELETE" box has and the one a
 * bulk action can least afford.
 */

const TEST_PROJECTS = [
  { id: 'p_1', company: 'testing_company', name: 'testing_company — Web App' },
  { id: 'p_2', company: 'Finale test', name: 'Finale test — Website' },
];

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => ok({ success: true, count: 2, deleted: TEST_PROJECTS, blocked: [] })));
});

function panel(selected = TEST_PROJECTS, props: Partial<Parameters<typeof BulkDeleteProjects>[0]> = {}) {
  return render(
    <BulkDeleteProjects selected={selected} onClear={() => {}} onDeleted={() => {}} {...props} />
  );
}

describe('before anything is armed', () => {
  it('says how many are selected without offering the field yet', () => {
    panel();

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('delete 2 projects')).not.toBeInTheDocument();
  });

  it('renders nothing at all when nothing is selected', () => {
    const { container } = panel([]);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('the typed phrase', () => {
  it('names every project that is about to go, rather than only counting them', async () => {
    panel();
    await userEvent.click(screen.getByRole('button', { name: /delete selected/i }));

    expect(screen.getByText('testing_company')).toBeInTheDocument();
    expect(screen.getByText('Finale test')).toBeInTheDocument();
  });

  it('keeps the button disabled until the phrase matches', async () => {
    panel();
    await userEvent.click(screen.getByRole('button', { name: /delete selected/i }));

    const confirm = screen.getByRole('button', { name: /delete them permanently/i });
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('delete 2 projects'), 'delete 2 projects');
    expect(confirm).toBeEnabled();
  });

  it('will not accept the phrase for a different count', async () => {
    panel();
    await userEvent.click(screen.getByRole('button', { name: /delete selected/i }));
    await userEvent.type(screen.getByPlaceholderText('delete 2 projects'), 'delete 3 projects');

    expect(screen.getByRole('button', { name: /delete them permanently/i })).toBeDisabled();
  });

  /*
   * The one that matters. Type it for two, then a third row is ticked while
   * the panel is open — the armed confirmation must not carry over to a
   * selection it was never written for.
   */
  it('disarms when the selection changes underneath it', async () => {
    const { rerender } = panel();
    await userEvent.click(screen.getByRole('button', { name: /delete selected/i }));
    await userEvent.type(screen.getByPlaceholderText('delete 2 projects'), 'delete 2 projects');
    expect(screen.getByRole('button', { name: /delete them permanently/i })).toBeEnabled();

    rerender(
      <BulkDeleteProjects
        selected={[...TEST_PROJECTS, { id: 'p_3', company: 'A1 cleaning', name: 'A1 cleaning — Website' }]}
        onClear={() => {}}
        onDeleted={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /delete them permanently/i })).toBeDisabled();
    expect(screen.getByPlaceholderText('delete 3 projects')).toHaveValue('');
  });
});

describe('sending it', () => {
  it('posts the ids and the phrase', async () => {
    panel();
    await userEvent.click(screen.getByRole('button', { name: /delete selected/i }));
    await userEvent.type(screen.getByPlaceholderText('delete 2 projects'), 'delete 2 projects');
    await userEvent.click(screen.getByRole('button', { name: /delete them permanently/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/admin/projects/bulk-delete');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      projectIds: ['p_1', 'p_2'],
      confirm: 'delete 2 projects',
    });
  });

  /*
   * A project that was ticked and is still on the list has to say why, or it
   * reads as a delete that half worked and nobody mentioned.
   */
  it('names what the server refused instead of letting it vanish', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ok({
          success: true,
          count: 1,
          deleted: [TEST_PROJECTS[0]],
          blocked: [{ company: 'Northgate Dental', name: 'Northgate — Website', reason: '2 payments' }],
        })
      )
    );

    panel();
    await userEvent.click(screen.getByRole('button', { name: /delete selected/i }));
    await userEvent.type(screen.getByPlaceholderText('delete 2 projects'), 'delete 2 projects');
    await userEvent.click(screen.getByRole('button', { name: /delete them permanently/i }));

    expect(await screen.findByText(/Northgate Dental/)).toBeInTheDocument();
    expect(screen.getByText(/2 payments/)).toBeInTheDocument();
  });

  it('surfaces a refusal rather than reporting a delete that did not happen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Only an owner can delete projects in bulk. Ask Kiana to run this one.' }),
      })) as unknown as typeof fetch
    );

    const onDeleted = vi.fn();
    panel(TEST_PROJECTS, { onDeleted });
    await userEvent.click(screen.getByRole('button', { name: /delete selected/i }));
    await userEvent.type(screen.getByPlaceholderText('delete 2 projects'), 'delete 2 projects');
    await userEvent.click(screen.getByRole('button', { name: /delete them permanently/i }));

    expect(await screen.findByText(/Only an owner can delete projects in bulk/)).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('says nothing was deleted when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch);

    panel();
    await userEvent.click(screen.getByRole('button', { name: /delete selected/i }));
    await userEvent.type(screen.getByPlaceholderText('delete 2 projects'), 'delete 2 projects');
    await userEvent.click(screen.getByRole('button', { name: /delete them permanently/i }));

    expect(await screen.findByText(/nothing was deleted/i)).toBeInTheDocument();
  });
});
