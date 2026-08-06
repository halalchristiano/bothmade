import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The address on a researched lead is nearly always info@ off their website
 * — a shared inbox somebody triages, where a mockup can sit unopened while
 * the pipeline records it as delivered. A rep who has been on the phone often
 * has the owner's own address by then.
 *
 * So the override lives on the send itself rather than being an edit somebody
 * has to remember to make first, and using it replaces the address on the
 * lead. The panel has to say that before the send, not after.
 */

import { SendMockupPanel } from '@/components/admin/SendMockupPanel';

const props = {
  recipientName: 'Tony',
  company: 'Monogram Custom Builders',
  sending: false,
  notice: null,
};

describe('SendMockupPanel', () => {
  it('sends to the address on file without being asked anything', async () => {
    const onSend = vi.fn();
    render(<SendMockupPanel {...props} emailOnFile="info@monogramcustomhomes.com" onSend={onSend} />);

    await userEvent.click(screen.getByRole('button', { name: /send mockup to client/i }));

    // No argument: the route uses whatever is on the lead.
    // The second argument says what was made, which decides what the
    // email may claim. "A working preview" is the default and the case
    // the standard wording was written for.
    expect(onSend).toHaveBeenCalledWith(undefined, 'preview');
  });

  it('sends to the address typed instead, when there is a better one', async () => {
    const onSend = vi.fn();
    render(<SendMockupPanel {...props} emailOnFile="info@monogramcustomhomes.com" onSend={onSend} />);

    await userEvent.click(screen.getByRole('radio', { name: /a different address/i }));
    await userEvent.type(screen.getByPlaceholderText(/tony@/i), 'tony@monogramcustomhomes.com');
    await userEvent.click(screen.getByRole('button', { name: /send mockup to client/i }));

    expect(onSend).toHaveBeenCalledWith('tony@monogramcustomhomes.com', 'preview');
  });

  /**
   * Replacing the lead's address is a consequence somebody should meet
   * before they press the button, not discover in the activity log after.
   */
  it('says the old address is being replaced, before the send', async () => {
    render(<SendMockupPanel {...props} emailOnFile="info@monogramcustomhomes.com" onSend={vi.fn()} />);

    await userEvent.click(screen.getByRole('radio', { name: /a different address/i }));
    await userEvent.type(screen.getByPlaceholderText(/tony@/i), 'tony@monogramcustomhomes.com');

    expect(screen.getByText(/replaces info@monogramcustomhomes\.com/i)).toBeInTheDocument();
  });

  it('refuses to send something that is not an email address', async () => {
    const onSend = vi.fn();
    render(<SendMockupPanel {...props} emailOnFile="info@monogramcustomhomes.com" onSend={onSend} />);

    await userEvent.click(screen.getByRole('radio', { name: /a different address/i }));
    await userEvent.type(screen.getByPlaceholderText(/tony@/i), 'his personal one');

    expect(screen.getByText(/not an email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send mockup to client/i })).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  /**
   * With nothing on file this is not an override — it is the only way the
   * send happens at all, so the box is already open rather than hidden
   * behind a choice between one option and nothing.
   */
  it('opens the address box by itself when the lead has none', () => {
    render(<SendMockupPanel {...props} emailOnFile={null} onSend={vi.fn()} />);

    expect(screen.getByPlaceholderText(/tony@/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send mockup to client/i })).toBeDisabled();
  });

  it('will not fire twice while a send is in flight', () => {
    render(
      <SendMockupPanel {...props} emailOnFile="info@x.com" sending onSend={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
  });
});

/**
 * The one thing the standard email cannot always say.
 *
 * "A working preview, not a picture of one" was untrue once, so the send
 * button was correctly not pressed and the whole tracked path was abandoned
 * for that client. The claim is a choice now, made here, before sending.
 */
it('lets the sender say it is designs rather than a working build', async () => {
  const onSend = vi.fn();
  render(
    <SendMockupPanel
      recipientName="Dana Cole"
      company="Havis"
      emailOnFile="dana@havis.example"
      sending={false}
      notice={null}
      onSend={onSend}
    />
  );

  await userEvent.click(screen.getByRole('radio', { name: /Designs to look at/i }));
  await userEvent.click(screen.getByRole('button', { name: /Send mockup to client/i }));

  expect(onSend).toHaveBeenCalledWith(undefined, 'visuals');
});
