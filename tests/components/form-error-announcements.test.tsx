import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClientLogin from '@/app/client/login/page';
import AdminLogin from '@/app/admin/login/page';
import StartPage from '@/app/start/page';

/**
 * A refused sign-in that is shown and not said.
 *
 * Both login pages and the enquiry form rendered their error as
 * `{error && <div className="text-red-400">…}` — a plain element, inserted
 * into the document after the request came back. Nothing announces that. For
 * anyone using a screen reader the sequence was: press the button, the button
 * stops spinning, silence. No indication the password was wrong, no
 * indication anything happened at all.
 *
 * components/ContactForm.tsx already had the answer, and had had it for a
 * while: a live region that is always mounted, so assistive tech is watching
 * before there is anything to watch. These three had none.
 *
 * The region has to exist before the message does — one created at the same
 * moment as its content is announced unreliably or not at all — so these
 * tests check for the container on first paint, not only once an error has
 * been produced.
 */

// Both login pages navigate on success; neither test drives that path, but
// the hooks have to exist for the component to render at all.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

const LIVE_REGION = '[role="alert"], [role="status"], [aria-live]';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the live region exists before there is anything to say', () => {
  it.each([
    ['the client login', ClientLogin],
    ['the admin login', AdminLogin],
    ['the enquiry form', StartPage],
  ])('%s mounts one on first paint', (_name, Page) => {
    const { container } = render(<Page />);
    expect(container.querySelector(LIVE_REGION)).not.toBeNull();
  });

  it.each([
    ['the client login', ClientLogin],
    ['the admin login', AdminLogin],
  ])('%s marks it assertive, because a refused sign-in is not an aside', (_name, Page) => {
    const { container } = render(<Page />);
    const region = container.querySelector('[role="alert"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-live')).toBe('assertive');
    // Without aria-atomic the region is re-read in fragments as it changes.
    expect(region?.getAttribute('aria-atomic')).toBe('true');
  });
});

describe('what the server said lands inside it', () => {
  it('announces a rejected client login', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Email or password is incorrect' }),
    });

    const user = userEvent.setup();
    const { container } = render(<ClientLogin />);

    await user.type(screen.getByLabelText(/email/i), 'dana@northgate.test');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /^log ?in$/i }));

    await waitFor(() => {
      const region = container.querySelector('[role="alert"]');
      expect(region?.textContent).toContain('Email or password is incorrect');
    });
  });

  it('announces a rejected admin login', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Email or password is incorrect' }),
    });

    const user = userEvent.setup();
    const { container } = render(<AdminLogin />);

    await user.type(screen.getByLabelText(/email/i), 'evan@bothmade.studio');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /^log ?in$/i }));

    await waitFor(() => {
      const region = container.querySelector('[role="alert"]');
      expect(region?.textContent).toContain('Email or password is incorrect');
    });
  });

  it('announces a refused enquiry rather than only reddening it', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ success: false, error: 'That email address looks wrong' }),
    });

    const user = userEvent.setup();
    const { container } = render(<StartPage />);

    await user.type(screen.getByLabelText(/^contact name/i), 'Ada');
    await user.type(screen.getByLabelText(/^email address/i), 'ada@northgate.test');
    await user.type(screen.getByLabelText(/^company name/i), 'Northgate');
    await user.click(screen.getByRole('button', { name: /send my selections/i }));

    await waitFor(() => {
      const region = container.querySelector('[role="alert"]');
      expect(region?.textContent).toContain('That email address looks wrong');
    });
  });
});

describe('and it stays quiet otherwise', () => {
  it.each([
    ['the client login', ClientLogin],
    ['the admin login', AdminLogin],
    ['the enquiry form', StartPage],
  ])('%s announces nothing before anything has gone wrong', (_name, Page) => {
    // An always-mounted region is only correct if it is empty to begin with;
    // one that ships with content announces on page load.
    const { container } = render(<Page />);
    expect(container.querySelector(LIVE_REGION)?.textContent?.trim()).toBe('');
  });
});
