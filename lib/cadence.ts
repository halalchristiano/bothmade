import { prisma } from '@/lib/prisma';

/**
 * The follow-up cadence: what happens after an email gets no reply.
 *
 * The templates for a multi-touch sequence (followup_1/2/3) have existed
 * all along — what was missing was the clock. Nothing scheduled the next
 * touch, so a cold email that got no reply just sat there unless the rep
 * remembered to set a follow-up date by hand, and the leads that slipped
 * were exactly the ones nobody remembered.
 *
 * Deliberately assistive, not autopilot: this schedules the touch and
 * names the template, and the existing surfaces (call list, follow-up
 * digest, composer) put it in front of a human. It never sends by itself —
 * the whole codebase has a preview-before-send ethos
 * (User.previewBeforeBulkSend), and a sequence mailer that fires unreviewed
 * emails at prospects would cut straight against it.
 */

export interface CadenceStep {
  /** Days after the previous touch. */
  afterDays: number;
  /** Which EMAIL_TEMPLATES id the composer should suggest. */
  templateId: string;
  label: string;
}

export const OUTREACH_CADENCE: CadenceStep[] = [
  { afterDays: 3, templateId: 'followup_1', label: 'Gentle bump' },
  { afterDays: 4, templateId: 'followup_2', label: 'Add value / new angle' },
  { afterDays: 7, templateId: 'followup_3', label: 'Break-up note' },
];

/**
 * Which step of the cadence a lead is on, counted from logged outreach
 * emails. Step 0 = one email sent, next touch is the gentle bump.
 */
export function cadenceStepFor(outreachEmailsSent: number): CadenceStep | null {
  if (outreachEmailsSent <= 0) return null;
  return OUTREACH_CADENCE[Math.min(outreachEmailsSent - 1, OUTREACH_CADENCE.length - 1)] ?? null;
}

function addDays(from: Date, days: number): Date {
  const d = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  // Land follow-ups on a weekday: a touch due Saturday surfaces Monday
  // anyway, but it surfaces *late* rather than on time.
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() + 2); // Sat -> Mon
  if (day === 0) d.setDate(d.getDate() + 1); // Sun -> Mon
  return d;
}

/**
 * Schedules the next cadence touch after an outreach email went out.
 *
 * Respects a human's own plan: if the rep has already set a follow-up date,
 * it is theirs and this never moves it. Clears itself out of the picture
 * once the lead replies — the cadence is for silence, and a conversation
 * has its own rhythm.
 *
 * Best-effort: scheduling must never be the reason a send reports failure.
 */
export async function scheduleNextTouch(leadId: string): Promise<void> {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { nextFollowUpAt: true, replyReceivedAt: true, status: true },
    });
    if (!lead) return;
    if (lead.replyReceivedAt) return; // they're talking — no cadence
    if (lead.status === 'won' || lead.status === 'lost') return;
    if (lead.nextFollowUpAt && lead.nextFollowUpAt > new Date()) return; // rep's own plan wins

    const sent = await prisma.leadActivity.count({
      where: { leadId, type: 'email' },
    });
    const step = cadenceStepFor(sent);
    if (!step) return;

    await prisma.lead.update({
      where: { id: leadId },
      data: { nextFollowUpAt: addDays(new Date(), step.afterDays) },
    });
  } catch (error) {
    console.error('Failed to schedule cadence touch:', leadId, error);
  }
}
