/**
 * The two people, in one place.
 *
 * Shared by the homepage section (`components/About.tsx`) and the /about
 * page, for the same reason `lib/company.ts` exists: a visitor who reads
 * both should not find two different accounts of who works here. Same
 * pattern as `lib/start-faq.ts` — a plain module, importable from server
 * and client components alike.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  EVERY LINE BELOW IS TRUE AND VERIFIABLE. Keep it that way.
 *
 *  `bio` is the one field left open, deliberately. It wants 1–2 sentences
 *  of real background per person — what you did before, what you've built,
 *  what you're known for. It is not written here because inventing it is
 *  the single fastest way to lose a deal: you would have to live up to a
 *  fabricated credential on the first call, and a buyer who catches one
 *  invented detail stops believing the other forty true ones.
 *
 *  Both pages render completely without it. When you have the sentences,
 *  drop them in and they appear in both places at once.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type TeamMember = {
  name: string;
  /** Title as a client should understand it, not an internal one. */
  role: string;
  /** What the client actually experiences from this person. */
  owns: string;
  /** The longer version, for the /about page. Still only true things. */
  detail: string;
  email: string;
  photo?: string;
  /** Real background. See the banner above — leave empty until it's true. */
  bio?: string;
  /** Matches this person's side of the brand seam. */
  accent: { from: string; to: string };
};

export const TEAM: TeamMember[] = [
  {
    name: 'Evan',
    role: 'Co-owner · Sales & client lead',
    owns:
      'Your first call, your scope, your number. Every question you send lands with him directly — no account layer in between — and he stays your point of contact from kickoff to launch.',
    detail:
      "He is the person you email, and the person who answers. There is no account manager translating your notes into a ticket for someone you never meet, because there is no one else for him to hand them to. That also means the number he quotes is one he has to stand behind — he can't pass a bad estimate to a delivery team and walk away from it.",
    email: 'evan@bothmade.studio',
    photo: '/team/evan.jpg',
    accent: { from: '#38bdf8', to: '#0c2f52' },
  },
  {
    name: 'Kiana',
    role: 'Co-owner · Design & engineering',
    owns:
      'Every screen you approve and every line of code that ships is hers — designed against your real content, then built by the same hands, so what launches matches what you signed off.',
    detail:
      'Design and engineering in the same pair of hands, which removes the most expensive handoff in this industry: the one where a designer draws something a developer then quietly reinterprets. Nothing gets approved that cannot be built, and nothing gets built that drifts from what was approved — because the person doing the second thing is the person who drew the first.',
    email: 'kiana@bothmade.studio',
    photo: '/team/kiana.jpg',
    accent: { from: '#a855f7', to: '#3b0764' },
  },
];
