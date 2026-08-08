import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { LuxuryCursor } from '@/components/LuxuryCursor';

/**
 * One cursor crosses two grounds. The site is near-black almost everywhere,
 * so the dot is the brand's sky blue — but the contact panel is white, and
 * against it that blue sat at about 1.67:1. Worse, the hover state turned the
 * dot white, so resting on a form field made it white-on-white: not merely
 * hard to see but actively destructive, eating the placeholder underneath it.
 *
 * Measured in Chromium after the fix: 4.02:1 idle on white and 21:1 over a
 * field, with the dark ground unchanged at 12.31:1. jsdom cannot compute any
 * of that, so what is pinned here is the switch that selects the palette —
 * that it reads the surface rather than being told, and that it does not go
 * white on white.
 */

/*
 * Answers each media query on its own terms.
 *
 * This used to return `{ matches: true }` for everything, which was fine
 * while the component asked only one question. It now also checks
 * prefers-reduced-motion, and a blanket true meant "fine pointer" and "wants
 * less motion" at the same time — a combination that describes nobody, and
 * one under which the component correctly does nothing at all. The stub, not
 * the component, was the thing that had to change.
 */
const media = (query: string) => ({
  matches: query.includes('prefers-reduced-motion') ? false : true,
  media: query,
  addEventListener() {},
  removeEventListener() {},
});

beforeEach(() => {
  vi.stubGlobal('matchMedia', media);
  // The component drives position on the frame clock; one tick is enough.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    return 0 as unknown as number;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** Puts a target inside a surface of the given colour and hovers it. */
async function hoverOver(background: string, tag: 'div' | 'input' = 'div') {
  const surface = document.createElement('div');
  surface.style.backgroundColor = background;
  const target = document.createElement(tag);
  surface.appendChild(target);
  document.body.appendChild(surface);

  render(<LuxuryCursor />);

  await act(async () => {
    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });

  const cursors = document.querySelectorAll('.lux-cursor');
  return { dot: cursors[0].className, ring: cursors[1].className };
}

describe('on the dark ground the site mostly is', () => {
  it('keeps the brand blue', async () => {
    const { dot } = await hoverOver('rgb(5, 3, 10)');

    expect(dot).toContain('bg-sky-300');
  });

  it('goes white over something interactive', async () => {
    const { dot } = await hoverOver('rgb(5, 3, 10)', 'input');

    expect(dot).toContain('bg-white');
  });
});

describe('on the white contact panel', () => {
  it('keeps the blue but drops to a shade that survives white', async () => {
    const { dot, ring } = await hoverOver('rgb(255, 255, 255)');

    expect(dot).toContain('bg-sky-600');
    expect(dot).not.toContain('bg-sky-300');
    expect(ring).toContain('border-sky-600');
  });

  it('never goes white on white — the bug that erased the placeholder', async () => {
    const { dot, ring } = await hoverOver('rgb(255, 255, 255)', 'input');

    expect(dot).toContain('bg-black');
    expect(dot).not.toContain('bg-white');
    expect(ring).not.toContain('border-white');
  });
});

describe('how it decides', () => {
  it('reads the surface rather than waiting to be told about it', async () => {
    // No data attribute, no registry, nothing the section had to opt into —
    // a light panel added tomorrow gets the right cursor for free.
    const { dot } = await hoverOver('rgb(250, 250, 248)');

    expect(dot).toContain('bg-sky-600');
  });

  it('looks past a translucent overlay to the surface that is actually painted', async () => {
    // A white/5 wash over near-black is still a dark surface; treating the
    // wash as the ground would flip the cursor on half the site.
    const surface = document.createElement('div');
    surface.style.backgroundColor = 'rgb(5, 3, 10)';
    const wash = document.createElement('div');
    wash.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    surface.appendChild(wash);
    document.body.appendChild(surface);

    render(<LuxuryCursor />);
    await act(async () => {
      wash.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    expect(document.querySelector('.lux-cursor')!.className).toContain('bg-sky-300');
  });
});
