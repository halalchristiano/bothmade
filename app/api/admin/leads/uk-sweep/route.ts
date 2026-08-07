import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { forbiddenResponse, requireOwner, requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isUkLead, ukReason } from '@/lib/uk-leads';

/**
 * Clearing British leads out of an American book.
 *
 * They arrive from scrapes that wandered and directories with mixed listings,
 * and every one is a lead nobody will ever ring — taking up room in counts,
 * in the call sheet's ordering, and in a daily send budget that exists
 * because the account was once restricted for sending too much.
 *
 * There is no country filter anywhere in the admin, so until now there was no
 * way to find them, let alone remove them.
 *
 * ## Look before you delete
 *
 * GET lists what would go and why. POST removes them, and only after being
 * told how many the caller expects — so a sweep run against a book that
 * changed between the two, or a rule that turns out to match more than
 * somebody read, stops rather than taking the wrong hundred rows with it.
 *
 * Deleting a lead takes its whole history with it through the cascade. That
 * is not recoverable, which is why this is owner-only and why the count has
 * to match.
 */
const PREVIEW_ROWS = 200;

interface UkRow {
  id: string;
  company: string;
  phone: string | null;
  country: string | null;
  reason: 'country' | 'phone' | null;
}

/**
 * Every lead with a country or a phone number that says Britain.
 *
 * The test cannot be written as a Prisma `where` — a number is British by the
 * shape of its digits however it was punctuated, which is a rule about the
 * string and not a pattern the database can match. So the columns that could
 * possibly qualify are pulled and judged in one pass. Two columns across the
 * lead table is a cheap read; getting the rule wrong is not.
 */
async function findUkLeads(): Promise<UkRow[]> {
  const leads = await prisma.lead.findMany({
    select: { id: true, company: true, phone: true, country: true },
    orderBy: { company: 'asc' },
  });

  return leads
    .filter((l) => isUkLead(l))
    .map((l) => ({ ...l, reason: ukReason(l) }));
}

export async function GET() {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const matches = await findUkLeads();

    return NextResponse.json({
      success: true,
      count: matches.length,
      byCountry: matches.filter((m) => m.reason === 'country').length,
      byPhone: matches.filter((m) => m.reason === 'phone').length,
      // Capped, and the cap is reported, because a preview that silently
      // shows the first two hundred of four hundred is a preview somebody
      // would approve believing they had read all of it.
      leads: matches.slice(0, PREVIEW_ROWS),
      truncated: matches.length > PREVIEW_ROWS,
    });
  } catch (error) {
    console.error('UK sweep preview error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireStaff())) return unauthorizedResponse();
    // Same bar as the bulk delete this sits beside: removing leads and their
    // whole history is the most destructive thing the CRM can do.
    if (!(await requireOwner())) {
      return forbiddenResponse('Only an owner can delete leads in bulk.');
    }

    const { expectedCount } = await request.json().catch(() => ({}));
    if (typeof expectedCount !== 'number') {
      return NextResponse.json(
        { error: 'Load the preview first — this needs to know how many you are expecting.' },
        { status: 400 }
      );
    }

    const matches = await findUkLeads();

    /*
     * The number somebody read has to be the number that goes.
     *
     * Between loading the preview and pressing the button an import can land,
     * or a second person can be doing the same thing. Without this the button
     * means "delete whatever matches now", which is not what anybody thought
     * they were agreeing to.
     */
    if (matches.length !== expectedCount) {
      return NextResponse.json(
        {
          error: `The list changed — it now matches ${matches.length} leads, not ${expectedCount}. Reload the preview and look again.`,
          count: matches.length,
        },
        { status: 409 }
      );
    }

    if (matches.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    const { count } = await prisma.lead.deleteMany({
      where: { id: { in: matches.map((m) => m.id) } },
    });

    return NextResponse.json({ success: true, deleted: count });
  } catch (error) {
    console.error('UK sweep delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
