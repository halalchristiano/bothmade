import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResetPasswordPage from '@/app/auth/reset-password/page';

/**
 * Every password box in the product had a `<label>` sitting above it and no
 * relationship to it — no `htmlFor`, no `id`, not wrapped.
 *
 * Visually identical, and broken in three ways that do not show up in a
 * screenshot. A screen reader announces "edit text, blank" and the person
 * filling it in has to infer which field they are on from what was read
 * before it. Tapping the word "Password" on a phone does nothing, when it is
 * a larger target than the box and the obvious thing to hit. And password
 * managers lean on the association to decide which field is the new password
 * and which is the confirmation.
 *
 * `getByLabelText` is the assertion precisely because it resolves through the
 * same association the assistive tech uses — a test that passed on
 * `getByPlaceholderText` would go on passing with the labels detached again.
 */

function setToken(token: string | null) {
  const url = token === null ? '/auth/reset-password' : `/auth/reset-password?token=${token}`;
  window.history.replaceState({}, '', url);
}

beforeEach(() => {
  setToken('a-live-token');
});

describe('the reset-password form', () => {
  it('names each box in a way assistive tech can resolve', () => {
    render(<ResetPasswordPage />);

    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
  });

  it('gives the two password boxes distinct identities', () => {
    render(<ResetPasswordPage />);

    const next = screen.getByLabelText('New password');
    const confirm = screen.getByLabelText('Confirm new password');

    // A shared or missing id is how a password manager fills the same value
    // into both, and how a confirmation field stops confirming anything.
    expect(next.id).toBeTruthy();
    expect(confirm.id).toBeTruthy();
    expect(next.id).not.toBe(confirm.id);
  });

  it('moves the cursor into the box when its label is clicked', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.click(screen.getByText('New password'));

    // The label is a bigger tap target than the input on a phone, and it did
    // nothing at all before.
    expect(screen.getByLabelText('New password')).toHaveFocus();
  });

  it('still keeps them as password fields, not text', () => {
    render(<ResetPasswordPage />);

    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('type', 'password');
  });
});
