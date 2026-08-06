import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { BriefForm } from '@/components/BriefForm';
import { leadProblems } from '@/lib/enquiry-nudge';
import { COMPANY_EMAIL } from '@/lib/company';

export const metadata: Metadata = {
  title: 'A few questions',
  robots: { index: false, follow: false },
};

/**
 * The brief, filled in by the client themselves.
 *
 * Sent as a second email the moment somebody enquires through the website.
 * The first email says we got it; this is the one that does the work — the
 * questions a rep would otherwise spend the first call asking, answered
 * before the call, in the same vocabulary the CRM stores.
 *
 * The token is the lead's `shareToken`. It is a link, not a login: a business
 * owner forwards it to whoever actually knows the answers, and making that
 * person create an account is how a form goes unanswered. It reveals nothing
 * beyond the company name the recipient already knows, and the only thing it
 * can do is add to that lead's own brief.
 */
export default async function BriefFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const lead = await prisma.lead
    .findUnique({
      where: { shareToken: token },
      select: { company: true, contactName: true, painPoints: true, doNotContact: true },
    })
    .catch(() => null);

  if (!lead || lead.doNotContact) {
    return (
      <main className="min-h-screen bg-[#05030a] text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/40 mb-4">
            Link not available
          </p>
          <h1 className="text-2xl font-bold mb-3">This form is no longer open.</h1>
          <p className="text-white/50 text-sm">
            Reply to the email this link came from, or write to{' '}
            <a href={`mailto:${COMPANY_EMAIL}`} className="text-white/75 hover:text-white">
              {COMPANY_EMAIL}
            </a>
            , and we will pick it up by hand.
          </p>
        </div>
      </main>
    );
  }

  const first = lead.contactName?.trim().split(/\s+/)[0] ?? null;

  return (
    <main className="min-h-screen bg-[#05030a] text-white px-6 py-16 md:py-24">
      <div className="max-w-2xl mx-auto">
        <p className="font-bold tracking-tight mb-8">
          <span
            className="text-transparent"
            style={{ WebkitTextStroke: '1px rgba(125,211,252,0.9)' }}
          >
            both
          </span>
          made
        </p>

        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          {first ? `${first}, a few questions` : 'A few questions'}
        </h1>
        <p className="text-white/55 leading-relaxed mb-4">
          Thank you for getting in touch{lead.company ? ` about ${lead.company}` : ''}. These are
          the things we would otherwise spend the first call asking. Answering them beforehand
          means that call is us telling you what we would do, rather than us working out what
          you need.
        </p>
        <p className="text-white/35 text-sm mb-14">
          It is all tick boxes — about two minutes. Nothing is required, and there are no prices
          on it.
        </p>

        <BriefForm
          token={token}
          company={lead.company}
          contactName={lead.contactName}
          initialProblems={leadProblems(lead.painPoints ?? '')}
        />
      </div>
    </main>
  );
}
