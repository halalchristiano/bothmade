import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TasksWidget } from '@/components/admin/TasksWidget';

/**
 * The only way to delete a task, which was invisible until you hovered it.
 *
 * `opacity-0 group-hover:opacity-100` on a button that is still in the
 * layout and still takes a click. Three separate people cannot use that:
 *
 *   - **On a phone there is no hover.** The dashboard renders this widget on
 *     mobile, so removing a task meant pressing an invisible target beside
 *     the checkbox — and a near miss ticks the task off instead, because the
 *     whole row is the checkbox's label.
 *   - **On a keyboard there is no hover either.** Tab moves focus onto the
 *     button and `group-hover` does not fire, so the focus ring lands on
 *     nothing at all. WCAG 2.4.7.
 *   - **On any device it had no name.** "remove" beside "remove" beside
 *     "remove" is what a screen reader heard, with nothing saying which task
 *     each one belonged to.
 *
 * The target size is the same rule the client portal's Logout was fixed to.
 * Measured in a browser at 393px with the pointer parked away from the row:
 * 41×18 at opacity 0 before, 53×30 at opacity 0.4 after. WCAG 2.5.8 asks for
 * 24.
 *
 * jsdom has no layout engine, so what is asserted here is the rule that
 * produces the size, plus the behaviour that can be observed: focus, names,
 * and that the control works when it is pressed without a hover first.
 */

const task = (id: string, title: string) => ({ id, title, done: false, dueAt: null });

let deleted: string[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  deleted = [];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      deleted.push(String(url));
      return { ok: true, status: 200, json: async () => ({ success: true }) } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        tasks: [task('task_1', 'Ring Havisham'), task('task_2', 'Send the proposal')],
      }),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
});

const open = async () => {
  render(<TasksWidget />);
  await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
};

const removeButtons = () => screen.getAllByRole('button', { name: /^Remove / });

describe('the remove control', () => {
  it('says which task it removes', async () => {
    await open();

    // Three buttons all announced as "remove" is what this was.
    expect(screen.getByRole('button', { name: 'Remove “Ring Havisham”' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove “Send the proposal”' })).toBeTruthy();
  });

  it('is never fully transparent', async () => {
    await open();

    for (const button of removeButtons()) {
      expect(button.className, 'a control nobody can see is a control nobody has').not.toMatch(
        /\bopacity-0\b/
      );
    }
  });

  it('comes up on keyboard focus, not only on hover', async () => {
    await open();

    // `group-hover` alone never fires for a keyboard user, so the focus ring
    // used to land on an invisible button.
    expect(removeButtons()[0].className).toMatch(/focus-visible:opacity-100/);
  });

  it('is big enough to aim at', async () => {
    await open();

    // 41×18 without this, measured in a browser; 53×30 with it. WCAG 2.5.8
    // asks for 24, and this is the rule the portal's Logout was fixed to.
    expect(removeButtons()[0].className).toMatch(/\bp-1\.5\b/);
  });

  it('works when it is pressed with no hover first, as on a touch screen', async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole('button', { name: 'Remove “Send the proposal”' }));

    await waitFor(() => expect(deleted).toEqual(['/api/admin/tasks/task_2']));
  });

  /*
   * The near-miss. The whole row is the checkbox's label, so a tap that
   * lands on the row rather than the button ticks the task off — which is
   * why an invisible delete control sitting inside it was worse than a
   * visible one. Pressing the button itself must not do both.
   */
  it('does not also tick the task off', async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole('button', { name: 'Remove “Ring Havisham”' }));

    await waitFor(() => expect(deleted).toHaveLength(1));
    const patched = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PATCH');
    expect(patched, 'removing a task must not also mark it done').toHaveLength(0);
  });
});
