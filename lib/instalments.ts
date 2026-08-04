// The three-instalment engine: one place that knows how a project's price
// becomes three labelled payments, what state each is in, and what the email
// for each one says.
//
// The schedule itself (percentages, threshold, labels) lives in lib/pricing —
// this module owns the *rows*: seeding them when a project is born, marking
// them as money arrives, and answering "which payment is next" for every
// surface that asks. Nothing here talks to Stripe; the routes do that and
// hand the results back in.

import type { Instalment, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { amountPaidTowardProject } from '@/lib/billing';
import { formatCentsExact, instalmentSchedule } from '@/lib/pricing';

export type InstalmentStatus = 'scheduled' | 'due' | 'paid' | 'void';

/**
 * Seed the full schedule for a newly created project, marking as paid
 * whatever the first checkout already covered.
 *
 * A normal signing pays exactly the first instalment; a client who chose
 * pay-in-full covers all three at once. Anything in between (a manual
 * partial) marks whole instalments only — an instalment is either paid or it
 * isn't, because "Payment 2 of 3, 40% settled" is not a sentence anyone
 * wants to put on an invoice.
 */
export async function seedInstalments(
  tx: Prisma.TransactionClient,
  project: { id: string; totalPrice: number },
  paidCents: number,
  stripeSessionId: string | null
): Promise<void> {
  const schedule = instalmentSchedule(project.totalPrice);
  let remaining = paidCents;
  const now = new Date();

  for (const inst of schedule) {
    const covered = remaining >= inst.amountCents;
    if (covered) remaining -= inst.amountCents;
    await tx.instalment.create({
      data: {
        projectId: project.id,
        index: inst.index,
        count: inst.count,
        label: inst.label,
        percent: inst.percent,
        amountCents: inst.amountCents,
        trigger: inst.trigger,
        status: covered ? 'paid' : 'scheduled',
        paidAt: covered ? now : null,
        // Only the first instalment carries the signing session id — the
        // column is unique, and the id belongs to the payment that actually
        // moved the money, not to every row it happened to cover.
        stripeSessionId: covered && inst.index === 1 ? stripeSessionId : null,
      },
    });
  }
}

/** The project's schedule in order, or [] for pre-instalment projects. */
export async function instalmentsForProject(projectId: string): Promise<Instalment[]> {
  return prisma.instalment.findMany({
    where: { projectId },
    orderBy: { index: 'asc' },
  });
}

/**
 * The schedule a project that predates instalments should have had.
 *
 * Every project created before the schedule existed has zero rows, so the
 * payment panel renders nothing and the client dashboard falls back to the
 * old lump-balance flow. That is the honest reason the 40/30/30 work was
 * invisible on everything anyone actually owned: it only ever seeded at
 * checkout, so it only ever existed on deals closed after the migration.
 *
 * The subtlety is money already taken. A legacy project was billed 50/50,
 * so a $30,000 job has $15,000 paid against a new schedule whose first row
 * is $12,000 — and marking only whole rows paid would leave $3,000 sitting
 * inside a "Payment 2 of 3" the client would be invoiced in full for.
 *
 * So a part-paid project's first row is set to **exactly what has cleared**,
 * and the balance is split across the rest in the schedule's own
 * proportions. Nobody is billed twice for the same dollar, the rows still
 * sum to the contracted total, and each row's percent describes its own
 * amount rather than a template the money never followed.
 */
export function backfillSchedule(
  totalCents: number,
  paidCents: number
): Array<{
  index: number;
  count: number;
  label: string;
  percent: number;
  amountCents: number;
  trigger: string;
  paid: boolean;
}> {
  const template = instalmentSchedule(totalCents);
  const count = template.length;
  const pct = (cents: number) => (totalCents > 0 ? Math.round((cents / totalCents) * 100) : 0);

  // Nothing paid, or paid off entirely: the standard schedule describes it
  // exactly, and every row's status is the same.
  if (paidCents <= 0 || paidCents >= totalCents) {
    return template.map((row) => ({
      index: row.index,
      count: row.count,
      label: row.label,
      percent: row.percent,
      amountCents: row.amountCents,
      trigger: row.trigger,
      paid: paidCents >= totalCents,
    }));
  }

  // Part-paid. Row 1 is what cleared; the rest share what's left in the same
  // ratio the template gave them, with the last row taking the remainder so
  // the three still add up to the contracted price to the cent.
  const outstanding = totalCents - paidCents;
  const laterPercentTotal = template.slice(1).reduce((sum, row) => sum + row.percent, 0);
  let allocated = 0;

  return template.map((row, i) => {
    if (i === 0) {
      return {
        index: row.index,
        count,
        label: row.label,
        percent: pct(paidCents),
        amountCents: paidCents,
        trigger: row.trigger,
        paid: true,
      };
    }
    const amountCents =
      i === count - 1
        ? outstanding - allocated
        : Math.round((outstanding * row.percent) / laterPercentTotal);
    allocated += amountCents;
    return {
      index: row.index,
      count,
      label: row.label,
      percent: pct(amountCents),
      amountCents,
      trigger: row.trigger,
      paid: false,
    };
  });
}

/**
 * Give a legacy project the schedule it should have had, once, on first
 * sight. Idempotent by the unique (projectId, index): two tabs opening the
 * same project race into the same rows rather than two schedules.
 *
 * Returns the project's rows either way, so callers can treat this as
 * "fetch the schedule" and not think about which era the project is from.
 */
export async function ensureInstalments(projectId: string): Promise<Instalment[]> {
  const existing = await instalmentsForProject(projectId);
  if (existing.length > 0) return existing;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, totalPrice: true, payments: { select: { amount: true, type: true } } },
  });
  // A project with no price has no schedule to describe — three rows of $0
  // would be noise on the page and a $0 invoice waiting to be sent.
  if (!project || project.totalPrice <= 0) return [];

  const paidCents = amountPaidTowardProject(project.payments);
  const rows = backfillSchedule(project.totalPrice, paidCents);
  const now = new Date();

  try {
    await prisma.$transaction(
      rows.map((row) =>
        prisma.instalment.create({
          data: {
            projectId: project.id,
            index: row.index,
            count: row.count,
            label: row.label,
            percent: row.percent,
            amountCents: row.amountCents,
            trigger: row.trigger,
            status: row.paid ? 'paid' : 'scheduled',
            paidAt: row.paid ? now : null,
          },
        })
      )
    );
  } catch {
    // Lost the race, or the write failed. Either way the read below is the
    // truth — and a failed backfill must never take down the page that
    // triggered it.
  }

  return instalmentsForProject(projectId);
}

/**
 * The next instalment that can be sent or paid — the lowest-index row that
 * isn't settled. "due" beats "scheduled" only by already being on its way;
 * either is sendable, so the caller decides whether re-sending is polite.
 */
export function nextUnpaid(instalments: Instalment[]): Instalment | null {
  return instalments.find((i) => i.status === 'scheduled' || i.status === 'due') ?? null;
}

/** True once every instalment has settled — the "nothing owed" state. */
export function fullyPaid(instalments: Instalment[]): boolean {
  return instalments.length > 0 && instalments.every((i) => i.status === 'paid' || i.status === 'void');
}

/**
 * What each instalment's email says. Personalised per payment because the
 * three arrive at completely different moments in the relationship: the
 * second lands the day the client approved their design, the third the day
 * they were told the project is finished. A template that says "please find
 * attached invoice N" throws that context away.
 */
export function instalmentEmailCopy(
  inst: { index: number; count: number; label: string; amountCents: number },
  ctx: { company: string; contactName: string | null; projectName: string }
): { subject: string; title: string; eyebrow: string; bodyHtml: string; ctaLabel: string } {
  const amount = formatCentsExact(inst.amountCents);
  const name = ctx.contactName || 'there';
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  if (inst.index === 2) {
    return {
      subject: `Design approved — ${inst.label} for ${ctx.company} (${amount})`,
      eyebrow: inst.label,
      title: 'Your design is approved. Build starts on this payment.',
      bodyHtml: `
        <p>Hi ${esc(name)},</p>
        <p>Great milestone — the design for <strong style="color:#fff;">${esc(ctx.projectName)}</strong> is approved, exactly as you signed it off. That approval is the gate for <strong style="color:#fff;">${inst.label}</strong> of <strong style="color:#fff;">${amount}</strong>, as set out in your agreement.</p>
        <p>The invoice is attached, and the button below takes you to a secure Stripe checkout. Build begins as soon as it lands — we're ready when you are.</p>
        <p style="color:rgba(255,255,255,0.55);font-size:13px;">Payable within 14 days. One payment now remains after this one, invoiced when your project is ready to launch.</p>
      `,
      ctaLabel: `Pay ${inst.label} — ${amount}`,
    };
  }

  if (inst.index >= inst.count) {
    return {
      subject: `Ready to launch — final payment for ${ctx.company} (${amount})`,
      eyebrow: inst.label,
      title: 'Your project is finished and ready to go live.',
      bodyHtml: `
        <p>Hi ${esc(name)},</p>
        <p><strong style="color:#fff;">${esc(ctx.projectName)}</strong> is complete — built, revised, and tested, and you can see the finished product on your preview link right now. This is the moment the final payment falls due: <strong style="color:#fff;">${inst.label}</strong> of <strong style="color:#fff;">${amount}</strong>.</p>
        <p>The invoice is attached. As soon as it clears we launch: your site goes live, and everything — files, credentials, ownership — transfers to you in full.</p>
        <p style="color:rgba(255,255,255,0.55);font-size:13px;">Payable within 14 days. This is the last payment on your project.</p>
      `,
      ctaLabel: `Pay ${inst.label} — ${amount}`,
    };
  }

  // Payment 1 normally travels inside the sign-and-pay email; this copy
  // exists for the odd case where it's re-sent standalone.
  return {
    subject: `${inst.label} for ${ctx.company} (${amount})`,
    eyebrow: inst.label,
    title: 'The first payment on your project.',
    bodyHtml: `
      <p>Hi ${esc(name)},</p>
      <p>Here's <strong style="color:#fff;">${inst.label}</strong> of <strong style="color:#fff;">${amount}</strong> for <strong style="color:#fff;">${esc(ctx.projectName)}</strong> — the payment that gets your project scheduled and started.</p>
      <p>The invoice is attached, and the button below takes you to a secure Stripe checkout.</p>
    `,
    ctaLabel: `Pay ${inst.label} — ${amount}`,
  };
}

/** Fourteen days out, matching the contract's payment terms for 2 and 3. */
export function instalmentDueDate(from: Date = new Date()): Date {
  const due = new Date(from);
  due.setDate(due.getDate() + 14);
  return due;
}
