import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

/**
 * The pill bar on a client's project, at the width a client reads it.
 *
 * Four pills plus their badges need about 418px. An earlier fix stopped them
 * being cut off the edge of a 320px screen entirely — the bar scrolls on its
 * own axis now — and hid the scrollbar while doing it. That left a quieter
 * version of the same problem: at 393px the last pill renders as "Onboar…"
 * with nothing at all to say it can be reached. A clipped word reads as a
 * rendering fault rather than as an invitation to swipe, and that tab is
 * where a client answers the questions the build is waiting on.
 *
 * jsdom has no layout, so scrollWidth and clientWidth are both 0 and the bar
 * never measures as clipped on its own. They are set explicitly here, which
 * is the only honest way to test a decision made from measurements. It also
 * silently drops mask-image from an inline style, which is half of why the
 * fade is a class rather than a style prop — the other half being that this
 * is styling and belongs with the rest of it.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/client/proj_9',
  useParams: () => ({ projectId: 'proj_9' }),
}));

import ProjectPage from '@/app/client/[projectId]/page';

const PROJECT = {
  id: 'proj_9',
  name: 'Acme — Website',
  status: 'IN_PROGRESS',
  statusStage: 2,
  timeline: '6 weeks',
  baseService: 'website-build',
  addOns: [],
  totalPrice: 480_000,
  amountPaid: 240_000,
  balanceDue: 240_000,
  payments: [],
  invoices: [],
  instalments: [],
  estimatedCompletionDate: null,
  liveUrl: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
  messages: [],
  updates: [],
  deliverables: [],
  contractUrl: null,
  client: { company: 'Acme Dental', name: 'Acme Dental', email: 'owner@acmedental.test' },
};

function serve() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = String(url).includes('/onboarding')
        ? { success: true, questions: [] }
        : { success: true, project: PROJECT };
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    })
  );
}

/** Pretend the bar is wider than the space it has, the way a phone makes it. */
function widths(strip: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(strip, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(strip, 'clientWidth', { value: clientWidth, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  serve();
  // jsdom has no ResizeObserver. This one keeps its callback so a test can
  // play the part of the browser noticing the bar changed size — which is the
  // only event that re-measures.
  resizes = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        resizes.push(cb);
      }
      observe() {}
      disconnect() {}
    }
  );
});

let resizes: Array<() => void> = [];

describe('when every tab fits', () => {
  it('leaves the bar alone rather than dimming a tab nothing is hiding', async () => {
    render(<ProjectPage />);
    const strip = await screen.findByRole('tablist');

    expect(strip.className).not.toContain('mask-image');
  });
});

describe('when the bar is cut off', () => {
  it('fades its trailing edge, so the clipped pill reads as reachable', async () => {
    render(<ProjectPage />);
    const strip = await screen.findByRole('tablist');

    // 418px of pills in the 361px a 393px phone leaves after padding.
    widths(strip, 418, 361);
    act(() => resizes.forEach((fire) => fire()));

    await waitFor(() => expect(strip.className).toContain('mask-image'));
  });

  it('stops fading once the bar has room again', async () => {
    render(<ProjectPage />);
    const strip = await screen.findByRole('tablist');

    widths(strip, 418, 361);
    act(() => resizes.forEach((fire) => fire()));
    await waitFor(() => expect(strip.className).toContain('mask-image'));

    widths(strip, 418, 900);
    act(() => resizes.forEach((fire) => fire()));
    await waitFor(() => expect(strip.className).not.toContain('mask-image'));
  });
});

describe('the tab that keyboard focus lands on', () => {
  /*
   * Arrows move focus along a roving tabindex. With the bar scrolled, the
   * pill focus lands on can be off-screen — which is the exact failure a
   * roving tabindex exists to prevent.
   */
  it('is scrolled into view when it changes', async () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(<ProjectPage />);
    await screen.findByRole('tablist');

    (await screen.findByRole('tab', { name: /onboarding/i })).click();

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });
});
