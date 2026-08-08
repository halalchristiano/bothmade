import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { LuxuryCursor } from '@/components/LuxuryCursor';

/**
 * The custom cursor honours prefers-reduced-motion. It did not.
 *
 * Two things were wrong, and the second is the larger one.
 *
 * The trail is a requestAnimationFrame lerp — an element that visibly lags
 * and chases the pointer, which is the shape of motion the setting exists to
 * suppress. The reduced-motion block in app/globals.css cannot reach it: that
 * flattens animation-duration and transition-duration, while this writes
 * `style.transform` directly every frame.
 *
 * And `.has-lux-cursor { cursor: none }` takes away the *system* cursor
 * across the whole document, leaving a 6px dot. Anyone running a large or
 * high-contrast OS pointer — a setting people turn on in order to find the
 * cursor at all — loses it. Reduced motion is the closest signal a browser
 * offers that someone wants their own machine's behaviour.
 *
 * Eight other components already call useReducedMotion, FocusRow drops its
 * animation wholesale, and globals.css carries a reduced-motion block. This
 * was the one place the policy stopped.
 */

/** matchMedia stub that answers each query independently. */
function stubMedia({ fine = true, reduce = false }) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduce : fine,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0 as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.className = '';
  document.body.innerHTML = '';
});

const cursorHidden = () => document.documentElement.classList.contains('has-lux-cursor');

describe('when the visitor has asked for reduced motion', () => {
  it('leaves the system cursor alone', async () => {
    stubMedia({ fine: true, reduce: true });
    await act(async () => {
      render(<LuxuryCursor />);
    });
    expect(cursorHidden(), 'cursor: none was applied despite reduced motion').toBe(false);
  });

  it('does not start the trail following the pointer', async () => {
    stubMedia({ fine: true, reduce: true });
    await act(async () => {
      render(<LuxuryCursor />);
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 80 }));
    });

    // Both elements stay at their rendered opacity-0; nothing reveals them.
    for (const el of document.querySelectorAll('.lux-cursor')) {
      expect((el as HTMLElement).style.opacity).not.toBe('1');
    }
  });
});

describe('when the visitor has not asked for reduced motion', () => {
  it('still takes over the cursor on a fine pointer', async () => {
    // The feature must survive the guard — a fix that disabled it for
    // everyone would pass the tests above and be a worse outcome.
    stubMedia({ fine: true, reduce: false });
    await act(async () => {
      render(<LuxuryCursor />);
    });
    expect(cursorHidden()).toBe(true);
  });

  it('reveals the dot once the pointer moves', async () => {
    stubMedia({ fine: true, reduce: false });
    await act(async () => {
      render(<LuxuryCursor />);
    });

    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 80 }));
    });

    const shown = [...document.querySelectorAll('.lux-cursor')].filter(
      (el) => (el as HTMLElement).style.opacity === '1'
    );
    expect(shown.length).toBeGreaterThan(0);
  });
});

describe('on a touch device', () => {
  it('leaves the cursor alone regardless of the motion setting', async () => {
    // Pre-existing behaviour, pinned so the new guard cannot be refactored
    // into replacing it rather than joining it.
    stubMedia({ fine: false, reduce: false });
    await act(async () => {
      render(<LuxuryCursor />);
    });
    expect(cursorHidden()).toBe(false);
  });
});
