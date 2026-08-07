import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BriefForm } from '@/components/BriefForm';

/**
 * The form we ask a prospect to spend two minutes on.
 *
 * It is filled in by the person we are trying to win, usually on a phone,
 * often forwarded to a colleague who opens it between other things — and
 * until now it held its answers nowhere but in React state. A reload, a
 * backgrounded tab that iOS discarded, a mistyped URL: any of them emptied
 * it, and nobody is going to answer the same twelve questions twice.
 *
 * The admin side has kept drafts of the proposal builder and the section
 * notes for a while. This is the form where losing them costs the most.
 */

function mockFetch(ok = true, body: unknown = { success: true }) {
  const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => ({
    ok,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const TOKEN = 'tok_abc';
const DRAFT_KEY = `bothmade_brief_draft_${TOKEN}`;

function renderForm(props: Partial<Parameters<typeof BriefForm>[0]> = {}) {
  return render(
    <BriefForm
      token={TOKEN}
      company="Okafor Plumbing"
      contactName="Dana Okafor"
      initialProblems={[]}
      {...props}
    />
  );
}

/** The free-text box at the end — the one thing here nobody can re-tick. */
const extraBox = () => screen.getByRole('textbox');
const submit = () => screen.getByRole('button', { name: /send|done|finish/i });

/*
 * By its words, not its role: the form already carries an aria-live region
 * for errors, so `getByRole('status')` matches that empty div too.
 */
const restoredNotice = () => screen.getByText(/kept what you had already answered/i);
const queryRestoredNotice = () => screen.queryByText(/kept what you had already answered/i);

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  mockFetch();
});

describe('keeping a half-finished brief', () => {
  it('saves what has been typed so far', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(extraBox(), 'We open a second surgery in March.');

    const stored = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? '{}');
    expect(stored.extra).toBe('We open a second surgery in March.');
  });

  it('brings it back when the page is opened again', async () => {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ extra: 'Half a thought I had not finished', problems: [], wants: [], answers: {} })
    );

    renderForm();

    expect(extraBox()).toHaveValue('Half a thought I had not finished');
  });

  it('says so, rather than restoring answers silently', () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ extra: 'Something earlier' }));

    renderForm();

    // Somebody who half-remembers what they ticked cannot otherwise tell
    // their own earlier answers from the form pre-filling itself.
    expect(restoredNotice()).toBeInTheDocument();
  });

  it('stays quiet on a first visit', () => {
    renderForm();

    expect(queryRestoredNotice()).toBeNull();
  });

  it('keeps one client’s answers away from another on a shared device', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(extraBox(), 'Confidential to this lead');

    // A different token is a different person — their form must open empty.
    renderForm({ token: 'tok_someone_else' });

    const boxes = screen.getAllByRole('textbox');
    expect(boxes[boxes.length - 1]).toHaveValue('');
  });

  it('throws the draft away once it has been sent', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(extraBox(), 'We open a second surgery in March.');
    expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull();

    await user.click(submit());

    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('holds on to it when the send fails, which is when it matters most', async () => {
    mockFetch(false, { error: 'That did not send. Please try again.' });
    const user = userEvent.setup();
    renderForm();

    await user.type(extraBox(), 'Everything I just typed');
    await user.click(submit());

    // The answers are still on screen and still stored; a failed send that
    // also wiped the draft would be the worst possible moment to lose it.
    expect(extraBox()).toHaveValue('Everything I just typed');
    expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });

  it('starts empty rather than refusing to render on a corrupt draft', () => {
    window.localStorage.setItem(DRAFT_KEY, 'not json at all');

    renderForm();

    expect(extraBox()).toHaveValue('');
    expect(queryRestoredNotice()).toBeNull();
  });

  it('ignores a stored draft whose shape is wrong', () => {
    // User-writable storage, and it may predate a change to the questions.
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ problems: 'not-an-array', extra: 42 }));

    renderForm();

    expect(extraBox()).toHaveValue('');
  });
});

describe('the confirmation screen', () => {
  it('mentions the receipt now that one actually gets sent', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(extraBox(), 'Anything at all');
    await user.click(submit());

    // It used to promise "you will not hear from us again in the meantime",
    // which the receipt email contradicted the moment it landed.
    expect(screen.getByText(/emailed you a copy/i)).toBeInTheDocument();
  });
});
