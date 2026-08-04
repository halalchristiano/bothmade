import {
  BarChart3,
  Building2,
  FolderKanban,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  Palette,
  PhoneCall,
  Receipt,
  Repeat,
  Settings,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * What's in the admin nav, who sees it, and how it's grouped.
 *
 * Lifted out of the layout so the two rules that actually matter here can be
 * tested without rendering a page that fetches on mount: a sales account never
 * being shown a destination it would be refused, and a section never rendering
 * a heading with nothing under it.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  salesVisible: boolean;
  /** Heading this sits under. Empty string means no heading above it. */
  section: string;
  /**
   * Carries an accent even when it isn't the current page. For the one or two
   * destinations that are a job rather than a record to look at — if everything
   * were emphasized, nothing would be.
   */
  spotlight?: boolean;
}

/**
 * Grouped rather than one flat list of thirteen, because a flat list makes
 * every destination look equally like everything else — which is how a page
 * ships and nobody finds it.
 *
 * Order inside each group is unchanged from when this was flat, so nothing
 * anybody had learned to reach for has moved.
 */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, salesVisible: true, section: '' },

  { href: '/admin/pipeline', label: 'Pipeline', icon: KanbanSquare, salesVisible: true, section: 'Sales' },
  { href: '/admin/call-list', label: 'Who to call', icon: PhoneCall, salesVisible: true, section: 'Sales' },
  { href: '/admin/leads', label: 'Leads', icon: Users, salesVisible: true, section: 'Sales' },
  { href: '/admin/mockup-queue', label: 'Mockups', icon: Palette, salesVisible: false, section: 'Sales' },

  // Its own section, and the only spotlit item. It's a recurring-revenue job
  // rather than a record to look at, it has a window that closes when the
  // project ends, and it is the one thing here a sales account can reach that
  // lives on a project — all of which makes it the easiest thing on this list
  // to never notice. Visible to sales even though Projects isn't: the
  // end-of-build upsell is sales work, and this page carries none of what
  // Projects withholds — no files, no client records, no revenue figures.
  {
    href: '/admin/care-plans',
    label: 'Care Plans',
    icon: Repeat,
    salesVisible: true,
    section: 'Recurring revenue',
    spotlight: true,
  },

  // Beside Care Plans because both are money after the sale, and separate
  // from it because one bills monthly forever and the other bills once.
  // Visible to sales for the same reason Care Plans is: billing a customer
  // for extra work is sales work, and the page carries none of what Clients
  // and Projects withhold — the customer search needs a query, returns ten
  // rows, and projects five fields.
  { href: '/admin/billing', label: 'Billing', icon: Receipt, salesVisible: true, section: 'One-off charges' },

  { href: '/admin/priorities', label: 'Priorities', icon: ListChecks, salesVisible: false, section: 'Delivery' },
  { href: '/admin/clients', label: 'Clients', icon: Building2, salesVisible: false, section: 'Delivery' },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban, salesVisible: false, section: 'Delivery' },

  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, salesVisible: true, section: 'Studio' },
  { href: '/admin/team-chat', label: 'Team Chat', icon: MessagesSquare, salesVisible: true, section: 'Studio' },
  { href: '/admin/team', label: 'Team', icon: UserCog, salesVisible: false, section: 'Studio' },
  { href: '/admin/settings', label: 'Settings', icon: Settings, salesVisible: true, section: 'Studio' },
];

/**
 * The items this role should be offered. Hiding a link is not access control —
 * every route here enforces its own — but offering one that will 403 is its own
 * kind of broken.
 *
 * Anything that isn't a known ops role gets the narrow list, matching the rule
 * `lib/authz.ts` already states: an absent claim must never widen access. This
 * used to be `role !== 'sales'`, which meant the *unresolved* role the layout
 * holds for the first moment after mount — before `/api/auth/me` answers —
 * showed the full nav. A sales account got a visible flash of Projects,
 * Clients and Team before the list corrected itself, and a failed `me` call
 * left them there. Erring narrow costs an owner a brief under-populated
 * sidebar; erring wide showed everyone links they'd be refused.
 */
export function visibleNavItems(role: string): NavItem[] {
  const restricted = role !== 'owner' && role !== 'admin';
  return ADMIN_NAV_ITEMS.filter((item) => !restricted || item.salesVisible);
}

/**
 * Consecutive items sharing a heading, grouped.
 *
 * Deliberately meant to run on the *filtered* list rather than the full one: a
 * sales account sees none of Delivery, and a heading with nothing under it
 * reads as a section that failed to load.
 */
export function groupSections(items: NavItem[]): Array<{ section: string; items: NavItem[] }> {
  const groups: Array<{ section: string; items: NavItem[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}
