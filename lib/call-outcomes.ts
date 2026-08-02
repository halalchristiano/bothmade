import type { LeadStatus } from '@/lib/leads';

/**
 * What actually happened on a call, and everything that should follow from
 * it.
 *
 * Wrapping up a call previously meant three separate jobs: writing an
 * activity note, moving the status, and setting a follow-up date. Three
 * chances to forget, done between calls when nobody wants to do admin — and
 * a lead with no follow-up date set is a lead nobody ever rings again.
 *
 * Each outcome here carries the whole consequence, so one tap records the
 * note, advances the status where it should advance, and books the next
 * contact. `followUpDays: null` means the rep is asked for a date instead of
 * one being assumed.
 */
export interface CallOutcome {
  key: string;
  label: string;
  /** Shown under the button so the rep knows which one to pick. */
  hint: string;
  /** Written into the activity log. */
  note: string;
  /** Only applied when it moves the lead forward — never backwards. */
  status: LeadStatus | null;
  followUpDays: number | null;
  /** true = ask for a specific date (a booked meeting, a "ring me Tuesday"). */
  askForDate?: boolean;
  tone: 'good' | 'neutral' | 'bad';
}

export const CALL_OUTCOMES: CallOutcome[] = [
  {
    key: 'no-answer',
    label: 'No answer',
    hint: 'Rang out, nobody picked up',
    note: 'Called — no answer.',
    status: 'contacted',
    followUpDays: 2,
    tone: 'neutral',
  },
  {
    key: 'voicemail',
    label: 'Left voicemail',
    hint: 'Left a message',
    note: 'Called — left a voicemail.',
    status: 'contacted',
    followUpDays: 3,
    tone: 'neutral',
  },
  {
    key: 'gatekeeper',
    label: 'Got the gatekeeper',
    hint: "Reception — didn't reach the decision maker",
    note: 'Called — reached reception, not the decision maker.',
    status: 'contacted',
    followUpDays: 2,
    tone: 'neutral',
  },
  {
    key: 'spoke-callback',
    label: 'Spoke — call me back',
    hint: 'Reached them, but they asked for another time',
    note: 'Spoke to them — asked to be called back at a better time.',
    status: 'contacted',
    followUpDays: null,
    askForDate: true,
    tone: 'neutral',
  },
  {
    key: 'spoke-interested',
    label: 'Spoke — interested',
    hint: 'Had a real conversation, they want to know more',
    note: 'Spoke to them — interested, wants to see more.',
    status: 'replied',
    followUpDays: 2,
    tone: 'good',
  },
  {
    key: 'sending-proposal',
    label: 'Sending a proposal',
    hint: 'Agreed to receive pricing',
    note: 'Spoke to them — agreed to receive a proposal.',
    status: 'qualified',
    followUpDays: 3,
    tone: 'good',
  },
  {
    key: 'meeting-booked',
    label: 'Booked a meeting',
    hint: 'A specific time is in the diary',
    note: 'Spoke to them — meeting booked.',
    status: 'qualified',
    followUpDays: null,
    askForDate: true,
    tone: 'good',
  },
  {
    key: 'not-interested',
    label: 'Not interested',
    hint: 'A clear no — mark it and move on',
    note: 'Called — not interested.',
    status: 'lost',
    followUpDays: null,
    tone: 'bad',
  },
  {
    key: 'wrong-number',
    label: 'Wrong / dead number',
    hint: 'Disconnected or the wrong business',
    note: 'Called — number is wrong or disconnected.',
    status: null,
    followUpDays: null,
    tone: 'bad',
  },
];

export function findCallOutcome(key: string): CallOutcome | undefined {
  return CALL_OUTCOMES.find((o) => o.key === key);
}
