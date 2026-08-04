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
