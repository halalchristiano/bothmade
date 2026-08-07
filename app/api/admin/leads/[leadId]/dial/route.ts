import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';

/**
 * Records that a number was dialled, at the moment it is dialled.
 *
 * ## Why this exists
 *
 * Every other entry in a lead's history is somebody's account of what
 * happened. Somebody rings twelve businesses, comes back, and tells the
 * system about three — not out of dishonesty, usually, but because logging is
 * admin done between calls and the afternoon runs out. Either way the number
 * on the dashboard was a self-report, and a self-report is not a measurement.
 *
 * This one is a measurement. The browser fires it as the `tel:` link is
 * tapped, before the phone app takes the screen. Nobody presses anything and
 * nobody can skip it, so "how many numbers were dialled today" stops being a
 * question anybody has to be asked.
 *
 * ## What it honestly is, and is not
 *
 * It is proof a number was dialled from this app. It is NOT proof a call
 * connected, that anybody answered, or how long it lasted — the browser hands
 * off to the operating system and never hears another word about it. A dial
 * that rang out and a twenty-minute conversation look identical here.
 *
 * Closing that last gap needs the call routed through a telephony provider
 * (Twilio and the like), which is a different shape of thing entirely: a
 * paid number, calls going out through it rather than the handset, and a
 * webhook reporting `completed` / `no-answer` / `busy` with a duration. The
 * outcome the rep taps afterwards is what stands in for it until then — and
 * the useful part is that the two numbers can now be compared. Twenty dials
 * and three outcomes is a visible gap; before, it was invisible.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { leadId } = await params;

    /*
     * Deduplicated within a couple of minutes.
     *
     * A `tel:` link gets tapped twice constantly — the call fails to start,
     * the browser comes back, the thumb lands again. Those are one attempt to
     * reach a business, and counting them as two would inflate exactly the
     * number that exists to be trustworthy.
     */
    const since = new Date(Date.now() - 2 * 60 * 1000);
    const recent = await prisma.leadActivity.findFirst({
      where: { leadId, type: 'dial', createdById: session.userId, createdAt: { gte: since } },
      select: { id: true },
    });

    if (recent) {
      return NextResponse.json({ success: true, recorded: false, reason: 'duplicate' });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, phone: true },
    });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    await prisma.leadActivity.create({
      data: {
        leadId,
        type: 'dial',
        // The number as it stood when it was dialled. If somebody corrects a
        // wrong number later, the record still says which one was actually
        // rung, which is the only version worth keeping.
        content: `Dialled ${lead.phone ?? 'a number that is no longer on file'}.`,
        createdById: session.userId,
      },
    });

    /*
     * Not touching `updatedAt` on the lead.
     *
     * A dial is not progress on the deal, and the stale-lead digest reads
     * `updatedAt` to find work nobody has moved. Tapping a number that rings
     * out would otherwise mark the lead as freshly worked and hide it from
     * the one report built to surface neglect.
     */
    return NextResponse.json({ success: true, recorded: true }, { status: 201 });
  } catch (error) {
    console.error('Dial log error:', error);
    // Deliberately not a 500 the caller has to handle. This fires as the
    // screen is being taken over by the phone app; there is nobody left to
    // show an error to, and a failed measurement must never look like a
    // failed call.
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
