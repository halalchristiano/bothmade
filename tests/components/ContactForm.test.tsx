import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactForm } from '@/components/ContactForm';

/**
 * The site's front door. What's asserted here is that a wrong value never
 * gets as far as being sent — either the field refuses it as it's typed, or
 * submit stops and says which field it was.
 *
 * The route runs the same predicates, so these are not the only line of
 * defence; they're the difference between a visitor being told what to fix
 * while their message is still on screen, and a 400 after it's gone.
 */

function mockFetch(ok = true, body: unknown = { message: 'Message received.' }) {
  const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => ({
    ok,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const name = () => screen.getByLabelText('Your name');
const email = () => screen.getByLabelText('Your email address');
const phone = () => screen.getByLabelText('Phone (optional)');
const country = () => screen.getByLabelText('Country dial code');
const company = () => screen.getByLabelText('Company (optional)');
const message = () => screen.getByLabelText('Tell us about the project');
const send = () => screen.getByRole('button', { name: 'Send' });

/** Fills every required field with something valid. Company is the only one it skips. */
async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(name(), 'Kiana Arabpour');
  await user.type(email(), 'kiana@example.com');
  await user.type(phone(), '(555) 000-0000');
  await user.type(message(), 'I want an app built.');
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('the phone field', () => {
  it('is on the form, and is optional', () => {
    render(<ContactForm />);

    expect(phone()).toBeInTheDocument();
    expect(phone()).toHaveAttribute('type', 'tel');
    // An enquiry without a number is still an enquiry. Demanding one is a
    // lead we never hear from, which costs more than the number is worth.
    expect(phone()).not.toBeRequired();
  });

  it('sends the number with the enquiry', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<ContactForm />);

    await fillValid(user);
    await user.click(send());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.phone).toBe('+1 (555) 000-0000');
  });

  it('will not accept letters at all', async () => {
    const user = userEvent.setup();
    render(<ContactForm />);

    await user.type(phone(), '555-CALL-NOW');

    // Not "typed then rejected" — the letters never land in the field. The
    // hyphens between them do, since a hyphen is legitimate here.
    expect(phone()).toHaveValue('555--');
  });

  it('refuses a + in the number box, since the dropdown supplies it', async () => {
    const user = userEvent.setup();
    render(<ContactForm />);

    await user.type(phone(), '+1 5550000000');

    expect(phone()).toHaveValue('1 5550000000');
  });

  it('blocks submit on a number too short to dial, and says so', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<ContactForm />);

    await user.type(name(), 'Kiana Arabpour');
    await user.type(email(), 'kiana@example.com');
    await user.type(message(), 'I want an app built.');
    await user.type(phone(), '1234');
    await user.click(send());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/valid phone number/i)).toBeInTheDocument();
    expect(phone()).toHaveAttribute('aria-invalid', 'true');
  });

  it('sends without one when left empty, and sends no bare dial code', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<ContactForm />);

    await user.type(name(), 'Kiana Arabpour');
    await user.type(email(), 'kiana@example.com');
    await user.type(message(), 'I want an app built.');
    await user.click(send());

    expect(fetchMock).toHaveBeenCalled();
    // Not '+1'. An untouched field must not arrive looking like a number
    // somebody gave us — a rep would dial it.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).phone).toBe('');
  });

  it('clears the complaint once the number becomes dialable', async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<ContactForm />);

    await user.type(name(), 'Kiana Arabpour');
    await user.type(email(), 'kiana@example.com');
    await user.type(message(), 'I want an app built.');
    await user.type(phone(), '1234');
    await user.click(send());
    expect(screen.getByText(/valid phone number/i)).toBeInTheDocument();

    await user.type(phone(), '567890');

    expect(screen.queryByText(/valid phone number/i)).not.toBeInTheDocument();
  });
});

describe('the country dial code', () => {
  it('offers each country with its flag, code and name', () => {
    render(<ContactForm />);

    expect(
      screen.getByRole('option', { name: '🇺🇸 +1 United States' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: '🇬🇧 +44 United Kingdom' })
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '🇮🇪 +353 Ireland' })).toBeInTheDocument();
  });

  it('starts on the United States, and shows the code beside the number box', () => {
    render(<ContactForm />);

    expect(country()).toHaveValue('US');
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('puts the studio’s own markets at the top of the list', () => {
    render(<ContactForm />);

    // Scoped to the country select — the form has other menus, and which one
    // comes first in the document is a layout decision, not this assertion's.
    const first = within(country())
      .getAllByRole('option')
      .slice(0, 5)
      .map((option) => option.textContent);

    expect(first).toEqual([
      '🇺🇸 +1 United States',
      '🇬🇧 +44 United Kingdom',
      '🇨🇦 +1 Canada',
      '🇮🇪 +353 Ireland',
      '🇦🇺 +61 Australia',
    ]);
  });

  it('sends the chosen code in front of the number', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<ContactForm />);

    await user.type(name(), 'Kiana Arabpour');
    await user.type(email(), 'kiana@example.com');
    await user.type(message(), 'I want an app built.');
    await user.selectOptions(country(), 'GB');
    await user.type(phone(), '7700 900123');
    await user.click(send());

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).phone).toBe('+44 7700 900123');
  });

  it('shows the new code as soon as it is picked', async () => {
    const user = userEvent.setup();
    render(<ContactForm />);

    await user.selectOptions(country(), 'IE');

    expect(screen.getByText('+353')).toBeInTheDocument();
    expect(screen.queryByText('+1')).not.toBeInTheDocument();
  });

  it('re-judges the number against the new code', async () => {
    // A number that is too short under one code can be long enough under a
    // longer one, so the complaint has to be reconsidered, not left up.
    const user = userEvent.setup();
    mockFetch();
    render(<ContactForm />);

    await user.type(name(), 'Kiana Arabpour');
    await user.type(email(), 'kiana@example.com');
    await user.type(message(), 'I want an app built.');
    await user.type(phone(), '123456');
    await user.click(send());
    expect(screen.getByText(/valid phone number/i)).toBeInTheDocument();

    await user.selectOptions(country(), 'IE');

    expect(screen.queryByText(/valid phone number/i)).not.toBeInTheDocument();
  });

  it('keeps the chosen country after a successful send', async () => {
    // Someone writing in twice has not moved country in between.
    const user = userEvent.setup();
    mockFetch();
    render(<ContactForm />);

    await user.type(name(), 'Kiana Arabpour');
    await user.type(email(), 'kiana@example.com');
    await user.type(message(), 'I want an app built.');
    await user.selectOptions(country(), 'GB');
    await user.type(phone(), '7700 900123');
    await user.click(send());

    expect(await screen.findByText(/Message received/i)).toBeInTheDocument();
    expect(country()).toHaveValue('GB');
    expect(phone()).toHaveValue('');
  });
});

describe('keeping wrong values out of the other fields', () => {
  it('refuses digits in the name box, where a phone number does not belong', async () => {
    const user = userEvent.setup();
    render(<ContactForm />);

    await user.type(name(), 'Kiana 07700900123');

    expect(name()).toHaveValue('Kiana ');
  });

  it('still accepts the punctuation real names have', async () => {
    const user = userEvent.setup();
    render(<ContactForm />);

    await user.type(name(), "Jean-Luc O'Neill");

    expect(name()).toHaveValue("Jean-Luc O'Neill");
  });

  it('blocks submit on a malformed email rather than letting the server say no', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<ContactForm />);

    await user.type(name(), 'Kiana Arabpour');
    await user.type(email(), 'not-an-address');
    await user.type(phone(), '(555) 000-0000');
    await user.type(message(), 'I want an app built.');
    await user.click(send());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
  });

  it('blocks submit on a message too short to be an enquiry', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<ContactForm />);

    await user.type(name(), 'Kiana Arabpour');
    await user.type(email(), 'kiana@example.com');
    await user.type(phone(), '(555) 000-0000');
    await user.type(message(), 'hi');
    await user.click(send());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument();
  });

  it('flags an empty required field on submit rather than sending nothing', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<ContactForm />);

    await user.click(send());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(name()).toHaveAttribute('aria-invalid', 'true');
    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(message()).toHaveAttribute('aria-invalid', 'true');
    // Company and phone are the two that may be left blank.
    expect(company()).toHaveAttribute('aria-invalid', 'false');
    expect(phone()).toHaveAttribute('aria-invalid', 'false');
  });

  it('leaves the cursor on the first field that needs fixing', async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<ContactForm />);

    await user.type(email(), 'kiana@example.com');
    await user.type(phone(), '(555) 000-0000');
    await user.type(message(), 'I want an app built.');
    await user.click(send());

    expect(name()).toHaveFocus();
  });

  it('does not complain while a field is still being typed into', async () => {
    const user = userEvent.setup();
    render(<ContactForm />);

    await user.type(email(), 'kia');

    // Nobody has typed a valid address by character three.
    expect(screen.queryByText(/valid email address/i)).not.toBeInTheDocument();
  });

  it('complains once a field is finished with and still wrong', async () => {
    const user = userEvent.setup();
    render(<ContactForm />);

    await user.type(email(), 'not-an-address');
    await user.tab();

    expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
  });

  it('says nothing about a field merely tabbed through', async () => {
    const user = userEvent.setup();
    render(<ContactForm />);

    await user.click(email());
    await user.tab();

    expect(screen.queryByText(/valid email address/i)).not.toBeInTheDocument();
  });

  it('leaves company alone, since real ones have digits and ampersands', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<ContactForm />);

    await fillValid(user);
    await user.type(company(), "3M & Ben's, Inc.");
    await user.click(send());

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).company).toBe("3M & Ben's, Inc.");
  });
});

describe('a valid submission', () => {
  it('posts every field, phone included', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    render(<ContactForm />);

    await fillValid(user);
    await user.type(company(), 'Random');
    await user.click(send());

    expect(fetchMock).toHaveBeenCalledWith('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Kiana Arabpour',
        email: 'kiana@example.com',
        phone: '+1 (555) 000-0000',
        company: 'Random',
        message: 'I want an app built.',
        service: 'web',
        budget: '',
        timeline: '',
        website: '',
      }),
    });
  });

  it('empties the phone field along with the rest on success', async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<ContactForm />);

    await fillValid(user);
    await user.click(send());

    expect(await screen.findByText(/Message received/i)).toBeInTheDocument();
    expect(phone()).toHaveValue('');
  });

  it('shows what the server said when it refuses', async () => {
    const user = userEvent.setup();
    mockFetch(false, { error: 'Too many messages. Please try again later.' });
    render(<ContactForm />);

    await fillValid(user);
    await user.click(send());

    expect(await screen.findByText(/Too many messages/i)).toBeInTheDocument();
  });
});
