/**
 * The handful of things a prospect says that end a cold call, and what to
 * say back.
 *
 * The per-item playbook covers "why does that cost that much" — objections
 * to a specific line. These are the ones that kill the call before pricing
 * ever comes up, and they are what a rep new to sales reliably fumbles:
 * every one of them sounds like a polite no, and most of them aren't.
 *
 * `meaning` matters as much as `response`: the point is to teach which
 * refusals are real, so time isn't wasted on the dead ones or given up on
 * the live ones.
 */
export interface Objection {
  slug: string;
  /** What they actually say. */
  trigger: string;
  /** What it usually means underneath. */
  meaning: string;
  /** Say this. Close to verbatim. */
  response: string;
  /** What to do next regardless of how they answer. */
  thenWhat: string;
}

export const OBJECTIONS: Objection[] = [
  {
    slug: 'send-me-an-email',
    trigger: '"Just send me an email."',
    meaning:
      "Nine times out of ten this is a polite way to end the call, not a request for information. Sending the email and waiting is how a lead quietly dies.",
    response:
      "I will do — what's the best address? And so I send you something useful rather than a brochure: what's the one thing about the website that actually bothers you at the moment?",
    thenWhat:
      "Send it the same day, and set a follow-up for 3 days out. Agree the next call before you hang up — 'I'll give you a ring Thursday to see what you thought' — otherwise there isn't one.",
  },
  {
    slug: 'already-have-someone',
    trigger: '"We already have someone who does our website."',
    meaning:
      "Often true and often dormant — a cousin who built it in 2019, or an agency they're quietly unhappy with. Worth one question before accepting it.",
    response:
      "Makes sense. How quickly do they turn things around when you need a change? The reason I ask is that most people I speak to have someone, they just can't get hold of them.",
    thenWhat:
      "If they're genuinely happy, mark it lost and move on — don't push. If they hesitate at all, that hesitation is the opening. Ask what they'd change if they could.",
  },
  {
    slug: 'not-the-right-time',
    trigger: '"Now\'s not a good time" / "Maybe next year."',
    meaning:
      "Either you caught them mid-something, or it's a soft no. These need completely different responses, so find out which.",
    response:
      "No problem at all — is it that you're busy right now, or that it's not a priority this year? I'd rather know either way than keep bothering you.",
    thenWhat:
      "Busy: get a specific time and ring back then. Not a priority: ask what would make it one, set a follow-up 2-3 months out, and log why.",
  },
  {
    slug: 'how-much',
    trigger: '"How much does it cost?" — asked in the first minute',
    meaning:
      "They're trying to disqualify you quickly. Give a number without context and it's the only thing they hear; refuse to answer and you look evasive.",
    response:
      "Depends on what you need, and I don't know that yet — projects like yours usually land between [low] and [high]. Can I ask two quick questions so I can tell you where in that range you'd sit?",
    thenWhat:
      "Never dodge the question. Give the range, then immediately ask something back so the call doesn't stall on the number.",
  },
  {
    slug: 'too-expensive',
    trigger: '"That\'s too expensive."',
    meaning:
      "Usually means 'I don't yet see what I get for that', not 'I don't have the money'. Discounting confirms the price was made up.",
    response:
      "Fair enough. Can I ask what you were expecting? If it's the scope that's wrong rather than the budget, we can start with just the part that fixes what we talked about.",
    thenWhat:
      "Shrink the job, don't cut the price. Their number tells you whether it's a budget problem or a belief problem — only the first is about money.",
  },
  {
    slug: 'need-to-think',
    trigger: '"I need to think about it."',
    meaning:
      "There's a specific unanswered question they haven't said out loud. 'Thinking about it' without a next step means no.",
    response:
      "Of course. What's the bit you're unsure about? If it's the price I'd rather talk it through now than leave you guessing.",
    thenWhat:
      "Never end here without a date. 'Shall I call you Tuesday?' — a yes to that is worth more than a yes to anything else on the call.",
  },
  {
    slug: 'speak-to-partner',
    trigger: '"I need to speak to my business partner / wife / accountant."',
    meaning:
      "Often genuine. The risk is that you're not in the room when it's discussed, so your pitch gets relayed badly by someone who isn't sold.",
    response:
      "Makes sense. Would it be easier if I joined that conversation for ten minutes, so they can ask me directly rather than you having to explain it second-hand?",
    thenWhat:
      "If no, send a one-page summary they can forward, and confirm when the conversation is happening so you follow up right after it.",
  },
  {
    slug: 'not-interested',
    trigger: '"Not interested." — within the first ten seconds',
    meaning:
      "A reflex, not a decision. They haven't heard anything yet. One polite attempt is fair; a second is harassment.",
    response:
      "Understood — can I ask one question and then leave you alone? When someone searches for what you do and you're not the first name they find, does that bother you or not really?",
    thenWhat:
      "If they say no again, thank them and end the call properly. Mark it lost with the reason. Being remembered as polite is worth more than one forced conversation.",
  },
  {
    slug: 'gatekeeper',
    trigger: "You get the receptionist, not the owner.",
    meaning:
      "Their job is to filter. Sounding like a salesperson gets you filtered; sounding like someone with business to do doesn't.",
    response:
      "Hi — I'm trying to reach whoever looks after the website. I had a look at it before I rang and spotted a couple of things. Who's best for that?",
    thenWhat:
      "Get the name and the best time, even if you don't get through. Ring back at the time they suggest and use their name — it changes the call completely.",
  },
  {
    slug: 'voicemail',
    trigger: 'Voicemail.',
    meaning:
      "Most reps either hang up or ramble. A short specific message gets a callback surprisingly often.",
    response:
      "Hi, it's [name] from Bothmade. I was looking at your website before I rang and noticed one thing that's probably costing you enquiries — nothing urgent, but worth two minutes. I'll try again Thursday, or you can reach me on [number].",
    thenWhat:
      "Say your number slowly, twice. Leave at most two voicemails ever — after that, email instead.",
  },
];
