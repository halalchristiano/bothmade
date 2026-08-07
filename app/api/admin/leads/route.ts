import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { LEAD_EXPORT_SELECT } from '@/lib/lead-export';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus } from '@/lib/leads';
import type { Prisma } from '@prisma/client';

/**
 * Reads a DDMMYYYY filter bound. Separators are optional and ISO is accepted,
 * because a date typed into a box and a date pasted out of a spreadsheet
 * rarely look the same and both should work.
 *
 * `end` pushes the boundary to the last millisecond of the day, so "added
 * between 01082026 and 31082026" includes everything added on the 31st
 * rather than silently stopping at midnight that morning.
 */
function parseBoundary(raw: string | null, end = false): Date | null {
  if (!raw) return null;
  const value = raw.trim();
  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const dmy = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const packed = value.match(/^(\d{2})(\d{2})(\d{4})$/);

  let y: number, m: number, d: number;
  if (iso) [, y, m, d] = iso.map(Number) as [number, number, number, number];
  else if (dmy) [, d, m, y] = dmy.map(Number) as [number, number, number, number];
  else if (packed) [, d, m, y] = packed.map(Number) as [number, number, number, number];
  else return null;

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = end
    ? new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))
    : new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  return date.getUTCMonth() === m - 1 ? date : null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: Prisma.LeadWhereInput = {};
    if (status && isLeadStatus(status)) where.status = status;

    // "How many businesses did we add between these two dates" — answered off
    // addedAt rather than createdAt, so a sheet researched in July and
    // imported in August still counts as July's work.
    const from = parseBoundary(searchParams.get('addedFrom'));
    const to = parseBoundary(searchParams.get('addedTo'), true);
    if (from || to) {
      where.addedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }

    // Same question for the other end of the funnel: how many of them
    // actually became clients in a given window.
    const wonFrom = parseBoundary(searchParams.get('wonFrom'));
    const wonTo = parseBoundary(searchParams.get('wonTo'), true);
    if (wonFrom || wonTo) {
      where.clientTakenOnAt = { ...(wonFrom ? { gte: wonFrom } : {}), ...(wonTo ? { lte: wonTo } : {}) };
    }

    /*
     * The twenty-odd columns the board and the list actually render, out of
     * the hundred-and-four a Lead carries.
     *
     * This was an `include`, so every row came back whole and was then spread
     * into the response — the notes, the pain points, the address block, the
     * entire enrichment side (ratings, review counts, three social URLs), the
     * saved proposal JSON, the agreement statement. None of it is on either
     * screen. On a book of a few hundred leads that is a payload measured in
     * megabytes, sent again on every board open and every list filter, to
     * render a card with a company name and a value on it.
     *
     * `shareToken` is the one worth naming separately. It is the capability
     * secret for the public sign-and-pay page — the link that both shows a
     * prospect their proposal and lets them agree the contract — and it was
     * being handed to the browser for every lead in the book, on a screen
     * that has no use for it. The endpoint is staff-only, so this is not a
     * breach; it is a set of live signing keys sitting in a response body,
     * in devtools, and in any HAR a support conversation asks for. Selecting
     * fields explicitly is what stops the next column like it from joining
     * them silently.
     *
     * `proposalTotalPrice` is here despite being on neither screen: dealValue
     * below is computed from it.
     */
    const leads = await prisma.lead.findMany({
      where,
      select: {
        /*
         * The CSV's columns, owned by the export and spread in here.
         *
         * The list's export writes what is on screen, filters and all, from
         * the rows this endpoint returns — and narrowing the query to what
         * the board and the table *render* emptied thirteen of the file's
         * twenty-two columns: source, industry, city, state, company size,
         * employees, tags, both estimate bounds, the mockup and invoice
         * links, and the two dates the importer reads back.
         *
         * Nothing failed. The button still worked, the file still downloaded,
         * the headers were all still there — with nothing under them. An
         * export that silently loses columns is worse than one that errors,
         * because the file goes on to a spreadsheet and the gap is noticed
         * only by whoever needed the column.
         *
         * First in the object so the screen's own fields read as additions to
         * it, and so a column the export gains arrives here for free.
         */
        ...LEAD_EXPORT_SELECT,

        // What the board and the table render, on top of the above.
        id: true,
        proposalTotalPrice: true, // not rendered; dealValue is computed from it
        hotLead: true,
        qualifiedAt: true,
        painPoints: true,
        coldEmailDraft: true,
        coldEmailSentAt: true,
        personalizedObservation: true,
        emailDeliveryFailedAt: true,
        emailDeliveryFailedReason: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        // One row: the list shows "last activity" and nothing reads further back.
        activities: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    /**
     * What each deal is actually worth, as opposed to what somebody guessed
     * it might be worth.
     *
     * `estimatedValue` is a number typed into a box early on, and it is
     * routinely left blank. Summing it made the board's Won column read
     * $3,000 across three won deals when one of them alone had sold for
     * $12,700 — a column that under-reports revenue by 4x is worse than no
     * column, because it looks like an answer.
     *
     * So: what the client is actually being billed, if that is known; then
     * what was quoted; and only then the guess.
     */
    const converted = await prisma.project.findMany({
      where: { convertedFromLeadId: { in: leads.map((l) => l.id) } },
      select: { convertedFromLeadId: true, totalPrice: true },
    });
    const soldFor = new Map<string, number>();
    for (const p of converted) {
      if (p.convertedFromLeadId) soldFor.set(p.convertedFromLeadId, p.totalPrice);
    }

    /*
     * Written out rather than spread.
     *
     * `{ ...lead }` ships whatever the query happened to return, which makes
     * the `select` above the only thing standing between a column and the
     * browser. That is a guarantee held by a coincidence: the day somebody
     * selects one more field to compute something with, the spread publishes
     * it too, and nothing says so. Naming the response is what makes adding a
     * column to the query and adding it to the payload two separate decisions.
     *
     * `proposalTotalPrice` is the demonstration — selected because dealValue
     * is derived from it, and deliberately not sent.
     */
    const withValue = leads.map((lead) => ({
      id: lead.id,
      company: lead.company,
      contactName: lead.contactName,
      email: lead.email,
      phone: lead.phone,
      status: lead.status,
      estimatedValue: lead.estimatedValue,
      hotLead: lead.hotLead,
      qualifiedAt: lead.qualifiedAt,
      painPoints: lead.painPoints,
      doNotContact: lead.doNotContact,
      coldEmailDraft: lead.coldEmailDraft,
      coldEmailSentAt: lead.coldEmailSentAt,
      personalizedObservation: lead.personalizedObservation,
      emailDeliveryFailedAt: lead.emailDeliveryFailedAt,
      emailDeliveryFailedReason: lead.emailDeliveryFailedReason,
      updatedAt: lead.updatedAt,
      assignedTo: lead.assignedTo,
      activities: lead.activities,

      // The export's columns, carried through. Rendered nowhere; the CSV is
      // built in the browser from exactly these rows.
      estimateLowCents: lead.estimateLowCents,
      estimateHighCents: lead.estimateHighCents,
      source: lead.source,
      industry: lead.industry,
      city: lead.city,
      region: lead.region,
      companySize: lead.companySize,
      employeeCount: lead.employeeCount,
      tags: lead.tags,
      mockupUrl: lead.mockupUrl,
      invoicePdfUrl: lead.invoicePdfUrl,
      addedAt: lead.addedAt,
      clientTakenOnAt: lead.clientTakenOnAt,
      dealValue: soldFor.get(lead.id) ?? lead.proposalTotalPrice ?? lead.estimatedValue ?? null,
      /** True when dealValue is a real figure rather than somebody's estimate. */
      dealValueIsFirm: soldFor.has(lead.id) || Boolean(lead.proposalTotalPrice),
    }));

    return NextResponse.json({ success: true, leads: withValue, count: withValue.length }, { status: 200 });
  } catch (error) {
    console.error('Get leads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }

    const { company, contactName, email, phone, source, estimatedValue, painPoints, notes, status } =
      await request.json();

    if (!company) {
      return NextResponse.json({ error: 'Company is required' }, { status: 400 });
    }

    let lostReason: string | undefined;
    if (status !== undefined && !isLeadStatus(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (status === 'lost' && typeof notes === 'string' && notes.trim()) {
      lostReason = notes.trim();
    }

    const lead = await prisma.lead.create({
      data: {
        company,
        contactName: contactName || null,
        email: email || null,
        phone: phone || null,
        source: source || null,
        estimatedValue: typeof estimatedValue === 'number' ? estimatedValue : null,
        painPoints: Array.isArray(painPoints) ? painPoints.join(',') : '',
        notes: notes || null,
        status: status || undefined,
        lostReason,
        assignedToId: session.userId,
      },
    });

    return NextResponse.json({ success: true, lead }, { status: 201 });
  } catch (error) {
    console.error('Create lead error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
