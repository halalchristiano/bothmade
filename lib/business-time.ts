/**
 * Day, week, and month boundaries anchored to the studio's own timezone.
 *
 * Every period boundary in the admin app was built with `new Date(y, m, d)`
 * or `setHours(0,0,0,0)`, which uses the *server's* timezone. Vercel runs
 * in UTC. The studio does not.
 *
 * For a UK-based team that is an hour off in summer, so "revenue this
 * month" silently included the last hour of the previous month and excluded
 * the last hour of this one. For anywhere in the Americas it is far worse:
 * at UTC-5, "today" on the dashboard starts at 7pm the previous evening, so
 * calls logged after 7pm count toward tomorrow and the day's totals are
 * wrong every single evening — reliably, invisibly, and only for the hours
 * when someone is most likely to be checking.
 *
 * Set BUSINESS_TIMEZONE to an IANA name (e.g. "Europe/London",
 * "America/New_York"). Defaults to UTC, which is at least explicit.
 */

export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'UTC';

/**
 * The offset of a zone from UTC at a given instant, in minutes.
 *
 * Derived from Intl rather than hardcoded, so daylight saving is handled by
 * the same tables the rest of the platform uses — a fixed offset would be
 * wrong for half the year in exactly the places this matters most.
 */
function zoneOffsetMinutes(at: Date, timeZone: string): number {
  // formatToParts in the target zone gives us the local wall-clock reading;
  // the difference from the UTC reading of the same instant is the offset.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(at).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)])
  ) as Record<string, number>;

  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    // Intl renders midnight as hour 24 in some environments.
    parts.hour === 24 ? 0 : parts.hour,
    parts.minute,
    parts.second
  );
  return (asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000;
}

/** The wall-clock date in the business timezone, as {year, month, day}. */
export function businessDateParts(
  at: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(at)
    .split('-')
    .map(Number);
  return { year: parts[0], month: parts[1], day: parts[2] };
}

/**
 * The UTC instant at which a given local wall-clock time occurs.
 *
 * Two passes: the offset itself depends on the instant (it changes across a
 * DST boundary), so the first guess is corrected using the offset actually
 * in force at that guess.
 */
function utcFromLocal(
  year: number,
  month: number,
  day: number,
  timeZone: string
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = zoneOffsetMinutes(guess, timeZone);
  const corrected = new Date(guess.getTime() - offset * 60000);
  const offset2 = zoneOffsetMinutes(corrected, timeZone);
  return offset2 === offset ? corrected : new Date(guess.getTime() - offset2 * 60000);
}

/** Midnight today, in the business timezone. */
export function startOfBusinessDay(
  at: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE
): Date {
  const { year, month, day } = businessDateParts(at, timeZone);
  return utcFromLocal(year, month, day, timeZone);
}

/** Midnight on the 1st of the current month, in the business timezone. */
export function startOfBusinessMonth(
  at: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE
): Date {
  const { year, month } = businessDateParts(at, timeZone);
  return utcFromLocal(year, month, 1, timeZone);
}

/** Midnight `monthsAgo` months back, in the business timezone. */
export function startOfBusinessMonthOffset(
  monthsAgo: number,
  at: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE
): Date {
  const { year, month } = businessDateParts(at, timeZone);
  const target = new Date(Date.UTC(year, month - 1 - monthsAgo, 1));
  return utcFromLocal(target.getUTCFullYear(), target.getUTCMonth() + 1, 1, timeZone);
}

/** Midnight `days` days ago, in the business timezone. */
export function startOfBusinessDayOffset(
  days: number,
  at: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE
): Date {
  return new Date(startOfBusinessDay(at, timeZone).getTime() - days * 24 * 60 * 60 * 1000);
}
