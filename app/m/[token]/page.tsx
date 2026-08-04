'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { PillCTA, SectionTag } from '@/components/ui';

/**
 * The mockup, as the client sees it.
 *
 * Short and deliberately so: one button to open the work, and two to say what
 * they think. Everything else on this page exists to make those three clicks
 * obvious.
 *
 * Loading it is what records the view — the fact the studio could never see
 * before, and the one that decides whether the next call opens with "did you
 * get a chance to look?" or "I saw you've been through it a few times."
 */

interface MockupPayload {
  url: string;
  fileName: string | null;
  status: string;
  respondedAt: string | null;
  responseNote: string | null;
}

export default function MockupPage() {
  const params = useParams();
  const token = params.token as string;

  const [mockup, setMockup] = useState<MockupPayload | null>(null);
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);

  const [note, setNote] = useState('');
  const [showChanges, setShowChanges] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [answered, setAnswered] = useState<'approved' | 'changes_requested' | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/public/mockups/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (res.ok && data.success) {
          setMockup(data.mockup);
          setCompany(data.company);
          setContactName(data.contactName);
          if (data.mockup.status === 'approved' || data.mockup.status === 'changes_requested') {
            setAnswered(data.mockup.status);
          }
        } else {
          setError(data.error || 'This link is no longer valid.');
          setExpired(!!data.expired);
        }
      } catch {
        setError('Something went wrong loading this page.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const respond = async (verdict: 'approved' | 'changes_requested') => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`/api/public/mockups/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict, note: note.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) setAnswered(verdict);
      else setSubmitError(data.error || 'Could not send that. Please try again.');
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#05030a] text-white flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-sky-400" />
      </main>
    );
  }

  if (error || !mockup) {
    return (
      <main className="min-h-screen bg-[#05030a] text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/40 mb-4">
            {expired ? 'Link expired' : 'Link not available'}
          </p>
          <h1 className="text-2xl font-bold mb-3">{error}</h1>
          <p className="text-white/50 text-sm">
            Reply to the email this link came from and we&apos;ll sort it out.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#05030a] text-white px-6 py-16 md:py-24">
      <div className="max-w-xl mx-auto">
        <p className="font-bold tracking-tight mb-2">
          <span className="text-transparent" style={{ WebkitTextStroke: '1px rgba(125,211,252,0.9)' }}>
            both
          </span>
          made
        </p>
        <SectionTag className="mb-6">Your mockup</SectionTag>

        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">{company}</h1>
        <p className="text-white/50 mb-8">
          {contactName ? `${contactName} — here's` : "Here's"} what we&apos;ve built for you. Have a look
          around, then tell us what you think below.
        </p>

        <a
          href={mockup.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-2xl bg-gradient-to-r from-sky-400 to-purple-500 px-6 py-5 text-lg font-semibold text-black hover:opacity-90 transition-opacity mb-3"
        >
          Open the mockup
          <ExternalLink size={18} />
        </a>
        <p className="text-xs text-white/30 mb-10 text-center">
          Opens in a new tab. Nothing here is live yet — it&apos;s a preview built for you.
        </p>

        {answered ? (
          <div
            className={`rounded-2xl border p-6 ${
              answered === 'approved'
                ? 'border-emerald-400/30 bg-emerald-400/[0.07]'
                : 'border-sky-400/30 bg-sky-400/[0.07]'
            }`}
          >
            <p className="font-semibold mb-1">
              {answered === 'approved' ? 'Thank you — noted.' : 'Got it, thank you.'}
            </p>
            <p className="text-sm text-white/60">
              {answered === 'approved'
                ? "We've told the team. Someone will be in touch shortly with next steps."
                : "We've passed your notes to the team and we'll come back with a new version."}
            </p>
            {mockup.responseNote && (
              <p className="text-sm text-white/40 mt-3 italic">&ldquo;{mockup.responseNote}&rdquo;</p>
            )}
          </div>
        ) : (
          <>
            <SectionTag className="mb-4">What do you think?</SectionTag>

            {showChanges && (
              <label className="block mb-4">
                <span className="block font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 mb-2">
                  What would you like changed?
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="The hero image, the colours, the wording on the second section…"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white placeholder:text-white/20 outline-none focus:border-sky-400/60 focus:bg-white/[0.05] resize-y"
                />
              </label>
            )}

            {submitError && <p className="text-sm text-red-400 mb-4">{submitError}</p>}

            <div className="flex flex-col sm:flex-row gap-3">
              <PillCTA
                type="button"
                busy={submitting}
                disabled={submitting}
                onClick={() => respond('approved')}
                size="lg"
              >
                This works — let&apos;s go
              </PillCTA>
              <button
                type="button"
                disabled={submitting}
                onClick={() => (showChanges ? respond('changes_requested') : setShowChanges(true))}
                className="flex-1 rounded-full border border-white/20 px-6 py-4 font-semibold text-white/80 hover:bg-white/5 disabled:opacity-50 transition-colors"
              >
                {showChanges ? 'Send my notes' : "I'd like some changes"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
