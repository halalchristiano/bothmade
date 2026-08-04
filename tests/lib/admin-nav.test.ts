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
  it('includes Billing — charging a customer for extra work is sales work', () => {
    expect(labelsFor('sales')).toContain('Billing');
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
  it('gives Billing one of its own, so it is not just another row', () => {
    const billing = ADMIN_NAV_ITEMS.find((i) => i.href === '/admin/billing');
    expect(billing?.section).toBe('One-off charges');
    expect(ADMIN_NAV_ITEMS.filter((i) => i.section === 'One-off charges')).toHaveLength(1);
  });

  it('keeps care plans out of the nav — they are per-project, not a destination', () => {
    // The monthly upsell lives as a band on /admin/projects/[id], because it
    // only means anything with a project in front of you. Sales reaches it
    // through the sidebar search, which returns projects to any staff account.
    expect(ADMIN_NAV_ITEMS.map((i) => i.href)).not.toContain('/admin/care-plans');
  });

  it('renders no empty section for a sales account', () => {
    // Delivery is entirely ops, so its heading must disappear with its items
    // rather than sitting there looking like a section that failed to load.
    expect(sectionsFor('sales')).not.toContain('Delivery');
    for (const group of groupSections(visibleNavItems('sales'))) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it('keeps One-off charges for sales, since its one item survives filtering', () => {
    expect(sectionsFor('sales')).toContain('One-off charges');
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
