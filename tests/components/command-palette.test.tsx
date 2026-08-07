import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '@/app/admin/layout';

/**
 * Cmd+K search, from the keyboard, by somebody not using a mouse.
 *
 * THE BUG. The dialog declared aria-modal but behaved like nothing of the
 * sort: Tab walked straight out of it into the page underneath, which a
 * screen reader has been told is inert — so the reading order and what was
 * actually reachable disagreed. And nothing remembered where focus came from,
 * so Esc dropped it on the body and the next Tab restarted from the top of
 * the document. Summoning search from the keyboard and being unable to get
 * back to what you were doing is a strange way to lose your place.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ success: true, results: [] }) }))
  );
});

/** The palette, plus a button outside it standing in for the page behind. */
function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <button type="button" data-testid="behind">
        Something on the page
      </button>
      <CommandPalette open={open} onClose={onClose} />
    </>
  );
}

describe('while the palette is open', () => {
  it('puts focus in the search field', async () => {
    render(<Harness open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());
  });

  it('keeps Tab inside the dialog rather than letting it reach the page behind', async () => {
    render(<Harness open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());

    // The field is the only focusable thing in the panel while there are no
    // results, so Tab must wrap back to it — never out to "behind".
    await userEvent.tab();

    expect(screen.getByTestId('behind')).not.toHaveFocus();
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('keeps Shift+Tab inside the dialog too', async () => {
    render(<Harness open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());

    await userEvent.tab({ shift: true });

    expect(screen.getByTestId('behind')).not.toHaveFocus();
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});

describe('when it closes', () => {
  it('hands focus back to whatever had it before', async () => {
    const { rerender } = render(<Harness open={false} onClose={() => {}} />);
    const behind = screen.getByTestId('behind');
    behind.focus();
    expect(behind).toHaveFocus();

    rerender(<Harness open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());

    rerender(<Harness open={false} onClose={() => {}} />);

    // Not the body, and not the top of the document — back where you were.
    await waitFor(() => expect(behind).toHaveFocus());
  });
});
