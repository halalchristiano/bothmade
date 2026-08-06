/**
 * The form we send a client after they enquire, and what their answers become.
 *
 * The enquiry form on the website is deliberately short — anything longer and
 * people abandon it. This is the second step: a link mailed to them straight
 * after, where the questions can be as thorough as the brief needs, because by
 * then they have already decided to talk to us.
 *
 * Radio buttons almost throughout, on purpose. Free text has to be read,
 * interpreted and re-typed into structured fields by somebody before it is
 * worth anything; a picked option lands directly in the column the brief, the
 * CSV export and the pricing all already read. The one text box is for the
 * thing no list anticipated.
 *
 * No prices anywhere. What any of it costs depends on answers this form is
 * collecting, and a number shown before that conversation is a number argued
 * with instead of a problem discussed.
 */

import { PAIN_POINTS, type PainPointKey, isPainPointKey } from '@/lib/leads';

/** One radio group: a question, and the answers it accepts. */
export interface BriefQuestion {
  /** Matches the lead column the answer lands in. */
  key: BriefAnswerKey;
  question: string;
  /** Said under the question when the question alone is not enough. */
  hint?: string;
  options: Array<{ value: string; label: string }>;
}

export type BriefAnswerKey =
  | 'companySize'
  | 'industry'
  | 'priority'
  | 'authority'
  | 'timing'
  | 'consequence'
  | 'look'
  | 'feel'
  | 'audience';

export const BRIEF_QUESTIONS: BriefQuestion[] = [
  {
    key: 'priority',
    question: 'If we could only fix one thing, what should it be?',
    hint: 'Everything else still gets done. This just tells us what to build first.',
    options: [
      { value: 'be-found', label: 'Being found — people cannot find us in the first place' },
      { value: 'look-right', label: 'Looking right — we are judged badly before anyone reads a word' },
      { value: 'get-enquiries', label: 'Getting enquiries — people visit and then do nothing' },
      { value: 'save-time', label: 'Saving time — too much of this is done by hand' },
      { value: 'sell-online', label: 'Selling online — we want to take money without a phone call' },
    ],
  },
  {
    key: 'companySize',
    question: 'How many people work there?',
    options: [
      { value: 'solo', label: 'Just me' },
      { value: 'small', label: '2 to 10' },
      { value: 'medium', label: '11 to 50' },
      { value: 'large', label: '51 to 200' },
      { value: 'enterprise', label: 'More than 200' },
    ],
  },
  {
    key: 'industry',
    question: 'What kind of business is it?',
    hint: 'Roughly is fine — it changes what we look at, not what we charge.',
    options: [
      { value: 'Trades & home services', label: 'Trades and home services' },
      { value: 'Construction & property', label: 'Construction or property' },
      { value: 'Health & clinical', label: 'Health, dental or clinical' },
      { value: 'Professional services', label: 'Professional services — legal, finance, consulting' },
      { value: 'Retail & hospitality', label: 'Retail, food or hospitality' },
      { value: 'Other', label: 'Something else' },
    ],
  },
  {
    key: 'authority',
    question: 'Who decides whether this goes ahead?',
    hint: 'Not a test — it tells us who should be on the call so nothing gets repeated twice.',
    options: [
      { value: 'Me alone', label: 'Me, on my own' },
      { value: 'Me with a partner', label: 'Me, with a business partner' },
      { value: 'A board or owner', label: 'Someone above me signs it off' },
      { value: 'Still working it out', label: 'We have not worked that out yet' },
    ],
  },
  {
    key: 'timing',
    question: 'When would you want it live?',
    options: [
      { value: 'Yesterday', label: 'Yesterday — something is actively costing us' },
      { value: 'Within 3 months', label: 'Next couple of months' },
      { value: 'This year', label: 'Sometime this year' },
      { value: 'Just looking', label: 'No date — finding out what is involved' },
    ],
  },
  {
    key: 'consequence',
    question: 'If nothing changes, what happens?',
    hint: 'The honest answer is useful. "Nothing much" is a real answer.',
    options: [
      { value: 'Losing work to competitors', label: 'We keep losing work to competitors' },
      { value: 'Wasting staff time', label: 'We keep burning staff time on it' },
      { value: 'Cannot grow', label: 'We cannot grow past where we are' },
      { value: 'Nothing much', label: 'Honestly, nothing much — it just bothers me' },
    ],
  },
  /*
   * How it should look, asked at the enquiry rather than three weeks later.
   *
   * These are the same three things the design brief asks before anybody
   * opens a design tool — the look, the feeling, who it is talking to. Asked
   * here they cost the client one more tap while they are already answering,
   * and they mean the concept starts from something they said rather than
   * from a guess. They are a starting point and the brief still gets signed
   * properly; nothing here fixes the direction.
   */
  {
    key: 'look',
    question: 'Which of these is closest to how you want it to look?',
    hint: 'A starting point, not a decision — we go through this properly before designing.',
    options: [
      { value: 'Clean and minimal', label: 'Clean and minimal — lots of space, nothing shouting' },
      { value: 'Bold and modern', label: 'Bold and modern — big type, strong colour' },
      { value: 'Warm and traditional', label: 'Warm and traditional — established, trustworthy' },
      { value: 'Premium and understated', label: 'Premium and understated — quiet, expensive-looking' },
      { value: 'Not sure yet', label: 'No idea — show me options' },
    ],
  },
  {
    key: 'feel',
    question: 'When somebody lands on it, what should they think?',
    options: [
      { value: 'These people are the experts', label: 'These people know what they are doing' },
      { value: 'This is a big, established company', label: 'This is a serious, established company' },
      { value: 'These people are easy to deal with', label: 'These people would be easy to deal with' },
      { value: 'This is good value', label: 'This is good value for money' },
      { value: 'This is the premium option', label: 'This is the expensive one, and worth it' },
    ],
  },
  {
    key: 'audience',
    question: 'Who is it mostly for?',
    hint: 'It changes the wording, the layout and how much explaining it has to do.',
    options: [
      { value: 'Local customers', label: 'Local customers finding us nearby' },
      { value: 'Other businesses', label: 'Other businesses' },
      { value: 'A national audience', label: 'Customers anywhere in the country' },
      { value: 'Existing customers', label: 'Mostly people who already use us' },
      { value: 'A mix', label: 'A real mix' },
    ],
  },
];

/**
 * What the new site has to let people actually do.
 *
 * The problem tick boxes say what is wrong; these say what "fixed" looks
 * like, which is a different question and the one that decides scope. Tick
 * boxes rather than radio because real answers are several of these at once.
 */
export const WANTED_CAPABILITIES: Array<{ key: string; label: string }> = [
  { key: 'book', label: 'Book or request an appointment without ringing' },
  { key: 'quote', label: 'Ask for a quote or estimate' },
  { key: 'buy', label: 'Buy something and pay for it' },
  { key: 'browse-work', label: 'See examples of our work' },
  { key: 'prices', label: 'Find out what things cost' },
  { key: 'find-us', label: 'Find us on Google in the first place' },
  { key: 'self-serve', label: 'Answer their own questions without emailing us' },
  { key: 'accounts', label: 'Log in and see their own information' },
];

/** What comes back off the form, before it is trusted. */
export interface BriefSubmission {
  problems: PainPointKey[];
  answers: Partial<Record<BriefAnswerKey, string>>;
  /** Keys from WANTED_CAPABILITIES — what the new site has to let people do. */
  wants: string[];
  extra: string;
}

/**
 * Keeps only answers that are on the list.
 *
 * A hand-made POST is the obvious way to write junk into a lead's brief, and
 * the brief is what somebody reads before ringing a stranger — so an
 * unrecognised value is dropped rather than stored.
 */
export function parseBriefSubmission(body: unknown): BriefSubmission {
  const raw = (body ?? {}) as Record<string, unknown>;

  const problems: PainPointKey[] = Array.isArray(raw.problems)
    ? [...new Set(raw.problems.filter((p): p is PainPointKey => typeof p === 'string' && isPainPointKey(p)))]
    : [];

  const answers: Partial<Record<BriefAnswerKey, string>> = {};
  const given = (raw.answers ?? {}) as Record<string, unknown>;
  for (const question of BRIEF_QUESTIONS) {
    const value = given[question.key];
    if (typeof value === 'string' && question.options.some((o) => o.value === value)) {
      answers[question.key] = value;
    }
  }

  const offered = new Set(WANTED_CAPABILITIES.map((c) => c.key));
  const wants = Array.isArray(raw.wants)
    ? [...new Set(raw.wants.filter((w): w is string => typeof w === 'string' && offered.has(w)))]
    : [];

  return {
    problems,
    answers,
    wants,
    extra: typeof raw.extra === 'string' ? raw.extra.trim().slice(0, 4000) : '',
  };
}

function labelFor(key: BriefAnswerKey, value: string | undefined): string | null {
  if (!value) return null;
  const question = BRIEF_QUESTIONS.find((q) => q.key === key);
  return question?.options.find((o) => o.value === value)?.label ?? null;
}

/**
 * The lead columns a submission fills.
 *
 * Deliberately the same columns the research CSV imports into, so a lead
 * briefed by the client and a lead briefed by a researcher are the same shape
 * — the sales page, the pricing and the export cannot tell them apart, and
 * nothing needs a second code path.
 */
export function briefToLeadFields(submission: BriefSubmission): {
  painPoints: string;
  companySize: string | null;
  industry: string | null;
  qualNeed: string | null;
  qualAuthority: string | null;
  qualTiming: string | null;
  qualMotivation: string | null;
  currentSiteAssessment: string;
} {
  const { answers, problems, extra } = submission;

  const lines: string[] = [];
  if (problems.length > 0) {
    lines.push('What they say is wrong:');
    for (const key of problems) lines.push(`• ${PAIN_POINTS[key]}`);
  }
  // What "fixed" looks like, which is the half that decides scope. The
  // problems say what hurts; these say what the thing has to do instead.
  if (submission.wants.length > 0) {
    lines.push('');
    lines.push('What it has to let people do:');
    for (const key of submission.wants) {
      const item = WANTED_CAPABILITIES.find((c) => c.key === key);
      if (item) lines.push(`• ${item.label}`);
    }
  }
  const priority = labelFor('priority', answers.priority);
  if (priority) {
    lines.push('');
    lines.push(`Fix first: ${priority}`);
  }
  /*
   * The look, in their words, at the moment they were willing to answer.
   *
   * Whoever builds the concept reads this before opening a design tool, and
   * it is the difference between a first version aimed at something they
   * said and one aimed at a guess.
   */
  const look = labelFor('look', answers.look);
  const feel = labelFor('feel', answers.feel);
  const audience = labelFor('audience', answers.audience);
  if (look || feel || audience) {
    lines.push('');
    lines.push('How they want it to come across:');
    if (look) lines.push(`• Look: ${look}`);
    if (feel) lines.push(`• Should say: ${feel}`);
    if (audience) lines.push(`• Mostly for: ${audience}`);
  }
  if (extra) {
    lines.push('');
    lines.push(`In their words: "${extra}"`);
  }

  return {
    painPoints: problems.join(','),
    companySize: answers.companySize ?? null,
    industry: answers.industry ?? null,
    qualNeed: labelFor('consequence', answers.consequence),
    qualAuthority: labelFor('authority', answers.authority),
    qualTiming: labelFor('timing', answers.timing),
    qualMotivation: priority,
    currentSiteAssessment: lines.join('\n'),
  };
}

/** Whether enough was answered to be worth writing to the lead at all. */
export function isWorthRecording(submission: BriefSubmission): boolean {
  return (
    submission.problems.length > 0 ||
    submission.wants.length > 0 ||
    Object.keys(submission.answers).length > 0 ||
    submission.extra.length > 0
  );
}
