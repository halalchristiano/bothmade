import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SalesPage from '@/app/admin/sales/page';

/**
 * The three lenses on the sales screen.
 *
 * TWO THINGS WERE WRONG.
 *
 * The tab set announced itself as one. `role="tablist"` and `role="tab"` were
 * there, and none of what those promise was: no arrow keys, no roving
 * tabindex, no panel for a tab to own. A screen reader user was told this is
 * a tab set — so arrows move between them, one Tab press gets past them, and
 * each one controls a region — and then had to Tab through all three and
 * found no region at the end of it. Announcing "tab" without the behaviour is
 * worse than three plain buttons, which at least behave the way they read.
 *
 * And the queue never reloaded. The shell bumps a token after companies are
 * added so "whichever lens is mounted reloads"; the board and the list took
 * it and the queue did not — the default lens, the one that opens, the one
 * you are looking at when you press Add companies. The rows arrived in front
 * of nobody.
 */

const push = vi.fn();
const router = { push, replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

// Each lens fetches on mount and is covered where it lives. Here they only
// need to be identifiable, and to report when they were asked to reload.
const queueMounts = vi.fn();
vi.mock('@/components/admin/sales/QueueView', () => ({
  QueueView: ({ refreshToken }: { refreshToken?: number }) => {
    queueMounts(refreshToken);
    return <div data-testid="queue">queue</div>;
  },
}));
vi.mock('@/components/admin/sales/BoardView', () => ({
  BoardView: () => <div data-testid="board">board</div>,
}));
vi.mock('@/components/admin/sales/ListView', () => ({
  ListView: () => <div data-testid="list">list</div>,
}));
vi.mock('@/components/admin/QuickAddLeadModal', () => ({
  QuickAddLeadModal: ({ onCreated }: { onCreated: (id?: string) => void }) => (
    // Stands in for the modal: "added companies, no single lead to open" is
    // the path that asks the mounted lens to reload.
    <button onClick={() => onCreated(undefined)}>Finish bulk add</button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/admin/sales');
  try {
    localStorage.clear();
  } catch {
    /* private browsing */
  }
});

const tabs = () => screen.getAllByRole('tab');
const tab = (name: string) => screen.getByRole('tab', { name });

describe('the tab set', () => {
  it('puts only the selected tab in the page tab order', async () => {
    render(<SalesPage />);
    await screen.findByTestId('queue');

    expect(tab('Who to call')).toHaveAttribute('tabindex', '0');
    expect(tab('Board')).toHaveAttribute('tabindex', '-1');
    expect(tab('All leads')).toHaveAttribute('tabindex', '-1');
  });

  it('moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<SalesPage />);
    await screen.findByTestId('queue');

    tab('Who to call').focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tab('Board'));

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tab('All leads'));
  });

  it('wraps at both ends, and Home and End jump', async () => {
    const user = userEvent.setup();
    render(<SalesPage />);
    await screen.findByTestId('queue');

    tab('Who to call').focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(tab('All leads'));

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tab('Who to call'));

    await user.keyboard('{End}');
    expect(document.activeElement).toBe(tab('All leads'));

    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(tab('Who to call'));
  });

  /**
   * Manual activation, deliberately: each lens fetches when it mounts, and
   * arrowing across the set with automatic activation would fire three
   * requests to look at one.
   */
  it('does not switch lens on an arrow alone', async () => {
    const user = userEvent.setup();
    render(<SalesPage />);
    await screen.findByTestId('queue');

    tab('Who to call').focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByTestId('queue')).toBeTruthy();
    expect(screen.queryByTestId('board')).toBeNull();
  });

  it('switches on Enter, once the arrows have got you there', async () => {
    const user = userEvent.setup();
    render(<SalesPage />);
    await screen.findByTestId('queue');

    tab('Who to call').focus();
    await user.keyboard('{ArrowRight}{Enter}');

    await screen.findByTestId('board');
    expect(tab('Board')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('the panel the tabs control', () => {
  it('exists, and each tab says it owns it', async () => {
    render(<SalesPage />);
    const panel = await screen.findByRole('tabpanel');

    for (const t of tabs()) {
      expect(t).toHaveAttribute('aria-controls', panel.id);
    }
  });

  it('is named by whichever tab is selected', async () => {
    const user = userEvent.setup();
    render(<SalesPage />);

    expect(await screen.findByRole('tabpanel')).toHaveAccessibleName('Who to call');

    await user.click(tab('All leads'));
    expect(await screen.findByRole('tabpanel')).toHaveAccessibleName('All leads');
  });

  it('holds the lens that is showing', async () => {
    render(<SalesPage />);
    const panel = await screen.findByRole('tabpanel');
    expect(panel.contains(screen.getByTestId('queue'))).toBe(true);
  });
});

describe('adding companies from the queue', () => {
  /** The default lens, and the one that did not reload. */
  it('asks the queue to reload', async () => {
    const user = userEvent.setup();
    render(<SalesPage />);
    await screen.findByTestId('queue');

    const before = queueMounts.mock.calls.at(-1)?.[0];

    await user.click(screen.getByRole('button', { name: /Add companies/ }));
    await user.click(screen.getByRole('button', { name: 'Finish bulk add' }));

    await waitFor(() => {
      const after = queueMounts.mock.calls.at(-1)?.[0];
      expect(after).not.toBe(before);
    });
  });
});
