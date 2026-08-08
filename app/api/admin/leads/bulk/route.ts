import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus } from '@/lib/leads';

/**
 * Bulk-add a list of prospective companies at once — for when Evan has a
 * list of companies to work through rather than adding them one at a time.
 * Accepts either plain company names (one per line) or "Company, email"
 * pairs; every row becomes its own Lead at the given shared status.
 */

/**
 * How many rows one paste may create, and — this is the part that was
 * missing — a number the caller is told about.
 *
 * The cap was applied by a bare `.slice(0, 200)` and reported nowhere. Paste
 * a list of 250 companies and the response said "Added 200 companies", the
 * box emptied, and the last fifty were gone: not refused, not queued, not
 * named. The only way to notice was to count the board afterwards against a
 * list you no longer had, because the paste that held it had just been
 * cleared.
 *
 * The rest of this codebase already argues the case. DESIGN_QUEUE_LIMIT in
 * the design-queue route caps its query too, and exports the count beside
 * the rows precisely because "a cap the reader cannot see is a page that
 * quietly lies about being complete". A page lying about being complete is
 * bad; this was a form losing typed-in work and reporting success.
 *
 * Kept, because an unbounded write loop inside one transaction is its own
 * way to fail. Reported, so the leftovers can go back in the box.
 */
export const BULK_ADD_LIMIT = 200;

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const { lines, status } = await request.json();
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'Provide at least one line' }, { status: 400 });
    }
    if (status !== undefined && !isLeadStatus(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Typed first: `lines` is whatever arrived as JSON, and a number or an
    // object in the array used to reach `.trim()` and take the whole request
    // down as a 500. A row that is not a line is not a company.
    const submitted = lines
      .filter((line: unknown): line is string => typeof line === 'string')
      .map((line) => line.trim())
      .filter(Boolean);

    const taken = submitted.slice(0, BULK_ADD_LIMIT);
    const rows = taken
      .map((line) => {
        const parts = line.split(',').map((p) => p.trim());
        const company = parts[0];
        const email = parts[1]?.includes('@') ? parts[1] : undefined;
        return { company, email };
      })
      .filter((row) => row.company);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid company names found' }, { status: 400 });
    }

    const created = await prisma.$transaction(
      rows.map((row) =>
        prisma.lead.create({
          data: {
            company: row.company,
            email: row.email || null,
            status: status || undefined,
            assignedToId: session.userId,
          },
        })
      )
    );

    return NextResponse.json(
      {
        success: true,
        count: created.length,
        // What the cap left behind, and where the cap is. The caller needs
        // both to put the remainder back in front of somebody: the count on
        // its own cannot say which lines they were.
        skipped: submitted.length - taken.length,
        limit: BULK_ADD_LIMIT,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Bulk create leads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
