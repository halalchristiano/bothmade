import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * The open pixel on a cold email.
 *
 * One transparent pixel, served from our own domain, that records the fetch
 * and nothing else. Its value is separating the three situations that used to
 * look identical from the leads list: the email that never arrived, the one
 * that arrived and was ignored, and the one that has been opened six times by
 * somebody who has not written back. Those want three different responses and
 * were being given one. See lib/lead-opens.ts for what an open may honestly
 * be claimed to mean — the short version is that one open proves delivery and
 * repetition proves a person.
 *
 * WHAT IT DOES NOT DO. It carries no identity beyond the lead id, sets no
 * cookie, reads no headers, and goes only on the cold outreach we send. It
 * cannot tell anyone where a person is, what device they used, or who else
 * was on the thread.
 *
 * Always 200 with a valid image, whatever happens — a broken-image icon in a
 * cold email is a small signal to the recipient that they are being counted
 * and a large one that we cannot build an email properly. An unknown id is
 * therefore indistinguishable from a known one from the outside, which is
 * also correct: this endpoint must not become a way to ask whether we hold a
 * record for a given business.
 *
 * The write is best effort and never blocks the response.
 */

// 1x1 transparent GIF, the smallest thing that survives every mail client.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

function pixelResponse(): NextResponse {
  return new NextResponse(new Uint8Array(PIXEL), {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      // Gmail and friends cache proxied images hard. Without this the second
      // open of the same email never reaches us and every count is stuck at 1
      // — which is the exact number this feature exists to get past.
      'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Content-Disposition': 'inline',
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params;

    /**
     * One statement, deliberately.
     *
     * COALESCE keeps the FIRST open and lets the last one move. The reading
     * in lib/lead-opens.ts compares the first against the send time to tell a
     * privacy proxy's fetch-on-delivery from a person, and compares first
     * against last to tell whether anybody came back — so overwriting the
     * first would erase both judgements at once.
     *
     * Doing it in SQL also makes it atomic: two mail clients syncing the same
     * message at the same moment cannot both read a null and both claim to be
     * first, and neither can lose the other's increment.
     *
     * A raw UPDATE matching no rows is a no-op rather than an error, so a
     * crawled or mangled URL costs one query and no log noise.
     */
    await prisma.$executeRaw`
      UPDATE "leads"
         SET "coldEmailOpenedAt" = COALESCE("coldEmailOpenedAt", NOW()),
             "coldEmailLastOpenedAt" = NOW(),
             "coldEmailOpens" = "coldEmailOpens" + 1
       WHERE "id" = ${leadId}
         AND "coldEmailSentAt" IS NOT NULL
    `;
  } catch (error) {
    console.error('Lead open pixel failed:', error);
  }

  return pixelResponse();
}
