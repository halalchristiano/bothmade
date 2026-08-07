import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveSiteUrl } from '@/lib/site-url';
import { toE164, twilioConfig } from '@/lib/twilio';
import { escXml, readTwilioWebhook, twiml } from '@/lib/twilio-webhook';

/**
 * What the rep hears when they pick up: the lead's phone, ringing.
 *
 * Twilio fetches this at the moment the rep answers — not when the call was
 * placed — and does whatever it says. Which is why the signature check
 * matters more here than anywhere else in the app: this endpoint answers with
 * an instruction to dial a number, and an unverified one could be made to
 * ring anywhere on earth at our expense.
 *
 * The lead is looked up again rather than passed in the URL. A number in a
 * query string is a number an attacker can change; an id is only a key to a
 * row we control.
 */
export async function POST(request: NextRequest) {
  const { rejected } = await readTwilioWebhook(request);
  if (rejected) {
    // Said out loud to the carrier rather than silently hung up, because a
    // rep hearing dead air needs somebody to be able to find out why.
    return new Response(rejected.reason, { status: rejected.status });
  }

  const leadId = new URL(request.url).searchParams.get('leadId');
  const config = twilioConfig();

  const lead = leadId
    ? await prisma.lead
        .findUnique({
          where: { id: leadId },
          select: { company: true, phone: true, doNotContact: true },
        })
        .catch(() => null)
    : null;

  const to = lead && !lead.doNotContact ? toE164(lead.phone) : null;

  if (!to || !config) {
    /*
     * Spoken, not silent.
     *
     * The rep has a phone to their ear at this exact moment. A hang-up with
     * no explanation is indistinguishable from a broken network, and they
     * will simply try again — repeatedly, at cost. One sentence ends it.
     */
    return twiml(
      '<Response><Say voice="alice">That lead has no number we can dial. Nothing was called.</Say></Response>'
    );
  }

  const site = resolveSiteUrl().replace(/\/$/, '');

  /*
   * `action` is the whole point of the exercise.
   *
   * Twilio posts to it when this dial finishes and tells us what happened to
   * the SECOND leg — whether the LEAD answered, and for how long. The status
   * callback on the first leg only ever describes the rep's own phone, which
   * answers every time and proves nothing.
   */
  return twiml(
    `<Response>` +
      `<Dial action="${escXml(`${site}/api/twilio/dialed?leadId=${encodeURIComponent(leadId ?? '')}`)}" ` +
      `method="POST" callerId="${escXml(config.fromNumber)}" timeout="20" answerOnBridge="true">` +
      `${escXml(to)}` +
      `</Dial>` +
      `</Response>`
  );
}
