import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '@/components/admin/Modal';

/**
 * The contract this component exists to guarantee. Every one of these was
 * missing from the hand-rolled overlays it replaced.
 */

function open(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = vi.fn();
  render(
    <Modal title="Mark Acme as lost" onClose={onClose} {...props}>
      <button>First</button>
      <button>Second</button>
      <button>Third</button>
    </Modal>
  );
  return { onClose };
}

describe('dialog semantics', () => {
  it('announces itself as a modal dialog named by its title', () => {
    open();
    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Mark Acme as lost');
  });

  it('describes itself with the subtitle when there is one', () => {
    open({ subtitle: 'Why did this one not work out?' });
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Why did this one not work out?');
  });

  it('keeps an accessible name even when the panel draws its own header', () => {
    render(
      <Modal title="Compose email" onClose={vi.fn()} showHeader={false}>
        <p>Custom chrome</p>
      </Modal>
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Compose email');
  });

  it('labels the close button, which is otherwise a bare glyph', () => {
    open();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });
});

describe('focus management', () => {
  it('moves focus into the dialog on open', () => {
    open();
    // The close button is first in DOM order, so it takes initial focus —
    // the point is that focus is inside the dialog, not left on the page.
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
  });

  it('falls back to the panel itself when there is nothing to focus', () => {
    render(
      <Modal title="Nothing here" onClose={vi.fn()} showHeader={false}>
        <p>Just text.</p>
      </Modal>
    );
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('returns focus to the trigger when the dialog unmounts', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [showing, setShowing] = useState(false);
      return (
        <>
          <button onClick={() => setShowing(true)}>Open</button>
          {showing && (
            <Modal title="A dialog" onClose={() => setShowing(false)}>
              <button>Inside</button>
            </Modal>
          )}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('cycles Tab round the dialog instead of escaping to the page behind it', async () => {
    const user = userEvent.setup();
    open();

    // Close → First → Second → Third → back to Close.
    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Third' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
  });

  it('cycles Shift+Tab backwards from the first control to the last', async () => {
    const user = userEvent.setup();
    open();

    await user.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'Third' })).toHaveFocus();
  });

  it('skips a control inside a hidden pane', async () => {
    const user = userEvent.setup();
    render(
      <Modal title="Responsive" onClose={vi.fn()} showHeader={false}>
        <button>Visible</button>
        <div style={{ display: 'none' }}>
          <button>Hidden pane</button>
        </div>
        <button>Also visible</button>
      </Modal>
    );

    // Wrapping from the last visible control must land on the first visible
    // one, not on the button inside the collapsed pane.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Also visible' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Visible' })).toHaveFocus();
  });
});

describe('closing', () => {
  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = open();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on a backdrop click', async () => {
    const user = userEvent.setup();
    const { onClose } = open();

    await user.click(screen.getByRole('dialog').parentElement!);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close on a click inside the panel', async () => {
    const user = userEvent.setup();
    const { onClose } = open();

    await user.click(screen.getByRole('button', { name: 'Second' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores the backdrop when the dialog holds unsaved work', async () => {
    const user = userEvent.setup();
    const { onClose } = open({ closeOnBackdrop: false });

    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).not.toHaveBeenCalled();

    // Escape still works — it is deliberate in a way a stray click is not.
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes from the × button', async () => {
    const user = userEvent.setup();
    const { onClose } = open();

    await user.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
