import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { requireRole, ANY_STAFF } from '@/lib/authz';
import { unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus } from '@/lib/leads';

/**
 * Bulk-add a list of prospective companies at once — for when Evan has a
 * list of companies to work through rather than adding them one at a time.
 * Accepts either plain company names (one per line) or "Company, email"
 * pairs; every row becomes its own Lead at the given shared status.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();
    const denied = requireRole(session, ANY_STAFF);
    if (denied) return denied;

    const { lines, status } = await request.json();
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'Provide at least one line' }, { status: 400 });
    }
    if (status !== undefined && !isLeadStatus(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const rows = lines
      .map((line: string) => line.trim())
      .filter(Boolean)
      .slice(0, 200) // sane upper bound per paste
      .map((line: string) => {
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

    return NextResponse.json({ success: true, count: created.length }, { status: 201 });
  } catch (error) {
    console.error('Bulk create leads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
