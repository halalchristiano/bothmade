import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BroadcastForm, describeBroadcast } from '@/components/admin/BroadcastForm';

/**
 * A broadcast goes to every client at once, so the two things that matter
 * are that it goes to the right endpoint and that a failure is visible —
 * both copies of this form previously reported nothing at all on failure,
 * which is indistinguishable from a successful send.
 */

function mockFetch(response: unknown, ok = true) {
  const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => ({
    ok,
    json: async () => response,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderForm(props: Partial<React.ComponentProps<typeof BroadcastForm>> = {}) {
  render(
    <BroadcastForm
      endpoint="/api/admin/broadcast"
      placeholder="Type a message..."
      submitLabel="Send to All"
      describeResult={describeBroadcast}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('sending', () => {
  it('posts the message to the given endpoint', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({ success: true, projectsNotified: 3, emailsSent: 3 });
    renderForm();

    await user.type(screen.getByLabelText('Type a message...'), 'Closed on Dec 25.');
    await user.click(screen.getByRole('button', { name: 'Send to All' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Closed on Dec 25.' }),
    });
  });

  it('merges extra body fields the caller needs', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({ success: true, projectsNotified: 1 });
    renderForm({ body: { segment: 'active' } });

    await user.type(screen.getByLabelText('Type a message...'), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send to All' }));

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      content: 'Hello',
      segment: 'active',
    });
  });

  it('reports how far the message reached and clears the box', async () => {
    const user = userEvent.setup();
    mockFetch({ success: true, projectsNotified: 3, emailsSent: 5 });
    renderForm();

    const box = screen.getByLabelText('Type a message...');
    await user.type(box, 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send to All' }));

    expect(await screen.findByText('Sent to 3 projects (5 emails sent).')).toBeInTheDocument();
    expect(box).toHaveValue('');
  });

  it('will not send an empty or whitespace-only message', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({ success: true });
    renderForm();

    const button = screen.getByRole('button', { name: 'Send to All' });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText('Type a message...'), '   ');
    expect(button).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('failure', () => {
  it('surfaces a rejected send instead of pretending it worked', async () => {
    const user = userEvent.setup();
    mockFetch({ error: 'nope' }, false);
    renderForm();

    const box = screen.getByLabelText('Type a message...');
    await user.type(box, 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send to All' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/didn't send/i);
    // The typed message survives, so it can be retried rather than retyped.
    expect(box).toHaveValue('Hello');
  });

  it('treats a 200 with success:false as a failure', async () => {
    const user = userEvent.setup();
    mockFetch({ success: false }, true);
    renderForm();

    await user.type(screen.getByLabelText('Type a message...'), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send to All' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('surfaces a network failure', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    renderForm();

    await user.type(screen.getByLabelText('Type a message...'), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send to All' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
  });
});

describe('describeBroadcast', () => {
  it('pluralises projects', () => {
    expect(describeBroadcast({ projectsNotified: 1 })).toBe('Sent to 1 project.');
    expect(describeBroadcast({ projectsNotified: 2 })).toBe('Sent to 2 projects.');
  });

  it('includes the email count only when the endpoint reports one', () => {
    expect(describeBroadcast({ projectsNotified: 2, emailsSent: 1 })).toBe(
      'Sent to 2 projects (1 email sent).'
    );
    expect(describeBroadcast({ projectsNotified: 2 })).toBe('Sent to 2 projects.');
  });

  it('reads correctly when nothing was reached', () => {
    expect(describeBroadcast({ projectsNotified: 0, emailsSent: 0 })).toBe(
      'Sent to 0 projects (0 emails sent).'
    );
  });

  it('does not print "undefined" when the endpoint says nothing', () => {
    expect(describeBroadcast({})).toBe('Sent to 0 projects.');
  });
});
