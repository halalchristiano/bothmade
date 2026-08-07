import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readTwilioWebhook, twiml } from '@/lib/twilio-webhook';

/**
 * The first leg — the rep's own phone — reaching its end.
 *
 * Deliberately the lesser of the two webhooks. This says whether the REP
 * picked up, which they almost always do, so it proves nothing about the
 * lead. `/api/twilio/dialed` is where the verdict lives.
 *
 * It earns its place on the one case the other webhook cannot cover: a call
 * that never reached the dial at all. The rep's phone rang out, or the number
 * was refused, or they cancelled — and without this the row would sit at
 * "queued" for ever, reading as a call still in progress days later.
 */
export async function POST(request: NextRequest) {
  const { params, rejected } = await readTwilioWebhook(request);
  if (rejected) return new Response(rejected.reason, { status: rejected.status });

  const sid = params.CallSid;
  const status = params.CallStatus;

  if (sid && status) {
    /*
     * Only ever closes a call that never got started.
     *
     * By the time this arrives the dial webhook has usually already written
     * the real verdict, and overwriting "spoke for four minutes" with the
     * first leg's bland "completed" would throw away the only fact worth
     * having. So it touches nothing that has already ended.
     */
    await prisma.phoneCall
      .updateMany({
        where: { providerSid: sid, endedAt: null },
        data: {
          status,
          endedAt: new Date(),
          failureReason:
            status === 'completed'
              ? 'The call ended before it reached them.'
              : `Your phone did not connect (${status}).`,
        },
      })
      .catch((err) => console.error('[twilio] Could not close the call:', err));
  }

  return twiml('<Response/>');
}
