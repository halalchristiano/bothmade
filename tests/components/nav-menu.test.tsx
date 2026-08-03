import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Nav } from '@/components/Nav';

/**
 * The mobile menu has ten rows and they all have to be on screen at once.
 *
 * It broke on an iPhone 13 and not on a 17 Pro Max, which is the tell: the
 * two phones are only 50pt apart across but 292pt apart down, so a width
 * breakpoint cannot see the problem. At a fixed text-3xl the rows overflowed
 * the shorter phone, centring pushed the first one up behind the wordmark
 * bar, and auto margins in a scroll container make that top overflow
 * unreachable — "Work" was sliced in half with no way to scroll to it.
 *
 * jsdom has no layout engine, so it cannot measure any of that; the real
 * proof is in Chromium at five viewports and is recorded in the commit. What
 * these tests hold is the two decisions that fix it, either of which would
 * look like harmless tidying to someone who never saw the bug.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

async function openMenu() {
  const user = userEvent.setup();
  render(<Nav />);
  await user.click(screen.getByRole('button', { name: /open menu/i }));
  return user;
}

/** The overlay is the only fixed, full-screen element in the tree. */
const overlay = () => document.querySelector('.fixed.inset-0');

describe('the mobile menu', () => {
  it('sizes its rows against the viewport height, not a fixed step', async () => {
    await openMenu();

    const work = screen.getAllByRole('link', { name: 'Work' }).at(-1)!;

    // svh, not vh: on iOS vh is the height with the browser chrome retracted,
    // so a menu measured in vh is too tall whenever the URL bar is showing.
    expect(work.style.fontSize).toMatch(/clamp\(.*svh.*\)/);
    expect(work.style.paddingBlock).toMatch(/clamp\(.*svh.*\)/);
  });

  it('does not pin the rows to a fixed type scale', async () => {
    await openMenu();

    const work = screen.getAllByRole('link', { name: 'Work' }).at(-1)!;

    // text-3xl is what it was, and what it must not go back to — that is the
    // size that overflowed a 390pt phone.
    expect(work.className).not.toMatch(/\btext-(2xl|3xl|4xl)\b/);
  });

  it('falls back to top alignment rather than hiding a row it cannot centre', async () => {
    await openMenu();

    // `safe center` is load-bearing: with plain `center`, a menu that
    // overflows puts its first row at 41px — behind an 85px header — with
    // scrollTop already 0, so it cannot be reached at all.
    expect(overlay()?.className).toContain('safe_center');
    expect(overlay()?.className).not.toMatch(/\bjustify-center\b/);
  });

  it('does not centre with auto margins, which is what stranded the overflow', async () => {
    await openMenu();

    const rows = overlay()?.querySelector('div');

    expect(rows?.className).not.toMatch(/\bmy-auto\b/);
  });

  it('still lists every destination', async () => {
    await openMenu();

    for (const label of ['Work', 'Web', 'iOS', 'Vision Pro', 'Blog', 'Pricing', 'Contact']) {
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole('link', { name: 'Start a project' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Client Login' }).length).toBeGreaterThan(0);
  });

  it('can still be scrolled if it ever does overflow', async () => {
    await openMenu();

    // The floor on the clamp means a short enough viewport still overflows.
    // That is fine — as long as it scrolls.
    expect(overlay()?.className).toContain('overflow-y-auto');
  });
});
