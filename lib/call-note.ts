import Anthropic from '@anthropic-ai/sdk';
import { anthropicApiKey } from '@/lib/env';

/**
 * What a rep scribbled during a call, turned into the record.
 *
 * Logging a call already takes one tap — the outcome buttons carry the
 * status and the follow-up date with them. The note is the part that still
 * costs real effort, and it is the part that gets skipped: typed one-handed
 * between calls, it comes out as "spoke to mgr not owner back mon square
 * booking hates it maybe 5k wants restaurant examples". That is enough for
 * the person who wrote it, that day. It is worthless to whoever opens the
 * lead three weeks later, and worthless to the brief that gets read before
 * the next call.
 *
 * So this reads the scribble and gives back the three things buried in it:
 * the note as a sentence, the next thing to do, and the date they actually
 * named. Nothing is saved from here — it fills the fields on screen and the
 * rep sends it, edits it, or throws it away. A model that misreads a
 * shorthand note is a wrong sentence a person can see and fix, not a wrong
 * record nobody notices.
 */

export interface TidiedCallNote {
  /** The note as a sentence, in the rep's own facts. */
  note: string;
  /** The next concrete action, or empty when the note names none. */
  nextStep: string;
  /** ISO date (YYYY-MM-DD) if the note names a day, else null. */
  followUpDate: string | null;
}

export interface TidyCallNoteInput {
  raw: string;
  company: string;
  contactName?: string | null;
  /** What the rep picked — "Spoke — interested", etc. */
  outcomeLabel: string;
  /** Today, as the model sees it, so "Monday" resolves to a real date. */
  today: string;
}

/** Whether the feature can run at all — used to hide the button rather than fail it. */
export function canTidyCallNotes(): boolean {
  return anthropicApiKey() !== null;
}

const SCHEMA = {
  type: 'object' as const,
  properties: {
    note: {
      type: 'string' as const,
      description:
        'The call note as one short paragraph of plain sentences. Third person, past tense, no bullet points, no headings.',
    },
    nextStep: {
      type: 'string' as const,
      description:
        'The single next action, as an imperative — "Send three restaurant examples". Empty string when the note names none.',
    },
    followUpDate: {
      type: ['string', 'null'] as const,
      description:
        'The date the note names, as YYYY-MM-DD. Null when no day is mentioned. Never invent one from a general sense of urgency.',
    },
  },
  required: ['note', 'nextStep', 'followUpDate'],
  additionalProperties: false,
};

const SYSTEM = `You clean up notes a salesperson typed during or just after a phone call, for a small web design studio.

The note is shorthand, written fast, often without punctuation. Your job is to make it readable by someone who was not on the call, without changing what it says.

Rules:
- Use only what is in the note. Never add detail, motive, or outcome that is not there. If the note is vague, the tidy version is vague.
- Keep every specific: names, numbers, prices, tools, dates, objections, the exact thing they asked for. Those are the whole value of the note.
- Expand shorthand the writer would recognise ("mgr" to "the manager", "dm" to "the decision maker"). Do not expand something you would be guessing at.
- Plain sentences. No bullet points, no headings, no "Summary:" preamble, no closing commentary.
- Third person, past tense. "Spoke to the manager" rather than "I spoke to the manager".
- Do not restate the call outcome — it is already recorded separately.
- A date is only a date if they named a day. "Call back Monday" is a date; "call back soon" is not.`;

/**
 * Reads a raw note and returns the tidied version.
 *
 * Throws when the key is missing or the call fails — the route turns that
 * into a message beside the box, because the rep still has a note to log
 * either way and should not be blocked by this.
 */
export async function tidyCallNote(input: TidyCallNoteInput): Promise<TidiedCallNote> {
  const apiKey = anthropicApiKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const client = new Anthropic({ apiKey });

  const who = input.contactName ? `${input.contactName} at ${input.company}` : input.company;

  const response = await client.messages.create({
    model: 'claude-opus-5',
    // Room for the model to think and answer. The note itself is tiny; this
    // is not the ceiling that matters.
    max_tokens: 4096,
    // A short, scoped rewrite, run while someone is waiting to finish
    // logging a call and dial the next one — latency is worth more here
    // than deliberation.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Call with ${who}. Outcome recorded as "${input.outcomeLabel}". Today is ${input.today}.

The note as typed:
${input.raw}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('No answer came back');

  const parsed = JSON.parse(block.text) as TidiedCallNote;
  return {
    note: String(parsed.note ?? '').trim(),
    nextStep: String(parsed.nextStep ?? '').trim(),
    // A model naming a date outside the format is a date we don't trust.
    followUpDate:
      typeof parsed.followUpDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.followUpDate)
        ? parsed.followUpDate
        : null,
  };
}
