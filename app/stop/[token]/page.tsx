import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { COMPANY_EMAIL, COMPANY_NAME } from '@/lib/company';

export const metadata: Metadata = {
  title: 'Unsubscribed',
  robots: { index: false, follow: false },
};

/**
 * One click and we stop.
 *
 * No form, no login, no "tell us why". The link in a follow-up email lands
 * here and the lead is marked do-not-contact before the page renders — if
 * somebody has decided to be left alone, making them confirm it is one more
 * thing we are doing to them after being asked not to.
 *
 * The token is the lead's own `shareToken`, which is unguessable and does not
 * identify anyone from the outside. It is not a secret worth protecting
 * either way: the worst a stranger with the link can do is stop us emailing
 * somebody, which is the thing the page is for.
 */
export default async function StopPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const lead = await prisma.lead
    .findUnique({ where: { shareToken: token }, select: { id: true, company: true, doNotContact: true } })
    .catch(() => null);

  if (lead && !lead.doNotContact) {
    await prisma.lead
      .update({
        where: { id: lead.id },
        data: { doNotContact: true, doNotContactReason: 'Unsubscribed from a follow-up email.' },
      })
      .catch((e) => console.error('Unsubscribe not recorded:', e));

    // On the timeline rather than only in a column, so a rep who wonders why
    // this lead went quiet sees the answer in the same place as everything
    // else that happened to them.
    await prisma.leadActivity
      .create({
        data: {
          leadId: lead.id,
          type: 'note',
          content: 'Unsubscribed from follow-up emails. Do not contact by email.',
        },
      })
      .catch((e) => console.error('Unsubscribe activity not written:', e));
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-white/35 mb-4">{COMPANY_NAME}</p>
        <h1 className="text-3xl font-bold mb-4">
          {lead ? "That's done — we'll stop." : 'That link has expired'}
        </h1>
        <p className="text-white/55 leading-relaxed">
          {lead ? (
            <>
              You will not get any more follow-up emails from us
              {lead.company ? ` about ${lead.company}` : ''}. Nothing else needed.
            </>
          ) : (
            <>
              We could not find anything to unsubscribe. If you are still hearing from us, reply to any
              of our emails and we will sort it by hand.
            </>
          )}
        </p>
        <p className="text-white/35 text-sm mt-8">
          Changed your mind, or need something?{' '}
          <a href={`mailto:${COMPANY_EMAIL}`} className="text-white/60 hover:text-white transition-colors">
            {COMPANY_EMAIL}
          </a>
        </p>
      </div>
    </main>
  );
}
