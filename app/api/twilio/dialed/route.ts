import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CALL_STATUS_WORDS, callWasAnswered } from '@/lib/twilio';
import { readTwilioWebhook, twiml } from '@/lib/twilio-webhook';

/**
 * The verdict. What the phone network says actually happened.
 *
 * Twilio posts here when the leg to the LEAD finishes, and this is the whole
 * reason calls are routed through a carrier at all: `DialCallStatus` and
 * `DialCallDuration` are facts. Nobody types them, nobody can edit them, and
 * they say what no self-report ever could — whether the person on the other
 * end picked up, and for how long.
 *
 * The status callback on the first leg is not this. That one describes the
 * rep's own phone, which answers every time and proves nothing.
 */
export async function POST(request: NextRequest) {
  const { params, rejected } = await readTwilioWebhook(request);
  if (rejected) return new Response(rejected.reason, { status: rejected.status });

  // The SID of the call we placed — the parent leg — which is the one the
  // row was written against when the call was started.
  const sid = params.CallSid;
  const status = params.DialCallStatus || 'completed';
  const rawDuration = Number(params.DialCallDuration);
  const duration = Number.isFinite(rawDuration) && rawDuration >= 0 ? Math.floor(rawDuration) : null;

  if (sid) {
    const answered = callWasAnswered(status, duration);
    const now = new Date();

    /*
     * updateMany, not update.
     *
     * Providers retry, and a retry must land on the row already written
     * rather than throwing on a SID this deployment has never seen — which
     * is what a webhook for somebody else's environment looks like. Matching
     * zero rows is a legitimate outcome here, not an error.
     */
    await prisma.phoneCall
      .updateMany({
        where: { providerSid: sid },
        data: {
          status,
          durationSeconds: duration,
          answeredAt: answered ? now : null,
          endedAt: now,
          failureReason: answered ? null : (CALL_STATUS_WORDS[status] ?? status),
        },
      })
      .catch((err) => console.error('[twilio] Could not record the call result:', err));

    /*
     * And on the lead's own timeline, in the words a person would use.
     *
     * The PhoneCall row is the record; this is the line somebody reads before
     * the next call. Written only for a call that connected, because "no
     * answer" is already visible as an attempt on the dial log and a timeline
     * full of unanswered rings buries the conversations that did happen.
     */
    const call = await prisma.phoneCall
      .findUnique({ where: { providerSid: sid }, select: { leadId: true, placedById: true } })
      .catch(() => null);

    if (call && answered && duration !== null) {
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      await prisma.leadActivity
        .create({
          data: {
            leadId: call.leadId,
            type: 'call',
            content: `Spoke to them for ${mins > 0 ? `${mins}m ` : ''}${secs}s — recorded by the phone network, not typed in.`,
            createdById: call.placedById,
          },
        })
        .catch((err) => console.error('[twilio] Could not log the connected call:', err));
    }
  }

  // Nothing more to say to the caller: the rep has hung up by now, and any
  // TwiML here would play to an empty line.
  return twiml('<Response/>');
}
