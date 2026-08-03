import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MiniBarChart, PageIn, clickableRowProps, matchesSearch } from '@/components/admin/ui';

/**
 * The shared admin primitives. `clickableRowProps` in particular is what
 * makes the lead tables reachable at all without a mouse — every list in the
 * CRM navigates through it.
 */

describe('clickableRowProps', () => {
  it('puts the row in the tab order with an accessible name', () => {
    const onActivate = vi.fn();
    render(<tr {...clickableRowProps(onActivate, 'Open Linpotia Cafe')} />, {
      container: document.body.appendChild(document.createElement('table')).appendChild(
        document.createElement('tbody')
      ),
    });

    const row = screen.getByRole('row', { name: 'Open Linpotia Cafe' });
    expect(row).toHaveAttribute('tabindex', '0');
  });

  it('activates on click, Enter and Space', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<div {...clickableRowProps(onActivate, 'Open Linpotia Cafe')} />);

    const row = screen.getByLabelText('Open Linpotia Cafe');

    await user.click(row);
    expect(onActivate).toHaveBeenCalledTimes(1);

    row.focus();
    await user.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalledTimes(2);

    await user.keyboard(' ');
    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  it('ignores other keys', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<div {...clickableRowProps(onActivate, 'Open Acme')} />);

    screen.getByLabelText('Open Acme').focus();
    await user.keyboard('{ArrowDown}a{Escape}');

    expect(onActivate).not.toHaveBeenCalled();
  });

  it('leaves a checkbox inside the row to handle its own Space', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(
      <div {...clickableRowProps(onActivate, 'Open Acme')}>
        <input type="checkbox" aria-label="Select Acme" />
      </div>
    );

    const checkbox = screen.getByRole('checkbox');
    checkbox.focus();
    await user.keyboard(' ');

    // Space ticks the box; it must not also navigate away from the list.
    expect(checkbox).toBeChecked();
    expect(onActivate).not.toHaveBeenCalled();
  });
});

describe('PageIn', () => {
  it('renders its content', () => {
    render(
      <PageIn className="my-class">
        <p>Page body</p>
      </PageIn>
    );

    expect(screen.getByText('Page body')).toBeInTheDocument();
    expect(screen.getByText('Page body').parentElement).toHaveClass('my-class');
  });

  it('animates in by default', () => {
    render(
      <PageIn>
        <p>Page body</p>
      </PageIn>
    );

    // A motion.div starts mid-transition with inline opacity and transform.
    // The reduced-motion counterpart is covered in ui-reduced-motion.test.tsx.
    expect(screen.getByText('Page body').parentElement).toHaveAttribute('style');
  });
});

describe('MiniBarChart', () => {
  const data = [
    { label: 'Jan', value: 10 },
    { label: 'Feb', value: 30 },
  ];

  it('renders a non-interactive chart when there is nothing to click', () => {
    render(<MiniBarChart data={data} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Jan')).toBeInTheDocument();
  });

  it('makes each bar a labelled button when it is clickable', async () => {
    const user = userEvent.setup();
    const onBarClick = vi.fn();
    render(<MiniBarChart data={data} onBarClick={onBarClick} formatValue={(v) => `$${v}`} />);

    const feb = screen.getByRole('button', { name: 'Feb: $30' });
    await user.click(feb);

    expect(onBarClick).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('marks the selected bar as pressed', () => {
    render(<MiniBarChart data={data} onBarClick={vi.fn()} selectedIndex={0} />);

    expect(screen.getByRole('button', { name: 'Jan: 10' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Feb: 30' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('matchesSearch', () => {
  it('matches everything on an empty query', () => {
    expect(matchesSearch('', 'Acme')).toBe(true);
    expect(matchesSearch('   ', 'Acme')).toBe(true);
  });

  it('is case-insensitive and matches partial words', () => {
    expect(matchesSearch('acm', 'Acme Ltd')).toBe(true);
  });

  it('requires every word, but not in order or in one field', () => {
    expect(matchesSearch('van cleaning', "Van's Cleaning Services")).toBe(true);
    expect(matchesSearch('miami roofing', 'Roofing Co', null, 'based in Miami')).toBe(true);
    expect(matchesSearch('miami plumbing', 'Roofing Co', null, 'based in Miami')).toBe(false);
  });

  it('ignores null and undefined fields', () => {
    expect(matchesSearch('acme', null, undefined, 'Acme')).toBe(true);
  });
});
