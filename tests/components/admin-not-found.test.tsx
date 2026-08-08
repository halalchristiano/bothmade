import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AdminNotFound from '@/app/admin/not-found';
import MarketingNotFound from '@/app/not-found';

/**
 * A missing admin page must not hand staff the sales pitch.
 *
 * Next resolves a missing route to the nearest `not-found.tsx`, and the only
 * one in the app was the marketing one. So a signed-in staff member who
 * mistyped a URL or followed a stale bookmark got the full-bleed "Not made."
 * headline, the public nav, and two ways out: "Back home" to the marketing
 * site and "Get in touch" — the studio pitching a project to one of its own
 * two employees.
 *
 * app/admin/error.tsx already argued this at length for the case where a
 * screen throws. A 404 is the likelier of the two, not the less: an error
 * needs something to go wrong, this needs a typo.
 *
 * These tests are about where the exits lead, since that is the whole
 * difference between the two pages.
 */

describe('the admin 404', () => {
  it('says what happened without implying something broke', () => {
    // A mistyped URL is not a fault, and a red alert panel would send someone
    // looking for a problem that is not there.
    render(<AdminNotFound />);
    expect(screen.getByText(/no page here/i)).toBeInTheDocument();
  });

  it('offers a way back into the admin', () => {
    render(<AdminNotFound />);
    const dashboard = screen.getByRole('link', { name: /back to dashboard/i });
    expect(dashboard).toHaveAttribute('href', '/admin/dashboard');
  });

  it('points at the places somebody was probably heading', () => {
    render(<AdminNotFound />);
    expect(screen.getByRole('link', { name: /^leads$/i })).toHaveAttribute('href', '/admin/leads');
    expect(screen.getByRole('link', { name: /^projects$/i })).toHaveAttribute(
      'href',
      '/admin/projects'
    );
  });

  it('sends nobody to the marketing site or the contact form', () => {
    // The actual regression. Every link has to stay inside /admin — this is
    // the property that makes the file worth existing.
    const { container } = render(<AdminNotFound />);
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, `"${href}" leaves the admin`).toMatch(/^\/admin\//);
    }
  });

  it('does not offer a retry, which could not work', () => {
    // A route that does not exist will not start existing on a re-fetch. The
    // error boundary's "Try again" is right there and wrong here.
    render(<AdminNotFound />);
    expect(screen.queryByRole('button', { name: /try again|retry/i })).toBeNull();
  });
});

describe('the marketing 404 it replaces, for contrast', () => {
  it('is the one that sends people home and pitches the studio', () => {
    // Correct for a stranger who mistyped bothmade.studio; wrong for staff
    // three clicks into the CRM. Asserted so the distinction is on the record
    // rather than in a commit message.
    const { container } = render(<MarketingNotFound />);
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');

    expect(hrefs).toContain('/');
    expect(hrefs.some((h) => h.includes('#contact'))).toBe(true);
    expect(hrefs.some((h) => h.startsWith('/admin/'))).toBe(false);
  });
});
