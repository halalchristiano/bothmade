import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { isLeadStatus, isPainPointKey } from '@/lib/leads';

const MAX_ROWS = 500;

/**
 * Bulk-import leads from a CSV (already parsed client-side into row objects
 * keyed by lowercased header name). Recognized columns: company (required),
 * contactname, email, phone, source, estimatedvalue (dollars), painpoints
 * (semicolon-separated keys), notes, status.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { rows } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Max ${MAX_ROWS} rows per import` }, { status: 400 });
    }

    let skipped = 0;
    const toCreate = rows
      .map((row: Record<string, string>) => {
        const company = (row.company || '').trim();
        if (!company) {
          skipped++;
          return null;
        }

        const painPoints = (row.painpoints || '')
          .split(/[;,]/)
          .map((p) => p.trim())
          .filter(isPainPointKey)
          .join(',');

        const dollars = parseFloat(row.estimatedvalue || '');
        const estimatedValue = !isNaN(dollars) && dollars > 0 ? Math.round(dollars * 100) : null;

        const status = isLeadStatus(row.status?.trim()) ? row.status.trim() : undefined;

        return {
          company,
          contactName: row.contactname || null,
          email: row.email?.includes('@') ? row.email.trim() : null,
          phone: row.phone || null,
          source: row.source || null,
          estimatedValue,
          painPoints,
          notes: row.notes || null,
          status,
          assignedToId: session.userId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (toCreate.length === 0) {
      return NextResponse.json({ error: 'No valid rows — every row needs a company name' }, { status: 400 });
    }

    const created = await prisma.$transaction(toCreate.map((data) => prisma.lead.create({ data })));

    return NextResponse.json({ success: true, count: created.length, skipped }, { status: 201 });
  } catch (error) {
    console.error('Lead CSV import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
