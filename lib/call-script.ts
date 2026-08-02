import { PAIN_POINT_BRIEFS, classifyWrittenPoint, formatCents } from '@/lib/pricing';
import type { SalesPoint } from '@/lib/leads';

/**
 * A ready-to-read phone script, assembled from everything already known
 * about a lead.
 *
 * The lead page shows the same material as a briefing — problems, what to
 * sell, what it costs. That's the right shape for preparing, and the wrong
 * shape for the thirty seconds after someone picks up. This turns it into
 * the order the conversation actually happens in, with the words written
 * out, so a rep who is new to this never has to compose a sentence under
 * pressure.
 *
 * `spoken` blocks are meant to be read more or less verbatim. `guidance`
 * blocks are stage directions for the rep and must never be read out — the
 * UI styles the two differently so they can't be confused at a glance.
 */
export interface ScriptBlock {
  /** Short label for the moment in the call this belongs to. */
  heading: string;
  kind: 'spoken' | 'guidance';
  lines: string[];
}

export interface CallScriptInput {
  company: string;
  contactName: string | null;
  repName: string | null;
  writtenPains: SalesPoint[];
  checklistPainKeys: string[];
  essentials: SalesPoint[];
  upsells: SalesPoint[];
  low: number;
  high: number;
}

/**
 * Rewrites a third-person research note as something addressable to the
 * person on the phone: "CONTECH's buyers must interpret..." becomes "your
 * buyers must interpret...".
 *
 * Only substitutions that are safe in every sentence position are applied.
 * Anything cleverer (re-conjugating verbs, reordering clauses) produces
 * broken English often enough that it isn't worth the risk on a live call.
 */
export function toSpokenLine(explanation: string, company: string): string {
  let out = explanation.trim();

  // "CONTECH's" -> "your", "CONTECH" -> "you". Longest form first so the
  // possessive isn't half-replaced.
  const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  out = out.replace(new RegExp(`${escaped}['’]s\\b`, 'gi'), 'your');
  out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), 'you');

  // Third-person framings that read oddly when spoken to the owner.
  const swaps: Array<[RegExp, string]> = [
    [/\bThe current (setup|site|website|digital presentation)\b/gi, 'your $1'],
    [/\bthe current (setup|site|website|digital presentation)\b/gi, 'your $1'],
    [/\bThe company['’]s\b/gi, 'your'],
    [/\bthe company['’]s\b/gi, 'your'],
    [/\bBuyers\b/g, 'your buyers'],
    [/\bProspects\b/g, 'your prospects'],
    [/\bCustomers\b/g, 'your customers'],
    [/\byour your\b/gi, 'your'],
  ];
  for (const [re, to] of swaps) out = out.replace(re, to);

  // Swapping a company name for "you" leaves the verb conjugated for the
  // third person — "the details A1 Duran Roofing needs" becomes "the details
  // you needs". Only an explicit verb list is corrected: a blanket "you
  // <word>s -> you <word>" rule would mangle plural nouns ("you sales team",
  // "you products").
  out = out.replace(
    /\byou (need|want|use|offer|provide|lack|serve|sell|require|struggle|operate|handle|work|run|keep|make|take|show|give|lose|expect|receive|generate|convert|capture|track|quote|book|charge|deliver|manage|send|collect|gather|answer|respond)s\b/gi,
    'you $1'
  );
  out = out.replace(/\byou (appl|rel|tr|carr|compan)ies\b/gi, 'you $1y');
  out = out.replace(/\byou is\b/gi, 'you are');
  out = out.replace(/\byou was\b/gi, 'you were');
  out = out.replace(/\byou has\b/gi, 'you have');
  out = out.replace(/\byou does\b/gi, 'you do');
  out = out.replace(/\byou doesn['’]t\b/gi, "you don't");

  return out.charAt(0).toLowerCase() + out.slice(1);
}

/** The line to say for one pain point — the written script if we have a confident match, otherwise one built from the research note itself. */
export function painPointPitch(point: SalesPoint, company: string): string {
  const matched = classifyWrittenPoint(point.point, point.explanation);
  if (matched) return PAIN_POINT_BRIEFS[matched].sayThis;
  if (point.explanation) {
    return `From what I could see, ${toSpokenLine(point.explanation, company)} Is that roughly how it feels from your side?`;
  }
  return `I wanted to ask you about one thing in particular — ${point.point.toLowerCase()}. Is that something you've noticed?`;
}

export function buildCallScript(input: CallScriptInput): ScriptBlock[] {
  const { company, contactName, repName, writtenPains, essentials, upsells, low, high } = input;
  const who = contactName?.trim().split(/\s+/)[0] || null;
  const me = repName?.trim().split(/\s+/)[0] || 'Evan';

  const blocks: ScriptBlock[] = [];

  blocks.push({
    heading: 'Opening',
    kind: 'spoken',
    lines: [
      who
        ? `Hi, is that ${who}? My name's ${me}, I'm calling from Bothmade.`
        : `Hi there — my name's ${me}, I'm calling from Bothmade.`,
      `I had a proper look at ${company} before I rang, so this isn't a cold pitch. Have you got two minutes?`,
    ],
  });

  const lead = writtenPains[0];
  if (lead) {
    blocks.push({
      heading: 'Why you\'re calling — lead with this',
      kind: 'spoken',
      lines: [
        `The main thing that stood out was ${lead.point.toLowerCase()}.`,
        painPointPitch(lead, company),
      ],
    });
  }

  const rest = writtenPains.slice(1);
  if (rest.length > 0) {
    blocks.push({
      heading: 'If they engage, the other things you found',
      kind: 'spoken',
      lines: [
        'There were a few other things I noticed while I was looking:',
        ...rest.map((p) => `• ${p.point}${p.explanation ? ` — ${toSpokenLine(p.explanation, company)}` : ''}`),
      ],
    });
  }

  blocks.push({
    heading: 'Let them talk',
    kind: 'guidance',
    lines: [
      "Stop here and let them answer. Whatever they say is the most useful thing you'll hear on this call — the point you name back to them later is the one they raise now, not the one you led with.",
      "If they disagree with something, don't defend it. Say \"fair enough\" and ask what they'd change instead.",
    ],
  });

  if (essentials.length > 0) {
    blocks.push({
      heading: 'What you would suggest',
      kind: 'spoken',
      lines: [
        "Based on what I've seen, the things that would actually move the needle are:",
        ...essentials.slice(0, 4).map((e) => `• ${e.point}`),
        "I'd start with those before anything else.",
      ],
    });
  }

  blocks.push({
    heading: 'The price — say it plainly, then stop talking',
    kind: 'spoken',
    lines: [
      low === high
        ? `Something like this comes to about ${formatCents(low)}.`
        : `Something like this usually lands between ${formatCents(low)} and ${formatCents(high)}, depending on how much you take on.`,
      `The core piece — the part I'd genuinely recommend — is ${formatCents(low)}. It's half up front and half on delivery.`,
    ],
  });

  blocks.push({
    heading: 'If they say it\'s too expensive',
    kind: 'guidance',
    lines: [
      `Don't discount. Shrink the job instead: "${formatCents(low)} is the version that fixes the problem we just talked about. We can leave everything else for later."`,
      'If they still say no, ask what number they had in mind. Their answer tells you whether it\'s a budget problem or they aren\'t convinced yet — those need completely different responses.',
    ],
  });

  if (upsells.length > 0) {
    blocks.push({
      heading: 'Only once they have said yes',
      kind: 'guidance',
      lines: [
        'Do not raise these before they have agreed to the core. Raising them early makes the whole thing look expensive and kills deals.',
        ...upsells.slice(0, 3).map((u) => `• ${u.point}`),
      ],
    });
  }

  blocks.push({
    heading: 'Close — always leave with a next step',
    kind: 'spoken',
    lines: [
      "Can I put something together showing you exactly what I mean, and send it over?",
      'What\'s the best email for you? And when are you usually easiest to catch — is later this week alright?',
    ],
  });

  blocks.push({
    heading: 'Before you hang up',
    kind: 'guidance',
    lines: [
      'Log the call on this page while it is still fresh, set the follow-up date, and move the status on. A call you do not write down did not happen.',
    ],
  });

  return blocks;
}

/** The whole script as plain text, for the copy button. */
export function callScriptToText(blocks: ScriptBlock[], company: string): string {
  return [
    `CALL SCRIPT — ${company}`,
    '',
    ...blocks.flatMap((b) => [
      `${b.heading.toUpperCase()}${b.kind === 'guidance' ? '  (do not read out — for you)' : ''}`,
      ...b.lines,
      '',
    ]),
  ].join('\n');
}
