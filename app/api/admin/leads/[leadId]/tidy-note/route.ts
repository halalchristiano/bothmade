import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { canTidyCallNotes, tidyCallNote } from '@/lib/call-note';
import { findCallOutcome } from '@/lib/call-outcomes';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';

/**
 * Tidies the note a rep typed on a call, without saving anything.
 *
 * Deliberately read-only: it hands back a suggestion the rep can accept,
 * edit or ignore, and the existing call-outcome route is still what writes
 * to the record. A model that misreads shorthand should cost someone one
 * glance, not a wrong entry in a lead's history.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    const limited = await enforceRateLimit(
      request,
      'tidy-note',
      RATE_LIMITS.tidyNote,
      'That is a lot of tidying in one go — give it a minute.'
    );
    if (limited) return limited;

    if (!canTidyCallNotes()) {
      return NextResponse.json(
        { error: 'Tidying notes needs ANTHROPIC_API_KEY set on this deployment.' },
        { status: 503 }
      );
    }

    const { leadId } = await params;
    const { note, outcome: outcomeKey } = await request.json();

    const raw = typeof note === 'string' ? note.trim() : '';
    if (!raw) {
      return NextResponse.json({ error: 'There is no note to tidy up yet.' }, { status: 400 });
    }
    // Long enough for the longest call anyone types up, short enough that a
    // pasted document can't run up a bill on a per-request endpoint.
    if (raw.length > 4000) {
      return NextResponse.json({ error: 'That note is too long to tidy up.' }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { company: true, contactName: true },
    });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const tidied = await tidyCallNote({
      raw,
      company: lead.company,
      contactName: lead.contactName,
      outcomeLabel: findCallOutcome(outcomeKey)?.label ?? 'A call',
      // The model has no clock, so "Monday" is meaningless without this.
      today: new Date().toISOString().slice(0, 10),
    });

    return NextResponse.json(tidied, { status: 200 });
  } catch (error) {
    console.error('Tidy call note error:', error);
    return NextResponse.json(
      { error: "Couldn't tidy that up just now — log the note as you wrote it." },
      { status: 502 }
    );
  }
}
