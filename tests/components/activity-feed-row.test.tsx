import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityRow } from '@/components/admin/dashboard/ActivityRow';

/**
 * A feed row is only a link when there is somewhere to go.
 *
 * Rows with neither a project nor a lead behind them rendered as `href="#"`:
 * clickable-looking, hover-highlighted, and on click they scrolled you to the
 * top of the page. That reads as a broken click rather than as "there is
 * nothing more to see here", which is what is actually true.
 */

const item = (over: Record<string, unknown> = {}) => ({
  type: 'message' as const,
  id: 'a1',
  projectId: null,
  label: 'Linpotia sent a message',
  preview: 'Can we move the launch?',
  createdAt: new Date('2026-08-07T14:32:00Z').toISOString(),
  ...over,
});

describe('a row in the activity feed', () => {
  it('links to the project when it has one', () => {
    render(<ActivityRow item={item({ projectId: 'proj_1' }) as never} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/projects/proj_1');
  });

  it('falls back to the lead when there is no project', () => {
    render(<ActivityRow item={item({ leadId: 'lead_9' }) as never} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/admin/leads/lead_9');
  });

  it('is not a link at all when there is nowhere to go', () => {
    render(<ActivityRow item={item() as never} />);

    expect(screen.queryByRole('link')).toBeNull();
    // The row still says what happened — it just stops pretending to be a way
    // to read more about it.
    expect(screen.getByText('Linpotia sent a message')).toBeTruthy();
  });

  it('carries a time, not just a date', () => {
    render(<ActivityRow item={item({ projectId: 'p' }) as never} />);
    // Everything in this feed is recent by construction, so a column of
    // identical dates was the one part of the row carrying no information.
    expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeTruthy();
  });
});
