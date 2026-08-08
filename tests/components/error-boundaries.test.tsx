import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PublicError from '@/app/error';
import GlobalError from '@/app/global-error';

/**
 * The two screens a visitor gets when the site fails, and the reference that
 * makes their report answerable.
 *
 * `error.js` wraps the pages and nested layouts below it — not the layout in
 * its own segment. So a throw in the root layout went straight past the
 * branded boundary and handed the visitor Next's unstyled default, which is
 * the one screen app/error.tsx's own comment says a studio selling polish can
 * never afford to show. `global-error.tsx` is the file that catches it, and
 * it did not exist.
 *
 * And the digest was destructured on the public page and never rendered,
 * while the admin boundary — used by the two people who can read the server
 * logs themselves — has always shown it. In production a Server Component's
 * real message is deliberately replaced by a generic one, so that hash is the
 * only thing tying what a visitor saw to what the server wrote down.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const boom = (digest?: string) => Object.assign(new Error('kaboom'), { digest });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the public error page', () => {
  it('gives the visitor a reference to quote', async () => {
    render(<PublicError error={boom('a1b2c3d4')} retry={vi.fn()} />);

    expect(await screen.findByText(/a1b2c3d4/)).toBeTruthy();
    expect(screen.getByText(/quote this/i)).toBeTruthy();
  });

  it('says nothing about a reference when there is none to quote', () => {
    render(<PublicError error={boom()} retry={vi.fn()} />);

    expect(screen.queryByText(/reference/i)).toBeNull();
  });

  it('never puts the exception text in front of a visitor', () => {
    render(<PublicError error={boom('a1b2c3d4')} retry={vi.fn()} />);

    expect(screen.queryByText(/kaboom/)).toBeNull();
  });

  it('retries rather than re-rendering the same failure', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<PublicError error={boom()} retry={retry} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(retry).toHaveBeenCalled();
  });
});

describe('the boundary above the root layout', () => {
  it('renders a branded page rather than the framework default', () => {
    render(<GlobalError error={boom('deadbeef')} retry={vi.fn()} />);

    expect(screen.getByText(/something broke/i)).toBeTruthy();
    expect(screen.getByText(/before the page could even start/i)).toBeTruthy();
  });

  it('paints its own background, because no global stylesheet reaches it', () => {
    // A Tailwind class here would be a class with no stylesheet behind it —
    // which is how a "branded" fallback ends up as black text on white after
    // all. Every rule has to be inline. React applies the <body> props to the
    // real document, which is where this ends up.
    render(<GlobalError error={boom()} retry={vi.fn()} />);

    expect(document.body.getAttribute('style')).toContain('background: rgb(5, 3, 10)');
  });

  it('carries a title of its own, since metadata is not available to it', () => {
    render(<GlobalError error={boom()} retry={vi.fn()} />);

    expect(document.head.querySelector('title')?.textContent).toMatch(/something went wrong/i);
  });

  it('offers the same two ways out, and the reference', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<GlobalError error={boom('deadbeef')} retry={retry} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /back home/i }).getAttribute('href')).toBe('/');
    expect(screen.getByText(/deadbeef/)).toBeTruthy();
  });

  it('keeps the exception text off the page here too', () => {
    render(<GlobalError error={boom('deadbeef')} retry={vi.fn()} />);

    expect(screen.queryByText(/kaboom/)).toBeNull();
  });

  it('does not ask a search engine to index a crash', () => {
    render(<GlobalError error={boom()} retry={vi.fn()} />);

    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain(
      'noindex'
    );
  });
});
