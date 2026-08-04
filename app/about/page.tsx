import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { PillCTA } from '@/components/ui';
import { COMPANY_LOCATION, COMPANY_EMAIL, COMPANY_ADDRESS_INLINE } from '@/lib/company';
import { TEAM } from '@/lib/team';
import { BLOG_POSTS } from '@/lib/blog';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * Three posts chosen to answer a buyer's three real questions, rather than
 * to show off: will this still work in two years, do they get the boring
 * correctness right, and do they actually know the platform. Counted from
 * BLOG_POSTS so the number in the copy can't go stale.
 */
const POST_COUNT = BLOG_POSTS.length;

const EVIDENCE_POSTS = [
  {
    slug: 'built-to-last',
    tag: 'Longevity',
    title: 'Built to last',
    why: 'Why we reach for boring, proven tools over whatever launched last week — and the one case where we do the opposite.',
  },
  {
    slug: 'why-batch-writes-get-wrapped-in-one-transaction',
    tag: 'Correctness',
    title: 'Why batch writes get wrapped in one transaction',
    why: 'Import five records and the fourth fails — do you keep the first three, or nothing? The unglamorous decision that decides whether your data can be trusted.',
  },
  {
    slug: 'vision-pro-is-not-a-stretched-ipad',
    tag: 'Platform depth',
    title: "Vision Pro isn't a stretched iPad",
    why: "Windows, volumes, and immersive spaces aren't three sizes of one screen. What it looks like to learn a platform properly instead of porting to it.",
  },
];

export const metadata: Metadata = {
  title: 'About — Two people, both halves | Bothmade',
  description:
    'Bothmade is a two-person studio building web and native Apple software. No account managers, fixed scope and price, and the people who quote your project are the ones who build it.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About — Two people, both halves | Bothmade',
    description:
      'A two-person studio building web and native Apple software. The people who quote your project are the ones who build it.',
    url: '/about',
    type: 'profile',
  },
};

/**
 * The page a buyer opens when they've decided to check whether we're real.
 *
 * Every claim here is one the rest of the repo can substantiate — the
 * agreement terms, the pricing model, the process, the fact that there are
 * two of us. Nothing about anyone's career history appears, because none of
 * it is established anywhere and inventing it would be the one thing on this
 * site that could not survive a first phone call. `bio` in lib/team.ts is
 * where that goes when it's real; the page is complete without it.
 */
export default function AboutPage() {
  return (
    <main className="relative bg-[#05030a] text-white">
      <Nav />

      {/* Organisation + founders, so a brand search resolves to an entity
          rather than a loose set of pages. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'AboutPage',
            url: `${SITE_URL}/about`,
            mainEntity: {
              '@type': 'Organization',
              name: 'Bothmade',
              url: SITE_URL,
              email: COMPANY_EMAIL,
              founder: TEAM.map((person) => ({
                '@type': 'Person',
                name: person.name,
                jobTitle: person.role,
                email: person.email,
              })),
            },
          }),
        }}
      />

      {/* ── Opening claim ─────────────────────────────────────────────── */}
      <section className="relative px-6 pt-40 pb-24">
        <div className="max-w-5xl mx-auto">
          <p className="mb-8 font-mono text-[10px] uppercase tracking-[0.45em] text-white/40">
            about bothmade
          </p>

          <h1
            className="font-bold leading-[0.95] tracking-[-0.03em] max-w-4xl"
            style={{ fontSize: 'clamp(2.5rem, 8vw, 6rem)' }}
          >
            Two people.
            <br />
            Both halves.
          </h1>

          <p className="mt-12 max-w-2xl text-lg md:text-xl leading-relaxed text-white/60">
            Most studios can do the web or they can do native, and the other half gets
            subcontracted to someone you never meet. We do both, which is the entire
            reason the studio is called what it is — and the reason there are two of us
            rather than twenty.
          </p>

          {/* Something for the skimmer. Every row is a fact stated elsewhere
              on the site, not a claim invented for this strip. */}
          <dl className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10 border-t border-white/10 pt-10">
            {[
              { term: 'Team size', detail: 'Two, both owners' },
              { term: 'We build', detail: 'Web · iOS · iPad · macOS · Vision Pro' },
              { term: 'Pricing', detail: 'Published, fixed before we start' },
              { term: 'To begin', detail: '50% deposit, balance before launch' },
            ].map((row) => (
              <div key={row.term}>
                <dt className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/35 mb-2">
                  {row.term}
                </dt>
                <dd className="text-sm md:text-base text-white/70 leading-snug">
                  {row.detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── The argument for being small ──────────────────────────────── */}
      <section className="relative px-6 py-24 border-t border-white/10">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-10">
          <h2 className="md:col-span-4 text-sm font-mono uppercase tracking-[0.4em] text-white/40">
            Why two
          </h2>

          <div className="md:col-span-8 space-y-6 text-white/65 leading-relaxed text-base md:text-lg">
            <p>
              Staying small is a choice we keep making, not a stage we&apos;re trying to
              grow out of. An agency that adds people has to add process, and the
              process is what you end up paying for: the account manager who relays
              your notes, the standup where your project is one line, the estimate
              written by someone who will never open the codebase.
            </p>
            <p>
              At two, none of that exists. Your project is one of a handful we are
              working on, the person who quotes it is the person who builds it, and
              nothing you say has to survive being passed along to stay accurate.
            </p>
            <p className="text-white/80">
              The trade is real and worth saying out loud: we take on fewer projects
              than a larger studio, so sometimes the honest answer is that we can&apos;t
              start when you need us to. We&apos;d rather tell you that than take the
              work and quietly queue it.
            </p>
          </div>
        </div>
      </section>

      {/* ── How the money and the schedule actually work ──────────────── */}
      <section className="relative px-6 py-24 border-t border-white/10">
        <div className="max-w-5xl mx-auto">
          <h2 className="mb-16 text-sm font-mono uppercase tracking-[0.4em] text-white/40">
            How it works, concretely
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-14 gap-y-12">
            {[
              {
                title: 'You see the number before we start',
                body: 'Pricing is published, itemised, and configurable on the site — not quoted after a discovery call designed to find out what you can afford. It moves if you ask for more, never as a line item at the end.',
                href: '/start',
                label: 'Price it yourself',
              },
              {
                title: 'Half up front, half before launch',
                body: 'A 50% deposit starts Discovery; the balance is due once Build is finished and before you go live. That is what the checkout actually charges — no surprise full invoice at the start.',
              },
              {
                title: 'A working link every week',
                body: 'Not a status email. Every week of Build there is something you can open and click, which is the only way feedback arrives while it is still cheap to act on.',
              },
              {
                title: 'We are still here after launch',
                body: 'Shipping is not the exit. We stay on to fix what breaks, ship what you learn from real users, and answer the phone — and if we ever go dark on your project without explanation, the agreement says that is grounds for a refund.',
              },
            ].map((item) => (
              <div key={item.title}>
                <h3 className="text-xl md:text-2xl font-semibold text-white mb-3">
                  {item.title}
                </h3>
                <p className="text-white/55 leading-relaxed">{item.body}</p>
                {item.href && (
                  <Link
                    href={item.href}
                    className="mt-3 inline-block text-sm text-sky-300/80 hover:text-sky-300 underline underline-offset-4 decoration-sky-300/30 hover:decoration-sky-300"
                  >
                    {item.label} →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The people ────────────────────────────────────────────────── */}
      <section className="relative px-6 py-24 border-t border-white/10">
        <div className="max-w-5xl mx-auto">
          <h2 className="mb-4 text-sm font-mono uppercase tracking-[0.4em] text-white/40">
            The two of us
          </h2>
          <p className="mb-16 max-w-xl text-white/50">
            The whole org chart. Both of us are owners, so there is nobody above us to
            escalate to and nobody below us to hand your project to.
          </p>

          <div className="space-y-16">
            {TEAM.map((person) => (
              <div
                key={person.email}
                className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-start"
              >
                <div className="md:col-span-4">
                  <div
                    className="relative w-full max-w-[260px] aspect-square rounded-2xl overflow-hidden border border-white/15"
                    style={{
                      background: `linear-gradient(140deg, ${person.accent.from}30, ${person.accent.to}80)`,
                    }}
                  >
                    {person.photo ? (
                      <Image
                        src={person.photo}
                        alt={`${person.name}, ${person.role.toLowerCase()} at Bothmade`}
                        fill
                        sizes="(max-width: 768px) 100vw, 260px"
                        className="object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 grid place-items-center text-6xl font-bold text-white/80"
                      >
                        {person.name[0]}
                      </span>
                    )}
                  </div>
                </div>

                <div className="md:col-span-8">
                  <h3 className="text-3xl md:text-4xl font-bold text-white">{person.name}</h3>
                  <p
                    className="mt-2 font-mono text-[10px] uppercase tracking-[0.3em]"
                    style={{ color: person.accent.from }}
                  >
                    {person.role}
                  </p>

                  <p className="mt-6 text-base md:text-lg text-white/60 leading-relaxed max-w-xl">
                    {person.owns}
                  </p>
                  <p className="mt-4 text-base text-white/45 leading-relaxed max-w-xl">
                    {person.detail}
                  </p>
                  {person.bio && (
                    <p className="mt-4 text-base text-white/45 leading-relaxed max-w-xl">
                      {person.bio}
                    </p>
                  )}

                  <a
                    href={`mailto:${person.email}`}
                    className="mt-6 inline-block font-mono text-xs text-white/45 hover:text-white transition-colors border-b border-white/15 hover:border-white/50 pb-0.5"
                  >
                    {person.email}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Evidence, in place of asking to be taken on trust ─────────── */}
      <section className="relative px-6 py-24 border-t border-white/10">
        <div className="max-w-5xl mx-auto">
          <h2 className="mb-4 text-sm font-mono uppercase tracking-[0.4em] text-white/40">
            Don&apos;t take our word for it
          </h2>
          <p className="mb-14 max-w-2xl text-lg md:text-xl leading-relaxed text-white/60">
            Everything above is a claim about how we work. Here is the part you can
            check: {POST_COUNT}{' '}write-ups of real decisions — what the options were,
            which one we took, and what it cost us. Read three and you&apos;ll know
            how we&apos;d think about your project before you ever email us.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {EVIDENCE_POSTS.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group relative rounded-2xl border border-white/10 bg-white/[0.02] p-7 transition-colors hover:border-white/25 hover:bg-white/[0.04]"
              >
                <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-sky-300/60">
                  {post.tag}
                </p>
                <h3 className="text-lg font-semibold text-white/90 leading-snug mb-3">
                  {post.title}
                </h3>
                <p className="text-sm text-white/45 leading-relaxed">{post.why}</p>
                <span className="mt-5 inline-block text-sm text-white/40 group-hover:text-white transition-colors">
                  Read it →
                </span>
              </Link>
            ))}
          </div>

          <p className="mt-10 text-white/45 leading-relaxed max-w-2xl">
            And the site you&apos;re reading is the other half of the answer. Every
            interaction on it — the seam on the homepage, the sheets that stack as you
            scroll, the way this page loads — is ours, built with the same tools we&apos;d
            use on yours.{' '}
            <Link
              href="/blog"
              className="text-white/70 hover:text-white transition-colors border-b border-white/20 hover:border-white/60 pb-0.5"
            >
              All {POST_COUNT} posts
            </Link>.
          </p>
        </div>
      </section>

      {/* ── Where we are, and the offer for going first ───────────────── */}
      <section className="relative px-6 py-24 border-t border-white/10">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-10">
          <h2 className="md:col-span-4 text-sm font-mono uppercase tracking-[0.4em] text-white/40">
            Where we are
          </h2>

          <div className="md:col-span-8 space-y-6 text-white/65 leading-relaxed text-base md:text-lg">
            <p className="text-white/80">
              We&apos;re early, and the client list is short. If you go first, what that
              buys you is the whole studio&apos;s attention and a team with every reason
              to make your project the one it points at for the next two years. There is
              no version of this where you are a small account.
            </p>
            <p className="text-white/50 text-base">
              We work from {COMPANY_LOCATION}, and the studio is registered at{' '}
              {COMPANY_ADDRESS_INLINE}. Everything reaches us at{' '}
              <a
                href={`mailto:${COMPANY_EMAIL}`}
                className="text-white/75 hover:text-white transition-colors border-b border-white/20 hover:border-white/60 pb-0.5"
              >
                {COMPANY_EMAIL}
              </a>.
            </p>
          </div>
        </div>
      </section>

      {/* ── Close ─────────────────────────────────────────────────────── */}
      <section className="relative px-6 py-32 border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          {/* Deliberately not /work's close — a visitor who reads both
              pages should not be handed the same ending twice. That one
              offers the case-study slot; this one offers the two people. */}
          <h2
            className="font-bold leading-[1.05] tracking-tight mb-8"
            style={{ fontSize: 'clamp(2rem, 6vw, 4rem)' }}
          >
            Now you know
            <br />
            who&apos;d be building it.
          </h2>
          <p className="text-white/50 text-lg mb-12 max-w-lg leading-relaxed">
            Tell us what you&apos;re making and you&apos;ll get a real answer from one of
            the two people above — within a day, in writing, not a discovery call booked
            by a bot. If we&apos;re not the right fit we&apos;ll say so in the first reply.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <PillCTA href="/#contact" size="lg">
              Start a conversation
            </PillCTA>
            <PillCTA href="/start" muted>
              See what it costs
            </PillCTA>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
