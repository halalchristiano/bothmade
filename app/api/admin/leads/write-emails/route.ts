import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, unauthorizedResponse } from '@/lib/middleware';
import { parseSalesPoints } from '@/lib/leads';
import { canWriteEmails, writeLeadEmails } from '@/lib/cold-email-writer';

/**
 * Write the two emails for a batch of leads.
 *
 * The book is a thousand businesses and fifty of them have an email written
 * for them. The rest fall back to a generic first contact, which is the
 * difference between the leads that reply and the leads that do not — so the
 * gap is not a writing problem, it is a volume problem, and this closes it.
 *
 * Drafts are saved to the lead and nothing is sent. Somebody still reads
 * them: the send is a separate button, behind a preview, as it already was.
 *
 * An existing draft is never overwritten unless the caller says so. A
 * hand-written email is worth more than a generated one and losing it to a
 * misclick would be unforgivable.
 */

// One run is a batch, not the whole book. Each lead is a model call — a
// thousand in one request would sit on a serverless timeout and come back
// with nothing, having spent the money anyway. The client loops.
const MAX_LEADS = 60;

// How many run at once. High enough to be worth batching, low enough not to
// trip the API's rate limit and lose the whole run to a 429.
const CONCURRENCY = 4;

interface LeadResult {
  leadId: string;
  company: string;
  ok: boolean;
  reason?: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireStaff();
    if (!session) return unauthorizedResponse();

    if (!canWriteEmails()) {
      return NextResponse.json(
        { error: 'Email writing is not available on this deployment — ANTHROPIC_API_KEY is not set.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const leadIds: string[] = Array.isArray(body?.leadIds) ? body.leadIds : [];
    // Off by default. On, it replaces drafts that already exist — which is
    // what "rewrite these" means and is never what "fill in the missing ones"
    // means.
    const overwrite = body?.overwrite === true;

    if (leadIds.length === 0) {
      return NextResponse.json({ error: 'No leads selected' }, { status: 400 });
    }
    if (leadIds.length > MAX_LEADS) {
      return NextResponse.json(
        { error: `Max ${MAX_LEADS} leads per run — send them in batches.` },
        { status: 400 }
      );
    }

    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds } },
      select: {
        id: true,
        company: true,
        contactName: true,
        contactRole: true,
        industry: true,
        city: true,
        region: true,
        originalWebsite: true,
        currentSiteAssessment: true,
        personalizedObservation: true,
        customPainPoints: true,
        essentialPoints: true,
        googleRating: true,
        googleReviewCount: true,
        employeeCount: true,
        locationCount: true,
        yearFounded: true,
        estimatedValue: true,
        coldEmailDraft: true,
        mockupEmailDraft: true,
        coldEmailSentAt: true,
        doNotContact: true,
      },
    });

    const results: LeadResult[] = [];
    const queue = [...leads];

    const runOne = async (lead: (typeof leads)[number]) => {
      // A business that asked to be left alone does not get an email written
      // for it. Nothing here sends, but a draft sitting ready on a
      // do-not-contact lead is a send waiting to happen by accident.
      if (lead.doNotContact) {
        results.push({
          leadId: lead.id,
          company: lead.company,
          ok: false,
          reason: 'Marked do-not-contact — nothing written',
        });
        return;
      }
      if (!overwrite && lead.coldEmailDraft && lead.mockupEmailDraft) {
        results.push({
          leadId: lead.id,
          company: lead.company,
          ok: false,
          reason: 'Already has both emails — left alone',
        });
        return;
      }
      // The cold email has gone already. Rewriting the draft under it would
      // mean the record no longer shows what was actually sent.
      if (!overwrite && lead.coldEmailSentAt && lead.coldEmailDraft) {
        results.push({
          leadId: lead.id,
          company: lead.company,
          ok: false,
          reason: 'Cold email already sent — draft kept as the record of it',
        });
        return;
      }

      try {
        const written = await writeLeadEmails({
          company: lead.company,
          contactName: lead.contactName,
          contactRole: lead.contactRole,
          industry: lead.industry,
          city: lead.city,
          region: lead.region,
          originalWebsite: lead.originalWebsite,
          currentSiteAssessment: lead.currentSiteAssessment,
          personalizedObservation: lead.personalizedObservation,
          painPoints: parseSalesPoints(lead.customPainPoints ?? '').map((p) => p.point),
          essentials: parseSalesPoints(lead.essentialPoints ?? '').map((p) => p.point),
          googleRating: lead.googleRating,
          googleReviewCount: lead.googleReviewCount,
          employeeCount: lead.employeeCount,
          locationCount: lead.locationCount,
          yearFounded: lead.yearFounded,
          estimatedValue: lead.estimatedValue,
        });

        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            // Each field only fills a gap unless a rewrite was asked for, so
            // a lead with a hand-written cold email and no mockup email gets
            // the second one without losing the first.
            ...(overwrite || !lead.coldEmailDraft ? { coldEmailDraft: written.coldEmail } : {}),
            ...(overwrite || !lead.mockupEmailDraft ? { mockupEmailDraft: written.mockupEmail } : {}),
            ...(overwrite || !lead.personalizedObservation
              ? { personalizedObservation: written.observation }
              : {}),
          },
        });

        results.push({ leadId: lead.id, company: lead.company, ok: true });
      } catch (error) {
        // The writer refuses a draft that invented a fact about the business.
        // That refusal is the feature working, and it belongs on screen in
        // the words it used rather than as "something went wrong".
        const reason = error instanceof Error ? error.message : 'Could not write it';
        results.push({ leadId: lead.id, company: lead.company, ok: false, reason });
      }
    };

    // Fixed pool rather than Promise.all over everything: one lead is one
    // model call, and sixty at once is a rate limit.
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (;;) {
          const next = queue.shift();
          if (!next) return;
          await runOne(next);
        }
      })
    );

    const written = results.filter((r) => r.ok).length;

    await prisma.leadActivity
      .createMany({
        data: results
          .filter((r) => r.ok)
          .map((r) => ({
            leadId: r.leadId,
            type: 'note' as const,
            content: 'Cold email and mockup email written from this lead’s research.',
            createdById: session.userId,
          })),
      })
      .catch((err) => console.error('Write-emails activity not recorded:', err));

    return NextResponse.json(
      {
        success: true,
        written,
        failed: results.filter((r) => !r.ok).length,
        results,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Write lead emails error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
