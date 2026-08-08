import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RevenueChart } from '@/components/admin/analytics/RevenueChart';

/**
 * The split between project work and care plans, on a device with no hover.
 *
 * It lived in a `title` attribute — a tooltip that needs a mouse pointer. On
 * a phone, which is where this admin is most often opened, the one thing the
 * chart exists to show could not be got at at all: a two-tone bar, a total,
 * and no way to learn which part was which. It is also the difference between
 * a studio that has to sell every month and one that does not, so it is not a
 * detail worth hiding behind a pointing device.
 */

const DATA = [
  { label: 'Jun', oneOff: 400_000, recurring: 100_000 },
  { label: 'Jul', oneOff: 250_000, recurring: 150_000 },
];

describe('the revenue chart', () => {
  it('offers every month as something you can actually press', () => {
    render(<RevenueChart data={DATA} />);

    // Buttons, not divs: reachable by tap, by keyboard, and by a screen
    // reader that would never have announced a title on a div.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('names the split in a label, without anybody hovering anything', () => {
    render(<RevenueChart data={DATA} />);

    expect(
      screen.getByRole('button', { name: /Jun: .*4,000.* project work, .*1,000.* care plans/ })
    ).toBeTruthy();
  });

  it('breaks a month down when it is tapped', async () => {
    const user = userEvent.setup();
    render(<RevenueChart data={DATA} />);

    expect(screen.getByText(/Tap a month/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Jul:/ }));

    expect(screen.queryByText(/Tap a month/)).toBeNull();
    expect(screen.getByRole('button', { name: /^Jul:/ })).toHaveAttribute('aria-pressed', 'true');
    // Both halves and the total, in text, on the page.
    expect(screen.getByText(/project work/)).toBeTruthy();
    expect(screen.getByText(/care plans/)).toBeTruthy();
  });

  it('closes again when the same month is tapped twice', async () => {
    const user = userEvent.setup();
    render(<RevenueChart data={DATA} />);

    const jun = screen.getByRole('button', { name: /^Jun:/ });
    await user.click(jun);
    expect(jun).toHaveAttribute('aria-pressed', 'true');

    await user.click(jun);
    expect(jun).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/Tap a month/)).toBeTruthy();
  });

  /**
   * Caught by a screenshot, not by a unit test: six full figures across a
   * phone overflowed their columns and the outermost one was clipped by the
   * edge of the scroll box, so the most recent month rendered as "$15,30".
   */
  it('shortens the figure above a bar so six of them fit a phone', () => {
    render(<RevenueChart data={[{ label: 'Aug', oneOff: 1_200_000, recurring: 330_000 }]} />);

    expect(screen.getByText('$15.3k')).toBeTruthy();
    // The exact figure is still one tap away, and still exact.
    expect(screen.getByRole('button', { name: /Aug: .*12,000.*3,300/ })).toBeTruthy();
  });

  it('leaves small months in whole dollars, where the precision fits', () => {
    render(<RevenueChart data={[{ label: 'Sep', oneOff: 40_000, recurring: 0 }]} />);

    expect(screen.getByText('$400')).toBeTruthy();
  });

  it('survives a range with no revenue in it at all', () => {
    render(<RevenueChart data={[{ label: 'Aug', oneOff: 0, recurring: 0 }]} />);

    // Math.max over an empty-ish set is the classic way a chart divides by
    // zero and renders nothing.
    expect(screen.getByRole('button', { name: /^Aug:/ })).toBeTruthy();
  });
});
