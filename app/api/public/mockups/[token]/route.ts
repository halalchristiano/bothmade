import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit';
import {
  mockupInclude,
  mockupLinkExpired,
  recordExpiredMockupView,
  recordMockupView,
  toMockupDTO,
} from '@/lib/mockups';
import { postSystemMessage } from '@/lib/team-chat';

/**
 * The client's end of a mockup link.
 *
 * GET records that they opened it and returns just enough to render the
 * page; POST records what they said about it. No login — the token in the
 * link is the capability, exactly like the sign-and-pay page, because
 * "create an account to look at the thing we made for you" is how a warm
 * prospect becomes a cold one.
 *
 * The view counter is the whole point. Whether a prospect has opened their
 * mockup is the strongest signal in this pipeline, and until now the only
 * way to find out was to ring up and ask.
 */

const MAX_NOTE = 2000;

async function findByToken(token: string) {
  if (!token || token.length < 8) return null;
  return prisma.leadMockup.findUnique({
    where: { shareToken: token },
    include: { ...mockupInclude, lead: { select: { id: true, company: true, contactName: true } } },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limited = await enforceRateLimit(
      request,
      'public-mockup',
      RATE_LIMITS.publicRead,
      'Too many requests. Please wait a moment and reload.'
    );
    if (limited) return limited;

    const { token } = await params;
    const mockup = await findByToken(token);
    // Same 404 for "no such token" and "never sent", so the endpoint can't be
    // used to probe which tokens exist.
    if (!mockup || mockup.status === 'draft') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (mockupLinkExpired(mockup)) {
      /*
       * Recorded, and somebody told.
       *
       * This is a person actively trying to look at the work we built for
       * them — the strongest signal in the pipeline — and it was being thrown
       * away. The page asks them to reply to the email, and most people will
       * not, so without this it left no trace at all. The fix on our side is
       * one click, and the only thing missing was knowing to make it.
       *
       * Best-effort, and before the response either way: they came here to
       * see the mockup, and a bookkeeping failure must not turn a dead link
       * into a broken page as well.
       */
      const { worthAnnouncing } = await recordExpiredMockupView(mockup.id).catch(() => ({
        worthAnnouncing: false,
      }));

      if (worthAnnouncing) {
        // Urgent, because it decays: a prospect who tried today is warm this
        // afternoon and gone by next week.
        await postSystemMessage({
          content: `🔗 ${mockup.lead.company} just tried to open their mockup and the link had expired. Re-send it — it takes one click.`,
          relatedLeadId: mockup.lead.id,
          urgent: true,
        }).catch((e) => console.error('Could not announce the expired mockup view:', e));
      }

      return NextResponse.json(
        { error: 'This link has expired. Reply to the email it came from and we will send a fresh one.', expired: true },
        { status: 410 }
      );
    }

    // Counted before the response, because a view that fails to record is a
    // rep told nobody looked. A write failure must not cost them the page,
    // though — they came here to see the work.
    await recordMockupView(mockup.id).catch((e) => console.error('Mockup view not recorded:', e));

    return NextResponse.json(
      {
        success: true,
        mockup: {
          ...toMockupDTO(mockup),
          // The token is already in their URL; echoing it back into a JSON
          // body it doesn't need is just one more place for it to leak.
          shareToken: undefined,
        },
        company: mockup.lead.company,
        contactName: mockup.lead.contactName,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Public mockup fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limited = await enforceRateLimit(
      request,
      'public-mockup-respond',
      RATE_LIMITS.publicWrite,
      'Too many attempts. Please wait a moment and try again.'
    );
    if (limited) return limited;

    const { token } = await params;
    const mockup = await findByToken(token);
    if (!mockup || mockup.status === 'draft') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (mockupLinkExpired(mockup)) {
      return NextResponse.json({ error: 'This link has expired.', expired: true }, { status: 410 });
    }

    const body = await request.json().catch(() => null);
    const verdict = (body as { verdict?: unknown } | null)?.verdict;
    if (verdict !== 'approved' && verdict !== 'changes_requested') {
      return NextResponse.json({ error: 'Tell us whether this works or needs changes.' }, { status: 400 });
    }
    const rawNote = (body as { note?: unknown } | null)?.note;
    const note = typeof rawNote === 'string' ? rawNote.trim().slice(0, MAX_NOTE) : '';
    // Asking for changes without saying what they are gives the studio
    // nothing to act on, and the client a second email to write.
    if (verdict === 'changes_requested' && !note) {
      return NextResponse.json(
        { error: 'Tell us what you would like changed — even a sentence helps.' },
        { status: 400 }
      );
    }

    const respondedAt = new Date();
    await prisma.leadMockup.update({
      where: { id: mockup.id },
      data: { status: verdict, respondedAt, responseNote: note || null },
    });

    await prisma.leadActivity
      .create({
        data: {
          leadId: mockup.leadId,
          type: 'note',
          content:
            verdict === 'approved'
              ? `Client approved the mockup${note ? ` — "${note}"` : ''}.`
              : `Client asked for changes to the mockup — "${note}"`,
          url: mockup.url,
        },
      })
      .catch((e) => console.error('Mockup response activity not written:', e));

    // The team hears about it without anyone having to check. An approval is
    // the moment a deal becomes closeable, and it arriving silently is how
    // a warm prospect sits for three days.
    await postSystemMessage({
      content:
        verdict === 'approved'
          ? `🎉 ${mockup.lead.company} approved their mockup${note ? ` — "${note}"` : ''}. Send the proposal.`
          : `✏️ ${mockup.lead.company} asked for changes to their mockup — "${note}"`,
      relatedLeadId: mockup.leadId,
      urgent: verdict === 'approved',
    }).catch((e) => console.error('Mockup response not announced:', e));

    return NextResponse.json({ success: true, verdict }, { status: 200 });
  } catch (error) {
    console.error('Public mockup response error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
