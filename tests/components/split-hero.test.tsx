import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplitHero } from '@/components/SplitHero';
import { BASE_SERVICES } from '@/lib/pricing';

/**
 * The hero's price line is the first commercial claim the site makes, and it
 * used to float in its own band at the top — sharing a strip with the nav and
 * the browser-chrome mock, which meant the three collided at some widths and
 * not others. It now hangs off the wordmark, so it has a fixed relationship
 * to the one element it belongs with at every width.
 *
 * jsdom has no layout engine and cannot measure that. The real check is in
 * Chromium at eight widths and is recorded in the commit; what is pinned here
 * is the structure that makes it hold, plus the one thing that would be worse
 * than a layout bug — the prices being wrong.
 */

const price = () => screen.getByRole('link', { name: /Websites from/i });

/** The invisible copy of the wordmark that the price line is anchored to. */
const spacer = () =>
  [...document.querySelectorAll('p')].find(
    (p) => p.textContent?.trim() === 'BOTHMADE' && p.className.includes('invisible')
  );

describe('the price line', () => {
  it('quotes the same figures as the pricing table', () => {
    render(<SplitHero />);

    // A marketing page quoting a stale price is worse than an ugly one: it is
    // the first number a visitor sees and they will hold us to it.
    const website = BASE_SERVICES.website.price / 100_000;
    const ios = BASE_SERVICES['ios-app'].price / 100_000;

    expect(price()).toHaveTextContent(`Websites from $${website}k`);
    expect(price()).toHaveTextContent(`iOS apps from $${ios}k`);
  });

  it('sends people to the configurator', () => {
    render(<SplitHero />);

    expect(price()).toHaveAttribute('href', '/start');
  });

  it('hangs off the wordmark rather than floating in the top band', () => {
    render(<SplitHero />);

    // bottom-full against the invisible wordmark copy is what keeps the two
    // together. Absolutely positioning it near the top again is what caused
    // the collision with the chrome mock.
    expect(price().className).toContain('bottom-full');
    expect(spacer()).toBeTruthy();
  });

  it('measures its gap from the same size the wordmark is painted at', () => {
    render(<SplitHero />);

    const painted = [...document.querySelectorAll('p')].filter(
      (p) => p.textContent?.trim() === 'BOTHMADE' && !p.className.includes('invisible')
    );

    // If the spacer and the painted copies ever disagree, the price line
    // drifts off the letters at some widths and not others.
    expect(painted.length).toBeGreaterThan(0);
    for (const p of painted) {
      expect((p as HTMLElement).style.fontSize).toBe(spacer()!.style.fontSize);
    }
  });

  it('stays on one line — it reads as a price, not a paragraph', () => {
    render(<SplitHero />);

    expect(price().className).toContain('whitespace-nowrap');
  });
});

describe('the layer it lives in', () => {
  it('does not swallow the seam drag', () => {
    render(<SplitHero />);

    // The layer spans the whole hero, so without this the seam — the entire
    // point of the hero — would stop responding to the pointer.
    const layer = price().closest('.absolute.inset-0');

    expect(layer?.className).toContain('pointer-events-none');
    expect(price().className).toContain('pointer-events-auto');
  });

  it('sits below the mobile menu, not through it', () => {
    render(<SplitHero />);

    // The nav overlay is z-40 in the same stacking context; anything higher
    // here punches the hero copy through an open menu.
    expect(price().closest('.absolute.inset-0')?.className).toContain('z-20');
  });
});

describe('the heading', () => {
  it('keeps an h1, even though nothing visible carries it', () => {
    render(<SplitHero />);

    // A homepage with no h1 reads as untitled to assistive tech and to search.
    const h1 = screen.getByRole('heading', { level: 1 });

    expect(h1).toHaveClass('sr-only');
    expect(h1).toHaveTextContent(/Bothmade builds websites/);
  });

  it('does not announce the decorative wordmark copies', () => {
    render(<SplitHero />);

    // Three copies of "BOTHMADE" exist in the DOM; a screen reader should
    // meet none of them.
    for (const p of document.querySelectorAll('p')) {
      if (p.textContent?.trim() === 'BOTHMADE') {
        expect(p.closest('[aria-hidden="true"]')).toBeTruthy();
      }
    }
  });
});
