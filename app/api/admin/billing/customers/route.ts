import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';

/**
 * The customer picker behind a custom charge — search by company, contact or
 * email, get back the projects a charge can be raised against.
 *
 * Open to sales, unlike /api/admin/clients. That is a deliberate, narrow
 * exception to the boundary in lib/authz.ts, and it is drawn here rather than
 * by relaxing the client routes:
 *
 *  - **A query is required.** There is no "list everything" call to make, so
 *    a borrowed sales session cannot page through the client book; it has to
 *    already know who it's looking for.
 *  - **The projection is tiny.** Company, contact, email, project name and
 *    price. No phone numbers, no notes, no deliverables, no payment history —
 *    just enough to be sure you're billing the right customer.
 *  - **The result set is capped.** Ten, so a one-letter query that matches
 *    half the book still only returns ten of them.
 *
 * Billing someone requires finding them. Making Evan ask ops who a customer
 * is before he can invoice them would be the workflow this feature exists to
 * remove.
 */

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 10;

export async function GET(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) {
      return unauthorizedResponse();
    }

    // Arriving from "New charge" on a project page: the customer is already
    // decided, so resolve that one rather than making someone search for a
    // record they just came from.
    const projectId = (request.nextUrl.searchParams.get('projectId') || '').trim();
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          client: {
            select: {
              id: true,
              company: true,
              contactName: true,
              email: true,
              archivedAt: true,
              projects: {
                select: { id: true, name: true, status: true, totalPrice: true },
                orderBy: { createdAt: 'desc' },
              },
            },
          },
        },
      });
      const client = project?.client;
      if (!client || client.archivedAt) {
        return NextResponse.json({ success: true, customers: [] }, { status: 200 });
      }
      const { archivedAt: _archivedAt, ...customer } = client;
      return NextResponse.json({ success: true, customers: [customer] }, { status: 200 });
    }

    const query = (request.nextUrl.searchParams.get('q') || '').trim();
    if (query.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ success: true, customers: [], needsQuery: true }, { status: 200 });
    }

    const clients = await prisma.client.findMany({
      where: {
        archivedAt: null,
        /*
         * "Has somewhere to hang an invoice" is part of the QUERY, not a pass
         * over the results.
         *
         * An invoice needs a project — see the Invoice model's required
         * projectId — and unbillable clients used to be filtered out after
         * the ten-row cap had already been applied. So a search that matched
         * fifteen clients, the first ten of them alphabetically leads with no
         * project yet, returned nothing at all, and the screen said "No
         * customer matches that" about a customer who was right there. The
         * more clients in the book, the more often it happened, and it always
         * looked like the search was broken rather than the cap.
         *
         * Asked of the database, the ten rows that come back are ten
         * customers who can actually be billed.
         */
        projects: { some: {} },
        OR: [
          { company: { contains: query, mode: 'insensitive' } },
          { contactName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        company: true,
        contactName: true,
        email: true,
        projects: {
          select: { id: true, name: true, status: true, totalPrice: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { company: 'asc' },
      take: MAX_RESULTS,
    });

    return NextResponse.json({ success: true, customers: clients }, { status: 200 });
  } catch (error) {
    console.error('Billing customer search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
