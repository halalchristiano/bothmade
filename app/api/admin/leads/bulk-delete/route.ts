import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { forbiddenResponse, requireOwner, requireStaff, unauthorizedResponse } from '@/lib/middleware';

const MAX_LEADS = 500;

/** Deletes every selected lead — for cleaning up a bad CSV import in one shot instead of one at a time. */
export async function POST(request: NextRequest) {
  try {
    // Owner-only. Deleting up to 500 lead records in one request — along
    // with their whole activity history, via the cascade — is the most
    // destructive thing the CRM can do, and it is not part of a rep's job.
    if (!(await requireStaff())) return unauthorizedResponse();
    if (!(await requireOwner())) {
      return forbiddenResponse('Only an owner can bulk-delete leads. Ask Kiana to run this one.');
    }

    const { leadIds } = await request.json();
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'No leads selected' }, { status: 400 });
    }
    if (leadIds.length > MAX_LEADS) {
      return NextResponse.json({ error: `Max ${MAX_LEADS} leads per delete` }, { status: 400 });
    }

    const { count } = await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });

    return NextResponse.json({ success: true, count }, { status: 200 });
  } catch (error) {
    console.error('Bulk delete leads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
