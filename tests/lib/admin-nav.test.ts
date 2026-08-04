import { describe, expect, it } from 'vitest';
import { ADMIN_NAV_ITEMS, groupSections } from '@/lib/admin-nav';

/**
 * The nav is the same for everyone now — the `salesVisible` flag that withheld
 * Clients, Projects, Priorities, Mockups and Team from a sales account came
 * down with the `OPS` tier it mirrored.
 *
 * What's left to hold is the grouping: a heading must never render with
 * nothing under it, and a section must never appear twice.
 */

const sections = () => groupSections(ADMIN_NAV_ITEMS).map((g) => g.section);

describe('the whole nav', () => {
  it('offers every destination, with nothing held back by role', () => {
    const labels = ADMIN_NAV_ITEMS.map((i) => i.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Clients',
        'Projects',
        'Priorities',
        'Mockups',
        'Team',
        'Leads',
        'Pipeline',
        'Billing',
      ])
    );
  });

  it('keeps care plans out — they are per-project, not a destination', () => {
    // The monthly upsell lives as a band on /admin/projects/[id], because it
    // only means anything with a project in front of you.
    expect(ADMIN_NAV_ITEMS.map((i) => i.href)).not.toContain('/admin/care-plans');
  });
});

describe('the sections', () => {
  it('gives Billing one of its own, so it is not just another row', () => {
    const billing = ADMIN_NAV_ITEMS.find((i) => i.href === '/admin/billing');
    expect(billing?.section).toBe('One-off charges');
    expect(ADMIN_NAV_ITEMS.filter((i) => i.section === 'One-off charges')).toHaveLength(1);
  });

  it('never renders a heading with nothing under it', () => {
    for (const group of groupSections(ADMIN_NAV_ITEMS)) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it('never splits one section into two boxes', () => {
    // Grouping is by *consecutive* run, so a section whose items aren't
    // adjacent would silently render its heading twice.
    expect(new Set(sections()).size).toBe(sections().length);
  });

  it('starts with the unheaded item, so the list does not open on a label', () => {
    expect(sections()[0]).toBe('');
  });

  it('loses no item to grouping', () => {
    expect(groupSections(ADMIN_NAV_ITEMS).flatMap((g) => g.items)).toEqual(ADMIN_NAV_ITEMS);
  });
});
