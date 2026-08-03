import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * The homepage would rather have a gap in it than a quote nobody said.
 *
 * A testimonial section is the easiest thing on a marketing site to fill
 * with invention — a stock headshot, "Sarah M., CEO", praise paraphrased
 * from nothing. The section is built and wired, and renders *nothing at
 * all* until lib/testimonials.ts holds something a real client actually
 * said. These tests are what stops the empty state from being "fixed" by
 * filling it in.
 */

describe('while there is nothing true to show', () => {
  it('renders nothing at all, rather than an empty section', async () => {
    const { SocialProof } = await import('@/components/SocialProof');
    const { container } = render(<SocialProof />);

    expect(container).toBeEmptyDOMElement();
  });

  it('ships no placeholder quotes or invented numbers to fall back on', async () => {
    const { TESTIMONIALS, PROOF_STATS } = await import('@/lib/testimonials');

    expect(TESTIMONIALS).toEqual([]);
    expect(PROOF_STATS).toEqual([]);
  });
});

describe('once a real client has said something', () => {
  it('shows the quote, who said it, and where they said it about', async () => {
    vi.resetModules();
    vi.doMock('@/lib/testimonials', () => ({
      TESTIMONIALS: [
        {
          quote: 'They shipped it and then they stayed.',
          name: 'A Real Person',
          role: 'Founder',
          company: 'Ridgeline',
          project: 'Website + booking system',
        },
      ],
      PROOF_STATS: [],
      hasSocialProof: true,
    }));

    const { SocialProof } = await import('@/components/SocialProof');
    render(<SocialProof />);

    expect(screen.getByText(/They shipped it and then they stayed/)).toBeInTheDocument();
    expect(screen.getByText(/A Real Person/)).toBeInTheDocument();
    expect(screen.getByText(/Ridgeline/)).toBeInTheDocument();

    vi.doUnmock('@/lib/testimonials');
    vi.resetModules();
  });
});
