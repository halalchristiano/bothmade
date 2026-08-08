import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Mocks, env stubs and global stubs are reset here, for both projects at once.
// This file used to call vi.restoreAllMocks() itself and stop there, which
// left vi.stubEnv and vi.stubGlobal leaking into the next test in the file.
import './setup-state';

afterEach(() => {
  cleanup();
});

// jsdom implements neither of these, and framer-motion and every component
// that asks about reduced motion call them on mount.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}

/*
 * jsdom has no ResizeObserver either, and the client portal's tab bar reaches
 * for one: the pill row scrolls with its scrollbar hidden, so it measures
 * itself to decide whether to fade its trailing edge and say there is more.
 *
 * Without this, every test that renders that page throws on mount — which is
 * how a change to one component broke four unrelated suites. A no-op is the
 * right stub: jsdom has no layout, so an observer here could never report a
 * size change honestly. Tests that care about the measurement supply their
 * own stub that fires on demand.
 */
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Same gap again: jsdom has no IntersectionObserver, and framer-motion's
// `whileInView` reaches for one the moment such a component mounts.
//
// This stub reports every observed element as already on screen. jsdom has no
// layout, so it could not answer the question honestly in any case, and a test
// that renders a scroll-revealed section is asking what it looks like once
// revealed — an observer that never fires would leave it permanently blank.
if (!window.IntersectionObserver) {
  class StubIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];

    constructor(private readonly callback: IntersectionObserverCallback) {}

    observe(target: Element) {
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this
      );
    }

    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  window.IntersectionObserver =
    StubIntersectionObserver as unknown as typeof window.IntersectionObserver;
}
