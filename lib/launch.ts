/**
 * Putting a project live.
 *
 * This was one text box. You typed the finished URL into it, an email went
 * out, and confetti appeared on the client's dashboard. Everything else the
 * contract says about the moment happened in somebody's head:
 *
 *   §1  "Ready for Launch" means the Project is complete on the Preview
 *       Environment and "the Agency has confirmed in writing through the
 *       dashboard that it is ready to go live." There was no way to confirm
 *       it, so the phrase named a state nothing could be in.
 *
 *   §7  "Nothing goes live, no files or source transfer, no credentials hand
 *       over, and no intellectual property assigns until it has cleared."
 *       Nothing checked whether Payment 3 had.
 *
 *   Exhibit A  Launch includes "handover of credentials, source, and
 *       documentation included in scope; commencement of the Warranty
 *       Period." Neither was recorded.
 *
 *   §16 Thirty days from final delivery. The launch email has been telling
 *       clients the warranty starts today against nothing that knew when it
 *       ended — so the one date a client might need to rely on existed only
 *       in a sentence we sent them.
 *
 * The checks below are the other half: the things that make a launch fail in
 * practice. A form that posts into a void, a redirect nobody set, a domain
 * whose DNS is inside an account the last developer still owns. None of them
 * are hard; all of them are things you remember at eleven at night.
 */

/** How the domain is reachable, which is the launch's usual point of failure. */
export const DOMAIN_ACCESS = [
  { value: 'we-control', label: 'We control it', tone: 'good' as const },
  { value: 'client-controls', label: 'The client controls it', tone: 'ok' as const },
  { value: 'old-developer', label: 'Their old developer has it', tone: 'bad' as const },
  { value: 'none', label: 'They do not have one yet', tone: 'bad' as const },
  { value: 'unknown', label: 'Nobody has checked', tone: 'bad' as const },
];

export function domainAccessLabel(value: string | null | undefined): string {
  return DOMAIN_ACCESS.find((d) => d.value === value)?.label ?? 'Nobody has checked';
}

export interface LaunchCheck {
  key: string;
  group: string;
  label: string;
  /** What it means in practice, for whoever is ticking it at eleven at night. */
  hint: string;
  /**
   * Whether launching without it is a mistake rather than a preference.
   *
   * Blocking checks do not disable the button — a launch that has to happen
   * happens, and a system that refuses is a system people work around. They
   * are named on the way past instead, which is the version somebody reads.
   */
  blocking: boolean;
}

export const LAUNCH_CHECKS: LaunchCheck[] = [
  {
    key: 'domain-reachable',
    group: 'The domain',
    label: 'We can get into the DNS',
    hint: 'Logged in and looked, not told over the phone that we can. This is the one that turns a launch into a fortnight of waiting on somebody else\'s IT company.',
    blocking: true,
  },
  {
    key: 'dns-ready',
    group: 'The domain',
    label: 'Records prepared and TTL lowered',
    hint: 'A and CNAME pointed at the new host, TTL dropped a day beforehand so the cutover is minutes rather than the rest of the day.',
    blocking: true,
  },
  {
    key: 'ssl',
    group: 'The domain',
    label: 'Certificate issued, HTTPS forced',
    hint: 'And the www / non-www pair both resolve. A browser warning on day one undoes the whole thing.',
    blocking: true,
  },
  {
    key: 'redirects',
    group: 'The domain',
    label: 'Old URLs redirected',
    hint: 'Every page that ranked or was ever linked to lands somewhere sensible. A replacement site that 404s its own history is how a business loses the search traffic it already had.',
    blocking: false,
  },

  {
    key: 'content-final',
    group: 'Before it goes out',
    label: 'Final content, no placeholders',
    hint: 'No lorem, no stock photo standing in for theirs, no "Coming soon" on a page in the navigation.',
    blocking: true,
  },
  {
    key: 'forms',
    group: 'Before it goes out',
    label: 'Every form tested end to end',
    hint: 'Submitted for real, and the enquiry arrived in the inbox they asked for. A form posting into a void is the single most expensive launch bug there is.',
    blocking: true,
  },
  {
    key: 'devices',
    group: 'Before it goes out',
    label: 'Checked on a phone, tablet and desktop',
    hint: 'On a real phone. Most of their customers will never see it any other way.',
    blocking: true,
  },
  {
    key: 'analytics',
    group: 'Before it goes out',
    label: 'Analytics connected',
    hint: 'And the Google Business Profile pointed at the new address, if they have one.',
    blocking: false,
  },
  {
    key: 'seo',
    group: 'Before it goes out',
    label: 'Titles, descriptions, sitemap — and indexing allowed',
    hint: 'Including taking off the noindex that kept the preview out of search. Launching with it still on is invisible and stays invisible.',
    blocking: true,
  },
  {
    key: 'performance',
    group: 'Before it goes out',
    label: 'Performance and accessibility pass',
    hint: 'Images sized, fonts loading properly, contrast and labels good enough to stand behind.',
    blocking: false,
  },
  {
    key: 'backup',
    group: 'Before it goes out',
    label: 'The old site kept somewhere',
    hint: 'A copy of what was there before. Nobody ever wants it until the week somebody asks for a page that used to exist.',
    blocking: false,
  },

  {
    key: 'handover-pack',
    group: 'Handing it over',
    label: 'Credentials, source and documentation ready',
    hint: 'Exhibit A puts these in the Launch phase. Ready to send — Section 7 holds the actual transfer until Payment 3 clears.',
    blocking: false,
  },
  {
    key: 'client-walkthrough',
    group: 'Handing it over',
    label: 'Client shown how to use it',
    hint: 'A call or a recording. A site nobody on their side can edit becomes our support queue by the second month.',
    blocking: false,
  },
];

export const LAUNCH_GROUPS = Array.from(new Set(LAUNCH_CHECKS.map((c) => c.group)));

/** What one check knows about itself once somebody has ticked it. */
export interface LaunchCheckState {
  done: boolean;
  at?: string;
  by?: string;
  note?: string;
}

export type LaunchChecklist = Record<string, LaunchCheckState>;

/**
 * Read the stored blob, keeping only keys that are still real checks.
 *
 * The list lives in code, so a check that gets renamed leaves an orphan
 * behind. Dropping it here means a removed check cannot go on counting
 * towards a percentage nobody can see the source of.
 */
export function readChecklist(raw: unknown): LaunchChecklist {
  const out: LaunchChecklist = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  const known = new Set(LAUNCH_CHECKS.map((c) => c.key));
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(key)) continue;
    if (typeof value !== 'object' || value === null) continue;
    const v = value as Record<string, unknown>;
    out[key] = {
      done: v.done === true,
      at: typeof v.at === 'string' ? v.at : undefined,
      by: typeof v.by === 'string' ? v.by : undefined,
      note: typeof v.note === 'string' ? v.note.slice(0, 500) : undefined,
    };
  }
  return out;
}

export interface LaunchBlocker {
  /** The check's key, or a synthetic one for a blocker nothing can tick. */
  key: string;
  label: string;
  /** Why this stops a launch, in the contract's terms where it has them. */
  reason: string;
}

export interface LaunchReadiness {
  done: number;
  total: number;
  /** 0-100, for a progress ring. */
  percent: number;
  /** Everything unticked that matters, plus the gates nobody ticks. */
  blockers: LaunchBlocker[];
  /** Unticked, but not a reason to stop. */
  optionalLeft: string[];
  /** Nothing blocking is left. */
  ready: boolean;
  /** One line for a card: "2 things left before this can go live". */
  line: string;
}

export interface LaunchContext {
  /** Section 7: nothing goes live until the final instalment clears. */
  finalInstalmentPaid: boolean;
  /** Whether an instalment schedule exists to judge that against at all. */
  hasSchedule?: boolean;
  /** So a project with no domain recorded is not silently treated as fine. */
  domainName?: string | null;
}

/**
 * What is left before this can go live.
 *
 * Payment is computed rather than ticked. It is the one gate the system
 * already knows the answer to, and a checkbox saying "Payment 3 has cleared"
 * is a checkbox somebody eventually ticks optimistically on a Friday.
 */
export function launchReadiness(
  checklist: LaunchChecklist,
  context: LaunchContext
): LaunchReadiness {
  /*
   * The ring counts the gates nobody ticks, not just the boxes.
   *
   * `percent` used to be done-over-LAUNCH_CHECKS while `ready` also depended
   * on two things that are not checks at all: whether the final instalment
   * has cleared, and whether a domain has been recorded. So a project with
   * every box ticked and Payment 3 outstanding drew a full ring and could not
   * go live — and the ring is the number people scan on the board, in a lane
   * headed "clear to go live right now".
   *
   * Counting the gates makes 100% mean what a full ring should mean: nothing
   * left in the way. See the invariant pinned in tests/lib/launch-readiness —
   * percent === 100 implies ready.
   */
  const paymentGateApplies = context.hasSchedule !== false;
  const paymentGateCleared = context.finalInstalmentPaid;
  const domainRecorded = Boolean(context.domainName?.trim());

  const total = LAUNCH_CHECKS.length + (paymentGateApplies ? 1 : 0) + 1;
  const done =
    LAUNCH_CHECKS.filter((c) => checklist[c.key]?.done).length +
    (paymentGateApplies && paymentGateCleared ? 1 : 0) +
    (domainRecorded ? 1 : 0);

  const blockers: LaunchBlocker[] = LAUNCH_CHECKS.filter(
    (c) => c.blocking && !checklist[c.key]?.done
  ).map((c) => ({ key: c.key, label: c.label, reason: c.hint }));

  if (paymentGateApplies && !paymentGateCleared) {
    blockers.unshift({
      key: 'payment-3',
      label: 'The final payment has not cleared',
      reason:
        'Section 7: nothing goes live, no files or source transfer, no credentials hand over, and no intellectual property assigns until it has cleared. The finished site stays visible on the preview environment in the meantime — that is the arrangement both sides signed.',
    });
  }

  if (!domainRecorded) {
    blockers.push({
      key: 'domain-name',
      label: 'No domain recorded',
      reason:
        'Nothing here says what address this is going live on, so nobody can check the DNS in advance — which is where a launch usually goes wrong.',
    });
  }

  const optionalLeft = LAUNCH_CHECKS.filter(
    (c) => !c.blocking && !checklist[c.key]?.done
  ).map((c) => c.label);

  const ready = blockers.length === 0;

  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    blockers,
    optionalLeft,
    ready,
    line: ready
      ? optionalLeft.length === 0
        ? 'Everything is done. This can go live.'
        : `Ready to go live — ${optionalLeft.length} optional ${
            optionalLeft.length === 1 ? 'thing' : 'things'
          } still open.`
      : `${blockers.length} thing${blockers.length === 1 ? '' : 's'} in the way.`,
  };
}

/** Section 16's thirty days, from the day it went live. */
export const WARRANTY_DAYS = 30;

export function warrantyEndFrom(launchedAt: Date): Date {
  const end = new Date(launchedAt);
  end.setDate(end.getDate() + WARRANTY_DAYS);
  return end;
}

export interface WarrantyState {
  active: boolean;
  daysLeft: number;
  endsAt: Date | null;
  /** Written for the client, who has not read Section 16. */
  clientLine: string;
}

export function warrantyState(
  endsAt: Date | string | null | undefined,
  now: Date = new Date()
): WarrantyState {
  if (!endsAt) {
    return {
      active: false,
      daysLeft: 0,
      endsAt: null,
      clientLine: 'Your warranty starts the day the site goes live.',
    };
  }
  const end = new Date(endsAt);
  const msLeft = end.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / 86_400_000);

  if (daysLeft <= 0) {
    return {
      active: false,
      daysLeft: 0,
      endsAt: end,
      clientLine: `The ${WARRANTY_DAYS}-day warranty ran to ${end.toLocaleDateString()}. Anything that stops working now is support rather than a fix — tell us either way and we will say which it is.`,
    };
  }

  return {
    active: true,
    daysLeft,
    endsAt: end,
    clientLine:
      daysLeft === 1
        ? 'Last day of your warranty. Anything not working as agreed is put right at no charge — today is the day to say so.'
        : `${daysLeft} days of warranty left, to ${end.toLocaleDateString()}. Anything not working the way it was agreed gets put right at no charge — just tell us.`,
  };
}

/**
 * Where a project is on the launch board.
 *
 * Three lanes rather than a list, because the question the board answers is
 * "what can I ship today" and a flat list of everything in Build does not
 * answer it.
 */
export type LaunchLane = 'preparing' | 'ready' | 'live';

export function launchLane(project: {
  liveUrl?: string | null;
  readyForLaunchAt?: Date | string | null;
}): LaunchLane {
  if (project.liveUrl) return 'live';
  if (project.readyForLaunchAt) return 'ready';
  return 'preparing';
}

export const LANE_COPY: Record<LaunchLane, { title: string; blurb: string }> = {
  preparing: {
    title: 'Getting ready',
    blurb: 'Built, being checked. Nothing here has been confirmed ready to go live.',
  },
  ready: {
    title: 'Ready for launch',
    blurb:
      'Confirmed in writing, which is what Section 1 means by the phrase — and what makes Payment 3 due.',
  },
  live: { title: 'Live', blurb: 'Shipped. The warranty clock is running on these.' },
};
