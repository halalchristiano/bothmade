import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSession } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/middleware';
import { listLeadMockups, normalizeMockupUrl, recordLeadMockup } from '@/lib/mockups';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { leadId } = await params;
    return NextResponse.json({ success: true, mockups: await listLeadMockups(leadId) }, { status: 200 });
  } catch (error) {
    console.error('List lead mockups error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Attaches the next mockup — either a pasted link or an already-uploaded file. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.type !== 'user') return unauthorizedResponse();

    const { leadId } = await params;
    const body = await request.json();

    const url = normalizeMockupUrl(body.url);
    if (!url) {
      return NextResponse.json(
        { error: "That doesn't look like a link — it needs to start with https://" },
        { status: 400 }
      );
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const { mockup, index, alreadyAttached } = await recordLeadMockup({
      leadId,
      url,
      fileName: typeof body.fileName === 'string' ? body.fileName.slice(0, 255) : null,
      note: typeof body.note === 'string' ? body.note : '',
      userId: session.userId,
    });

    return NextResponse.json({ success: true, mockup, index, alreadyAttached }, { status: 200 });
  } catch (error) {
    console.error('Attach lead mockup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
