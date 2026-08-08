import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TasksWidget } from '@/components/admin/TasksWidget';

/**
 * Controls that announced themselves as nothing at all.
 *
 * An accessibility pass over the admin in a real browser — computing names the
 * way the platform does, so a wrapping <label> counts — found ten form
 * controls across five screens with no accessible name of any kind. The
 * placeholder is not one: it is not a label, and it is gone the moment there
 * is a value in the box.
 *
 * The sharpest were on /admin/billing, which is the screen that charges a
 * client money: "What it's for", every line's description, and every line's
 * amount. Each had a heading styled as a label sitting above it, attached to
 * nothing.
 *
 * This file guards the one that is unit-testable in isolation; the rest are
 * covered by the browser pass, and the audit reports every screen clean.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('the task box', () => {
  it('says what it is', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, tasks: [] }) }) as unknown as Response)
    );

    render(<TasksWidget />);

    expect(await screen.findByLabelText('Add a task')).toBeTruthy();
  });
});
