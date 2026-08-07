import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { resolveSiteUrl } from '@/lib/site-url';
import { placeBridgedCall, toE164, twilioConfig } from '@/lib/twilio';

/**
 * Places a call the phone network will report back on.
 *
 * Twilio rings the rep's own handset first; when they pick up it dials the
 * lead and joins the two. Backwards on paper and right for a phone in a
 * pocket — no app, no browser microphone, and the rep is already on the line
 * when the lead answers so nobody hears dead air.
 *
 * What this buys over the `tel:` link is the only thing that matters here:
 * afterwards, the network says whether the lead picked up and for how long.
 * That is a measurement rather than a self-report, and nothing anybody types
 * can move it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const config = twilioConfig();
    if (!config) {
      return NextResponse.json(
        {
          error:
            'Calling through the app is not set up on this deployment. Use the Dial button — it still records the attempt.',
          configured: false,
        },
        { status: 400 }
      );
    }

    const { leadId } = await params;

    const [lead, user] = await Promise.all([
      prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true, company: true, phone: true, doNotContact: true },
      }),
      prisma.user.findUnique({
        where: { id: session.userId },
        select: { callbackNumber: true },
      }),
    ]);

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    // The same hard stop every other outreach path checks. A do-not-contact
    // lead is one somebody asked us to leave alone, and a phone call is the
    // most intrusive way to ignore that.
    if (lead.doNotContact) {
      return NextResponse.json(
        { error: `${lead.company} asked not to be contacted. Nothing was dialled.` },
        { status: 400 }
      );
    }

    const to = toE164(lead.phone);
    if (!to) {
      return NextResponse.json(
        {
          error: lead.phone
            ? `${lead.phone} isn't a number the network will accept — check it on their page.`
            : 'No phone number on file for this lead.',
        },
        { status: 400 }
      );
    }

    /*
     * Where to ring the rep.
     *
     * Refused rather than guessed. There is no sensible default — dialling
     * the wrong handset means a stranger's phone rings and a lead hears a
     * confused hello — so an unset number is an error with the fix in it.
     */
    const agent = toE164(user?.callbackNumber);
    if (!agent) {
      return NextResponse.json(
        {
          error:
            "Add the phone number to ring you on, under Settings, and calls will come through the app. Until then use Dial.",
          needsCallbackNumber: true,
        },
        { status: 400 }
      );
    }

    const site = resolveSiteUrl();
    const placed = await placeBridgedCall({
      config,
      agentNumber: agent,
      // Both carry the lead id, because Twilio calls them minutes apart with
      // nothing of ours in between to remember it.
      answerUrl: `${site}/api/twilio/voice?leadId=${encodeURIComponent(leadId)}`,
      statusUrl: `${site}/api/twilio/status?leadId=${encodeURIComponent(leadId)}`,
    });

    /*
     * Written before anything rings.
     *
     * The webhooks arrive keyed on the SID and have to find a row waiting for
     * them. Creating it on the first webhook instead would lose every call
     * whose webhook was late, lost, or refused — and those are exactly the
     * calls somebody would later swear they made.
     */
    const call = await prisma.phoneCall.create({
      data: {
        leadId,
        placedById: session.userId,
        providerSid: placed.sid,
        toNumber: to,
        status: placed.status,
      },
      select: { id: true, status: true },
    });

    /*
     * And a dial on the timeline, the same as tapping the `tel:` link.
     *
     * Without this a call placed through the network would count as neither
     * dialled nor written up on the dashboard — the scoreboard reads dial
     * activities, and a network call that rings out writes no outcome. The
     * better route would have made somebody's day look emptier than the worse
     * one, which is precisely backwards.
     *
     * One definition of "a number was dialled", whichever way it was dialled.
     */
    await prisma.leadActivity
      .create({
        data: {
          leadId,
          type: 'dial',
          content: `Dialled ${to} through the app — the network reports back on this one.`,
          createdById: session.userId,
        },
      })
      .catch((err) => console.error('Could not log the dial:', err));

    return NextResponse.json(
      { success: true, callId: call.id, status: call.status, to },
      { status: 201 }
    );
  } catch (error) {
    console.error('Place call error:', error);
    return NextResponse.json(
      {
        // Twilio's own words where we have them: "The 'To' number is not a
        // valid phone number" names the fix, "the call failed" sends somebody
        // hunting.
        error: error instanceof Error ? error.message : "Couldn't place the call.",
      },
      { status: 502 }
    );
  }
}
