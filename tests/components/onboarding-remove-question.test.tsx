import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingBuilder } from '@/components/admin/OnboardingBuilder';

/**
 * The bin icon on an onboarding question, which deletes a client's answer.
 *
 * OnboardingResponse cascades from OnboardingQuestion, so this is the only
 * control in the onboarding flow that can destroy something a client typed.
 * It was one click, no confirmation, sitting directly beside the answer it
 * would take with it — and the answer is right there on the card, in green,
 * two lines below the button. There is no undo and no copy of that text
 * anywhere else in the system.
 *
 * It reported nothing either: `await fetch(...)` and then `onChanged()`
 * regardless, so a failed delete redrew the list with the question still in
 * it. That is indistinguishable from the button not working, which invites a
 * second press at the one control where a second press is the thing you are
 * trying to prevent.
 */

const ANSWERED = {
  id: 'q_1',
  question: 'What is your brand palette?',
  type: 'text',
  options: '',
  response: { answer: 'Forest green and bone' },
};

const UNANSWERED = {
  id: 'q_2',
  question: 'Who are your three main competitors?',
  type: 'textarea',
  options: '',
  response: null,
};

let deleteBehaviour: 'ok' | 'gone' | 'server-error' | 'offline';
let fetchMock: ReturnType<typeof vi.fn>;
let onChanged: ReturnType<typeof vi.fn>;

beforeEach(() => {
  deleteBehaviour = 'ok';
  onChanged = vi.fn();
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      if (deleteBehaviour === 'offline') throw new TypeError('Failed to fetch');
      if (deleteBehaviour === 'server-error')
        return { ok: false, status: 500, json: async () => ({ error: 'Internal server error' }) } as unknown as Response;
      if (deleteBehaviour === 'gone')
        return { ok: false, status: 404, json: async () => ({ error: 'That question is no longer on this form.' }) } as unknown as Response;
      return { ok: true, status: 200, json: async () => ({ success: true }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ success: true }) } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
});

const open = (questions = [ANSWERED, UNANSWERED]) =>
  render(<OnboardingBuilder projectId="proj_1" questions={questions} onChanged={onChanged} />);

const deletes = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'DELETE');

const binFor = (question: string) =>
  screen.getByRole('button', { name: new RegExp(`Remove the question .*${question}`) });

describe('pressing the bin', () => {
  it('deletes nothing on its own', async () => {
    const user = userEvent.setup();
    open();

    await user.click(binFor('brand palette'));

    expect(deletes(), 'the first press must not delete the answer').toHaveLength(0);
  });

  /*
   * The sentence that makes this different from removing an empty question:
   * the thing being destroyed is not ours and cannot be got back.
   */
  it('says the answer goes with it', async () => {
    const user = userEvent.setup();
    open();

    await user.click(binFor('brand palette'));

    const confirm = screen.getByRole('group', { name: /confirm removing/i });
    expect(confirm).toHaveTextContent(/their answer goes with it/i);
    expect(confirm).toHaveTextContent(/no copy of it anywhere else/i);
    expect(screen.getByRole('button', { name: /remove it and the answer/i })).toBeTruthy();
  });

  it('does not claim an answer will be lost when there is none', async () => {
    const user = userEvent.setup();
    open();

    await user.click(binFor('competitors'));

    const confirm = screen.getByRole('group', { name: /confirm removing/i });
    expect(confirm).not.toHaveTextContent(/answer goes with it/i);
    expect(screen.getByRole('button', { name: /^Remove it$/ })).toBeTruthy();
  });

  it('leaves the answer on screen while it asks', async () => {
    const user = userEvent.setup();
    open();

    await user.click(binFor('brand palette'));

    // An inline confirmation rather than a modal, so the thing about to be
    // destroyed is still readable while the question is being answered.
    expect(screen.getByText('Forest green and bone')).toBeTruthy();
  });

  it('lets you back out', async () => {
    const user = userEvent.setup();
    open();

    await user.click(binFor('brand palette'));
    await user.click(screen.getByRole('button', { name: /keep it/i }));

    expect(screen.queryByRole('group', { name: /confirm removing/i })).toBeNull();
    expect(deletes()).toHaveLength(0);
  });

  it('asks about one question at a time', async () => {
    const user = userEvent.setup();
    open();

    await user.click(binFor('brand palette'));
    await user.click(binFor('competitors'));

    expect(screen.getAllByRole('group', { name: /confirm removing/i })).toHaveLength(1);
  });

  it('goes through on the second, deliberate press', async () => {
    const user = userEvent.setup();
    open();

    await user.click(binFor('brand palette'));
    await user.click(screen.getByRole('button', { name: /remove it and the answer/i }));

    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(String(deletes()[0][0])).toBe('/api/admin/projects/proj_1/onboarding/q_1');
    expect(onChanged).toHaveBeenCalled();
  });
});

describe('when the delete does not happen', () => {
  const confirmDelete = async (user: ReturnType<typeof userEvent.setup>) => {
    open();
    await user.click(binFor('brand palette'));
    await user.click(screen.getByRole('button', { name: /remove it and the answer/i }));
  };

  it('says so rather than redrawing as though it worked', async () => {
    deleteBehaviour = 'server-error';
    const user = userEvent.setup();

    await confirmDelete(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not remove that question/i);
    // Which side of the failure you are on, stated: the question is still
    // there, so this is a retry rather than a mystery.
    expect(alert).toHaveTextContent(/still on the form/i);
  });

  it('survives the request never arriving', async () => {
    deleteBehaviour = 'offline';
    const user = userEvent.setup();

    await confirmDelete(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/nothing was removed/i);
  });

  /*
   * The one failure worth swallowing. A 404 means somebody else removed it
   * first — the list is stale and reloading it is the whole fix, so telling
   * anybody about it would be reporting a problem that has already resolved
   * itself in the direction they wanted.
   */
  it('says nothing when the question had already gone', async () => {
    deleteBehaviour = 'gone';
    const user = userEvent.setup();

    await confirmDelete(user);

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
