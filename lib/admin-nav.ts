import {
  Headset,
  BarChart3,
  Building2,
  FolderKanban,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  Palette,
  PenTool,
  Rocket,
  PhoneCall,
  Receipt,
  Settings,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * What's in the admin nav and how it's grouped.
 *
 * Every staff account sees all of it. There used to be a `salesVisible` flag
 * withholding Clients, Projects, Priorities, Mockups and Team from a sales
 * account, mirroring the `OPS` tier in lib/authz.ts; both came down at the
 * owner's request, so there is no longer a per-role list to compute.
 *
 * Kept out of the layout so the grouping rule can be tested without rendering
 * a page that fetches on mount: a section must never render a heading with
 * nothing under it.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Heading this sits under. Empty string means no heading above it. */
  section: string;
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
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, section: '' },

  // One Sales destination, not four. Pipeline, Who to call and Leads were
  // separate nav items pointing at three lenses on the same set of leads, and
  // Call HQ made a fourth. Nothing said which was the front door, so the
  // dashboard went unopened and the phone got picked up from memory instead.
  // The three lenses are now tabs inside /admin/sales; Call HQ keeps its own
  // entry because it is a mode you enter with a phone in your hand, not
  // another list to browse.
  { href: '/admin/sales', label: 'Sales', icon: KanbanSquare, section: 'Sales' },
  { href: '/admin/call', label: 'Call HQ', icon: Headset, section: 'Sales' },
  { href: '/admin/mockup-queue', label: 'Mockups', icon: Palette, section: 'Sales' },

  // Money after the sale, which is neither a lead nor a project, so it gets
  // its own heading rather than being filed under one of theirs. Visible to
  // sales because billing a customer for extra work is sales work, and the
  // page carries none of what Clients and Projects withhold — the customer
  // search needs a query, returns ten rows, and projects five fields.
  //
  // The recurring counterpart — signing a client onto a monthly care plan —
  // deliberately has no nav item. It's per-project and only makes sense with
  // a project in front of you, so it lives as a band across the top of
  // /admin/projects/[id] instead. Sales reaches it through the sidebar
  // search, which returns projects to every staff account.
  { href: '/admin/billing', label: 'Billing', icon: Receipt, section: 'One-off charges' },

  // The design conversation is a sequence — send it, wait, read what came
  // back, send the next one — and it had no screen. Where a project stood was
  // answerable only by opening it, so the expensive state (they answered, we
  // owe them the next round, their clock and the payment gate behind it have
  // both stopped) was the one nothing surfaced.
  { href: '/admin/design', label: 'Design', icon: PenTool, section: 'Delivery' },

  // The last mile, which had no screen either. Going live was one text box on
  // a project page holding the finished URL, so everything around it —
  // whether the DNS is reachable, whether the forms have been tested, whether
  // Payment 3 has cleared, when the warranty runs out — was carried in
  // somebody's head or not at all. It sits next to Design because it is the
  // same kind of thing: a stage with a sequence, that you want to see across
  // every project at once rather than one project at a time.
  { href: '/admin/deployment', label: 'Deployment', icon: Rocket, section: 'Delivery' },

  { href: '/admin/priorities', label: 'Priorities', icon: ListChecks, section: 'Delivery' },
  { href: '/admin/clients', label: 'Clients', icon: Building2, section: 'Delivery' },
  { href: '/admin/projects', label: 'Projects', icon: FolderKanban, section: 'Delivery' },

  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, section: 'Studio' },
  { href: '/admin/team-chat', label: 'Team Chat', icon: MessagesSquare, section: 'Studio' },
  { href: '/admin/team', label: 'Team', icon: UserCog, section: 'Studio' },
  { href: '/admin/settings', label: 'Settings', icon: Settings, section: 'Studio' },
];

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
