import { gateReached } from '@/lib/billing';

/**
 * When moving a project forward opens a payment gate.
 *
 * The contract ties each instalment to a moment both sides can see —
 * signing, Design Approval, Ready for Launch — and Section 7 says the second
 * and third are "invoiced on the day of approval". In practice that day used
 * to pass unmarked: somebody moved the project to Build, the money became
 * payable, and nothing anywhere said so. The dashboard's money panel counted
 * every future instalment on every project as one "scheduled" total, which
 * since every project gained a schedule is a number that means nothing.
 *
 * So this answers one question at the moment it matters: did that move just
 * make a payment due?
 *
 * IT INFERS, AND SAYS SO. The contract's gate is Design Approval, not "the
 * stage dropdown moved to Build". Those are usually the same event and
 * occasionally are not — a project can be moved forward for all sorts of
 * reasons. Rather than pretend the inference is a fact, the prompt states the
 * assumption it is making, quotes the clause behind it, and lets a person say
 * no. An assumption you can see is a very different thing from one buried in
 * a condition.
 *
 * And it never invoices on its own. Every path here ends at a button.
 */

/** The stage names, in the order a project passes through them. */
export const STAGE_NAMES = ['discovery', 'design', 'build', 'launch', 'complete'] as const;

/**
 * What the contract calls the moment this stage represents, and therefore
 * what we are claiming happened when somebody moves a project into it.
 */
export const STAGE_CLAIM: Record<string, string> = {
  build: 'Design Approval',
  launch: 'Ready for Launch',
};

/** Which instalment trigger a stage opens, if any. */
export const STAGE_OPENS_TRIGGER: Record<string, string> = {
  build: 'design-approval',
  launch: 'ready-for-launch',
};

export interface GateInstalment {
  id: string;
  index: number;
  label: string;
  amountCents: number;
  trigger: string;
  status: string;
}

export interface OpenedGate {
  instalmentId: string;
  index: number;
  label: string;
  amountCents: number;
  /** "Design Approval" — the contract's name for what we are claiming happened. */
  claim: string;
  /** The stage that was moved into. */
  stage: string;
  /** Which clause makes this payable, for the prompt to quote. */
  clause: string;
  clauseText: string;
}

export const CLAUSE_TEXT: Record<string, string> = {
  'design-approval':
    'Payment 2 is due on Design Approval, including deemed approval under Section 4. It is invoiced on the day of approval and payable within fourteen (14) days.',
  'ready-for-launch':
    'Payment 3 is due when the Project is Ready for Launch. It is invoiced at that point and payable within fourteen (14) days. Nothing goes live until it has cleared.',
};

/**
 * Did moving into this stage just make a payment invoiceable?
 *
 * Returns the instalment to send, or null. Null covers every ordinary case:
 * a stage with no gate behind it, a payment already invoiced or paid, a
 * project moving backwards, and a schedule that does not have that row.
 */
export function gateOpenedBy(
  stage: string,
  instalments: GateInstalment[]
): OpenedGate | null {
  const trigger = STAGE_OPENS_TRIGGER[stage];
  if (!trigger) return null;

  const row = instalments.find((i) => i.trigger === trigger);
  if (!row) return null;

  // Already invoiced or already settled — the moment has passed, and
  // prompting again would produce a second invoice for the same payment.
  if (row.status !== 'scheduled') return null;

  return {
    instalmentId: row.id,
    index: row.index,
    label: row.label,
    amountCents: row.amountCents,
    claim: STAGE_CLAIM[stage] ?? stage,
    stage,
    clause: 'Section 7',
    clauseText: CLAUSE_TEXT[trigger] ?? '',
  };
}

/**
 * Every payment across every project that is past its gate and has never been
 * invoiced.
 *
 * The dashboard's version of the same question, for the two failures a
 * one-off prompt cannot catch: the prompt somebody dismissed, and the stage
 * somebody else moved. Money nobody has asked for does not announce itself,
 * and it is the only kind of missing revenue that is entirely ours to fix.
 */
export interface UninvoicedPayment {
  projectId: string;
  projectName: string;
  company: string;
  instalmentId: string;
  label: string;
  amountCents: number;
  trigger: string;
  claim: string;
}

export function uninvoicedPayments(
  projects: Array<{
    id: string;
    name: string;
    statusStage: number;
    /** Set once the Section 4 review period is answered or has lapsed. */
    designApprovedAt?: Date | null;
    client: { company: string };
    instalments: GateInstalment[];
  }>
): UninvoicedPayment[] {
  const out: UninvoicedPayment[] = [];
  for (const project of projects) {
    for (const inst of project.instalments) {
      if (inst.status !== 'scheduled') continue;
      // A recorded design approval opens the second gate on its own, whatever
      // the stage says. That is the whole point of the review clock: a client
      // who never replied has approved the design under Section 4, and the
      // payment falls due without anybody moving a dropdown on their behalf.
      const openedByApproval = inst.trigger === 'design-approval' && Boolean(project.designApprovedAt);
      if (!openedByApproval && !gateReached(inst.trigger, project.statusStage)) continue;
      out.push({
        projectId: project.id,
        projectName: project.name,
        company: project.client.company,
        instalmentId: inst.id,
        label: inst.label,
        amountCents: inst.amountCents,
        trigger: inst.trigger,
        claim:
          inst.trigger === 'design-approval'
            ? 'Design Approval'
            : inst.trigger === 'ready-for-launch'
              ? 'Ready for Launch'
              : 'signing',
      });
    }
  }
  // Biggest first: if only one gets sent today, it should be the one that
  // matters most.
  return out.sort((a, b) => b.amountCents - a.amountCents);
}

/**
 * What the client is told when a project moves stage.
 *
 * What they got before was "Status changed to build" as a title and "Project
 * moved to the build phase." as the body — the software talking about itself.
 * A client reads that and learns nothing they did not already know from the
 * progress bar.
 *
 * These are defaults, not fixed text. The point is that sending stays one
 * click on a busy day while leaving room for the sentence that actually
 * mattered — "your logo files came in late so we started Tuesday" — which no
 * template can ever contain.
 */
export interface StageMessage {
  title: string;
  body: string;
}

export const STAGE_MESSAGES: Record<string, StageMessage> = {
  discovery: {
    title: "We're into Discovery",
    body: `We've started Discovery — working out exactly what your site needs to do, who it's for, and how the pieces fit together, before anyone designs anything.

This is the stage that decides everything after it, so it's the one where we'll ask you the most. If there's a decision only you can make — how something should work, what matters most to your customers, anything we could reasonably get wrong by guessing — we'll come to you rather than assume. You won't be left wondering what we decided on your behalf.

At the end of it you'll get a written summary to approve. That's what fixes the scope for the build, so it's worth reading properly.

Everything lives on your dashboard as it happens — updates, files, payments, and a place to message us directly. You'll get an email whenever anything changes, so nothing needs watching; the dashboard is simply there when you want the whole picture in one place.`,
  },
  design: {
    title: 'Design has started',
    body: `Discovery's done and we're designing — layouts, colour, type, and how the whole thing should feel to use.

You'll see a concept before a single line of code is written, and nothing goes into the build until you've approved how it looks. Where there's a genuine choice to make on look and feel, we'll bring it to you with a recommendation rather than quietly picking one; where it's a detail that doesn't change your experience of the site, we'll just handle it and keep you moving.

When the design is ready you'll get it to review, with a date to come back to us by. If we don't hear from you by then we'll take it as approved and start building, so nothing stalls on a message that never got sent.

It'll all be on your dashboard, and we'll email you the moment it's ready.`,
  },
  build: {
    title: "Design approved — we're building",
    body: `The design is signed off and we've started building it. This is usually the longest stretch of the project, and the quietest.

That quiet is deliberate. We'd rather come back to you when there's something real to click through than send updates that say "still building". If a decision comes up that changes how something works, or where two reasonable approaches would give you meaningfully different results, we'll stop and ask — you won't find out about it afterwards.

Your dashboard is the place to see where things stand, message us about anything at all, and pick up any files or invoices as they appear. We'll email you whenever there's something new, so you don't need to keep checking.`,
  },
  launch: {
    title: 'Ready for launch',
    body: `Everything's built and tested, and your site is ready to go live.

You can see the finished thing in full on the preview link — take your time with it. If something isn't right, now is exactly the moment to say so, and we'd far rather hear it now than after it's live. Small copy and image changes we'll simply do; anything that changes the shape of the build we'll talk through with you first so you know what it means.

The last step is going live, which we'll do as soon as everything's settled. It's on your dashboard along with everything else, and we'll email you when it's done.`,
  },
  complete: {
    title: "You're live",
    body: `Your site is live.

Everything we built is yours — the files, the credentials and the documentation all come with it, and they're on your dashboard to download whenever you need them. Your dashboard stays open: past invoices, everything we delivered, and a direct line to us are all still there.

If anything at all looks off, or you want a hand with something down the line, message us from the dashboard or just reply to any email from us. It's been a pleasure.`,
  },
};

export function stageMessage(stage: string): StageMessage {
  return (
    STAGE_MESSAGES[stage] ?? {
      title: `Moved to ${stage}`,
      body: `Your project has moved to the ${stage} stage.`,
    }
  );
}
