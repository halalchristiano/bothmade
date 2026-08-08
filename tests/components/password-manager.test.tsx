import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminSettingsPage from '@/app/admin/settings/page';

/**
 * Whether a password manager can do its job here.
 *
 * There was no `autocomplete` attribute anywhere in the admin — not on the
 * login form, not on the change-password form — and the change-password
 * fields were three loose inputs in a `div` behind an `onClick`.
 *
 * Browsers decide three things from exactly those signals: whether to offer a
 * saved password, whether to generate a new one, and — the one that bites —
 * whether to prompt to UPDATE the stored credential. That last prompt is
 * driven by a form submit carrying `current-password` and `new-password`.
 * Without it the change succeeds, the vault keeps the old password, and the
 * next login fails from the manager with nothing on screen having looked
 * wrong. The failure lands days later, somewhere else, and reads as "the app
 * logged me out".
 *
 * The hidden username field is the documented companion: a change-password
 * form with no username gives the manager nothing to match the saved entry
 * against, so it updates nothing even when it notices.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const PROFILE = { name: 'Kiana Arabpour', title: 'Owner', avatarUrl: null, email: 'kiana@bothmade.studio' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = String(url).includes('/settings/profile')
        ? PROFILE
        : { success: true, weeklyDigestOptOut: false };
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    })
  );
});

const settings = async () => {
  render(<AdminSettingsPage />);
  await screen.findByLabelText('Current password');
};

describe('the change-password form', () => {
  it('is a real form, so the browser can see a password change happen', async () => {
    await settings();
    const field = screen.getByLabelText('Current password');
    expect(field.closest('form'), 'the fields must be inside a form').toBeTruthy();
  });

  it('tells the manager which box is the old password and which are the new', async () => {
    await settings();

    expect(screen.getByLabelText('Current password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('autocomplete', 'new-password');
  });

  /** Without a username there is no saved entry to update. */
  it('carries the signed-in address as the username to match on', async () => {
    await settings();

    const form = screen.getByLabelText('Current password').closest('form')!;
    const username = form.querySelector('input[autocomplete="username"]') as HTMLInputElement | null;
    expect(username, 'a change-password form needs a username field').toBeTruthy();
    await waitFor(() => expect(username!.value).toBe('kiana@bothmade.studio'));
    expect(username!.hidden).toBe(true);
  });

  it('submits on the button rather than only on a click handler', async () => {
    await settings();
    expect(screen.getByRole('button', { name: /Change password/ })).toHaveAttribute('type', 'submit');
  });

  /**
   * A password field renders dots, so once all three are filled they are three
   * identical rows. The placeholder that used to name them is gone by then.
   */
  it('keeps each box named once all three are filled', async () => {
    const user = userEvent.setup();
    await settings();

    await user.type(screen.getByLabelText('Current password'), 'old-password-here');
    await user.type(screen.getByLabelText('New password'), 'a-much-longer-one');
    await user.type(screen.getByLabelText('Confirm new password'), 'a-much-longer-one');

    for (const label of ['Current password', 'New password', 'Confirm new password']) {
      expect(screen.getByLabelText(label), `${label} must still be named`).toBeTruthy();
      expect(screen.getByText(label)).toBeVisible();
    }
  });
});
