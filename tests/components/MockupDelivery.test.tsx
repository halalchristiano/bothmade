import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockupDeliveryForm } from '@/components/admin/MockupDelivery';

/**
 * Three copies of this form existed, and two of them told the user a mockup
 * had been delivered whether or not the save succeeded. Everything here is
 * about not lying to the person pasting the link.
 */

function mockFetch(impl: () => Promise<{ ok: boolean }> | never) {
  const fetchMock = vi.fn((_url: string, _init: { body: string }) => impl());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('delivering a mockup', () => {
  it('PATCHes the pasted link onto the lead', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(async () => ({ ok: true }));
    const onDelivered = vi.fn();
    render(<MockupDeliveryForm leadId="lead_1" onDelivered={onDelivered} />);

    await user.type(screen.getByLabelText('Mockup link'), 'https://figma.test/abc');
    await user.click(screen.getByRole('button', { name: 'Mark Delivered' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/leads/lead_1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mockupUrl: 'https://figma.test/abc' }),
    });
    expect(onDelivered).toHaveBeenCalledOnce();
  });

  it('submits on Enter, which is how a pasted link is actually confirmed', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(async () => ({ ok: true }));
    render(<MockupDeliveryForm leadId="lead_1" onDelivered={vi.fn()} />);

    await user.type(screen.getByLabelText('Mockup link'), 'https://figma.test/abc{Enter}');

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('trims the pasted link', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(async () => ({ ok: true }));
    render(<MockupDeliveryForm leadId="lead_1" onDelivered={vi.fn()} />);

    await user.type(screen.getByLabelText('Mockup link'), '   https://figma.test/abc   ');
    await user.click(screen.getByRole('button', { name: 'Mark Delivered' }));

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).mockupUrl).toBe('https://figma.test/abc');
  });

  it('clears the field after a successful delivery', async () => {
    const user = userEvent.setup();
    mockFetch(async () => ({ ok: true }));
    render(<MockupDeliveryForm leadId="lead_1" onDelivered={vi.fn()} />);

    const field = screen.getByLabelText('Mockup link');
    await user.type(field, 'https://figma.test/abc');
    await user.click(screen.getByRole('button', { name: 'Mark Delivered' }));

    expect(field).toHaveValue('');
  });
});

describe('refusing to deliver nothing', () => {
  it('disables the button until something is typed', async () => {
    const user = userEvent.setup();
    mockFetch(async () => ({ ok: true }));
    render(<MockupDeliveryForm leadId="lead_1" onDelivered={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Mark Delivered' });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText('Mockup link'), 'x');
    expect(button).toBeEnabled();
  });

  it('treats a whitespace-only link as empty', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(async () => ({ ok: true }));
    render(<MockupDeliveryForm leadId="lead_1" onDelivered={vi.fn()} />);

    await user.type(screen.getByLabelText('Mockup link'), '   {Enter}');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mark Delivered' })).toBeDisabled();
  });
});

describe('when the save fails', () => {
  it('says so, keeps the link, and does not report delivery', async () => {
    const user = userEvent.setup();
    mockFetch(async () => ({ ok: false }));
    const onDelivered = vi.fn();
    render(<MockupDeliveryForm leadId="lead_1" onDelivered={onDelivered} />);

    const field = screen.getByLabelText('Mockup link');
    await user.type(field, 'https://figma.test/abc');
    await user.click(screen.getByRole('button', { name: 'Mark Delivered' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save that link/i);
    expect(onDelivered).not.toHaveBeenCalled();
    // Losing the pasted link on failure would mean fetching it again.
    expect(field).toHaveValue('https://figma.test/abc');
  });

  it('explains a network failure separately', async () => {
    const user = userEvent.setup();
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    render(<MockupDeliveryForm leadId="lead_1" onDelivered={vi.fn()} />);

    await user.type(screen.getByLabelText('Mockup link'), 'https://figma.test/abc{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
  });

  it('re-enables the button so the save can be retried', async () => {
    const user = userEvent.setup();
    mockFetch(async () => ({ ok: false }));
    render(<MockupDeliveryForm leadId="lead_1" onDelivered={vi.fn()} />);

    await user.type(screen.getByLabelText('Mockup link'), 'https://figma.test/abc{Enter}');
    await screen.findByRole('alert');

    expect(screen.getByRole('button', { name: 'Mark Delivered' })).toBeEnabled();
  });
});

describe('presentation', () => {
  it('takes the caller wording for the button and placeholder', () => {
    mockFetch(async () => ({ ok: true }));
    render(
      <MockupDeliveryForm
        leadId="lead_1"
        onDelivered={vi.fn()}
        submitLabel="Deliver"
        placeholder="Paste mockup link..."
      />
    );

    expect(screen.getByRole('button', { name: 'Deliver' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Paste mockup link...')).toBeInTheDocument();
  });

  it('labels the field even though it has no visible label', () => {
    mockFetch(async () => ({ ok: true }));
    render(<MockupDeliveryForm leadId="lead_1" onDelivered={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Mockup link' })).toBeInTheDocument();
  });
});
