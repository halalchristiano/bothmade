import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * The open pixel on an invoice email.
 *
 * One transparent pixel, served from our own domain, that records the fetch
 * and nothing else. Its whole value is separating "this invoice never landed"
 * from "it landed and they haven't paid" — two situations that were
 * indistinguishable from the dashboard and that want opposite responses. See
 * lib/invoice-delivery.ts for what an open can and cannot be claimed to mean.
 *
 * WHAT IT DOES NOT DO. It carries no identity beyond the instalment id, sets
 * no cookie, and is served only on invoice emails — the money ones the client
 * asked us to send. It is not on the newsletter, the welcome email, or
 * anything a client can't already see the record of in their own dashboard.
 *
 * Always 200 with a valid image, whatever happens. A broken image icon in an
 * invoice email is a small signal to the client that they are being watched,
 * and a large one that we cannot build an email properly — and neither is
 * worth a byte of analytics. An unknown id is therefore indistinguishable
 * from a known one from the outside, which is also the right answer: this
 * endpoint should not be a way to ask whether an invoice exists.
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
      // open of the same email never reaches us and every count is 1.
      'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Content-Disposition': 'inline',
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instalmentId: string }> }
) {
  try {
    const { instalmentId } = await params;

    /**
     * One statement, deliberately.
     *
     * COALESCE keeps the FIRST open rather than the latest — the reading in
     * lib/invoice-delivery.ts compares it against the send time to tell a
     * privacy proxy's fetch-on-delivery from a person, and the last open
     * would make every invoice look machine-opened forever. Doing it in SQL
     * also makes it atomic: two mail clients syncing the same message at once
     * cannot both read a null and both claim to be first.
     *
     * A raw UPDATE matching no rows is a no-op rather than an error, so a
     * crawled or mangled URL costs one query and no log noise.
     */
    await prisma.$executeRaw`
      UPDATE "instalments"
         SET "emailOpenedAt" = COALESCE("emailOpenedAt", NOW()),
             "emailOpens" = "emailOpens" + 1
       WHERE "id" = ${instalmentId}
    `;
  } catch (error) {
    console.error('Open pixel failed:', error);
  }

  return pixelResponse();
}
