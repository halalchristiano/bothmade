import { describe, expect, it } from 'vitest';
import { ADMIN_NAV_ITEMS, groupSections, visibleNavItems } from '@/lib/admin-nav';

/**
 * The nav's two rules.
 *
 * A sales account must never be offered a destination the route would refuse —
 * hiding a link isn't access control, but offering one that 403s is its own
 * kind of broken. And a section must never render a heading with nothing under
 * it, which is what happens the moment grouping runs before filtering instead
 * of after.
 */

const sectionsFor = (role: string) => groupSections(visibleNavItems(role)).map((g) => g.section);
const labelsFor = (role: string) => visibleNavItems(role).map((i) => i.label);

describe('what a sales account is offered', () => {
  it('includes Care Plans — the end-of-build upsell is sales work', () => {
    expect(labelsFor('sales')).toContain('Care Plans');
  });

  it('still withholds the ops surface', () => {
    const labels = labelsFor('sales');
    expect(labels).not.toContain('Projects');
    expect(labels).not.toContain('Clients');
    expect(labels).not.toContain('Priorities');
    expect(labels).not.toContain('Team');
  });

  it('leaves the CRM alone', () => {
    const labels = labelsFor('sales');
    expect(labels).toEqual(expect.arrayContaining(['Leads', 'Pipeline', 'Who to call']));
  });
});

describe('what everyone else is offered', () => {
  it('is the whole list, for owner and admin alike', () => {
    expect(visibleNavItems('owner')).toHaveLength(ADMIN_NAV_ITEMS.length);
    expect(visibleNavItems('admin')).toHaveLength(ADMIN_NAV_ITEMS.length);
  });

  it('treats an unknown or missing role as sales — the least it could be', () => {
    // Matches lib/authz.ts: an absent claim must never widen access.
    expect(labelsFor('')).not.toContain('Projects');
  });
});

describe('the sections', () => {
  it('gives Care Plans one of its own, so it is not just another row', () => {
    const care = ADMIN_NAV_ITEMS.find((i) => i.href === '/admin/care-plans');
    expect(care?.section).toBe('Recurring revenue');
    expect(ADMIN_NAV_ITEMS.filter((i) => i.section === 'Recurring revenue')).toHaveLength(1);
  });

  it('spotlights it, and nothing else — emphasis everywhere is emphasis nowhere', () => {
    expect(ADMIN_NAV_ITEMS.filter((i) => i.spotlight).map((i) => i.label)).toEqual(['Care Plans']);
  });

  it('renders no empty section for a sales account', () => {
    // Delivery is entirely ops, so its heading must disappear with its items
    // rather than sitting there looking like a section that failed to load.
    expect(sectionsFor('sales')).not.toContain('Delivery');
    for (const group of groupSections(visibleNavItems('sales'))) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it('keeps Recurring revenue for sales, since its one item survives filtering', () => {
    expect(sectionsFor('sales')).toContain('Recurring revenue');
  });

  it('loses no item to grouping', () => {
    for (const role of ['owner', 'sales']) {
      const flat = visibleNavItems(role);
      const grouped = groupSections(flat).flatMap((g) => g.items);
      expect(grouped).toEqual(flat);
    }
  });

  it('never splits one section into two boxes', () => {
    // Grouping is by *consecutive* run, so a section whose items aren't
    // adjacent would silently render its heading twice.
    for (const role of ['owner', 'sales']) {
      const sections = sectionsFor(role);
      expect(new Set(sections).size).toBe(sections.length);
    }
  });

  it('starts with the unheaded item, so the list does not open on a label', () => {
    expect(sectionsFor('owner')[0]).toBe('');
  });
});
