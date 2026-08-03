import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * framer-motion resolves the reduced-motion preference once per module and
 * caches it, so stubbing `matchMedia` after import has no effect. Mocking
 * the hook is the honest way to exercise the guarded branch — which lives in
 * its own file because `vi.mock` applies to the whole module graph.
 */
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: () => true };
});

const { MiniBarChart, PageIn } = await import('@/components/admin/ui');

describe('when the viewer has asked for reduced motion', () => {
  it('PageIn renders a plain div with no entrance transform', () => {
    render(
      <PageIn className="my-class">
        <p>Page body</p>
      </PageIn>
    );

    const wrapper = screen.getByText('Page body').parentElement!;
    expect(wrapper).toHaveClass('my-class');
    // The animated path leaves `opacity: 0; transform: translateY(8px)` on
    // the element for the first frame. This path leaves nothing.
    expect(wrapper.getAttribute('style')).toBeNull();
  });

  it('MiniBarChart draws its bars at full height immediately', () => {
    const { container } = render(
      <MiniBarChart
        data={[
          { label: 'Jan', value: 10 },
          { label: 'Feb', value: 20 },
        ]}
      />
    );

    const bars = Array.from(container.querySelectorAll<HTMLElement>('div[style*="height"]'));
    expect(bars).toHaveLength(2);
    // Not 0% — the bars never start collapsed and grow.
    expect(bars.map((b) => b.style.height)).toEqual(['50%', '100%']);
  });

  it('the chart is still readable — labels and values are unchanged', () => {
    render(<MiniBarChart data={[{ label: 'Jan', value: 10 }]} formatValue={(v) => `$${v}`} />);

    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('$10')).toBeInTheDocument();
  });
});
