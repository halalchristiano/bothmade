/**
 * The questions a client answers before work starts.
 *
 * The form worked and did nothing. Adding a question wrote a row; nobody was
 * told, so the client only found it if they happened to open the tab, and
 * "awaiting answer" sat there forever with no way to chase it. Meanwhile
 * whoever wrote the question typed the choices as one comma-separated string,
 * which is a data-entry format, not an interface.
 *
 * This is the vocabulary both sides share: what a question can be, what the
 * options actually are once parsed, and a set of starting points so the first
 * question on a project is one click rather than a blank box and a decision.
 */

/**
 * The order the questions are asked in, which for a long time was no order.
 *
 * Both list queries sorted on `order` alone, and nothing ever set it: the
 * builder posts a question and a type, the create route defaulted the column
 * to 0, and so every row on every project carried the same value. A sort key
 * with one distinct value is not a sort — Postgres is free to return ties in
 * whatever order the heap has them in, and it changes. So the client's form
 * could ask for their brand palette before it asked what the company is
 * called, and could ask in a different order the next time they opened it,
 * which reads as a form that has lost its place.
 *
 * `createdAt` is the tiebreak rather than the fix. New questions get a real
 * position from the create route, but every question written before that
 * still has a 0 in the column and always will; falling through to when it was
 * added puts those in the order somebody typed them, which is the order they
 * meant. Exported so the two routes that list this form cannot drift apart —
 * the client answering in one order while the studio reads the answers back
 * in another is its own small confusion.
 */
export const ONBOARDING_ORDER = [{ order: 'asc' }, { createdAt: 'asc' }] as const;

export type OnboardingType = 'text' | 'textarea' | 'select' | 'multi' | 'yesno';

export interface OnboardingTypeSpec {
  value: OnboardingType;
  label: string;
  hint: string;
  /** Whether the author has to supply the answers to choose from. */
  needsOptions: boolean;
}

export const ONBOARDING_TYPES: OnboardingTypeSpec[] = [
  {
    value: 'text',
    label: 'Short answer',
    hint: 'A name, a URL, a number.',
    needsOptions: false,
  },
  {
    value: 'textarea',
    label: 'Long answer',
    hint: 'A paragraph — background, preferences, anything with nuance.',
    needsOptions: false,
  },
  {
    value: 'select',
    label: 'Pick one',
    hint: 'A list of answers where exactly one is right.',
    needsOptions: true,
  },
  {
    value: 'multi',
    label: 'Pick any',
    hint: 'A list where several answers can be true at once.',
    needsOptions: true,
  },
  {
    value: 'yesno',
    label: 'Yes or no',
    hint: 'Nothing to type — the two answers are the question.',
    needsOptions: false,
  },
];

export function onboardingType(value: string): OnboardingTypeSpec {
  return ONBOARDING_TYPES.find((t) => t.value === value) ?? ONBOARDING_TYPES[0];
}

/** The two answers a yes/no question offers, so both sides render the same pair. */
export const YES_NO = ['Yes', 'No'];

/** Several answers in one column, and the separator none of them contain. */
export const MULTI_SEPARATOR = ' · ';

/**
 * Options live in one string, and a comma cannot be what divides them.
 *
 * The old field asked for "Options, comma-separated", so an option was not
 * allowed to contain a comma — and the first real one did. "Yes, and it
 * stays" rendered on the client's dashboard as two separate answers, "Yes"
 * and "and it stays", which is nonsense sitting in front of a customer.
 *
 * New rows are divided by the same separator the multi answers use, which no
 * option realistically contains. Old rows have no separator in them and are
 * still split on the comma they were written with — so nothing already stored
 * changes meaning, and nothing written from now on can be mangled.
 */
export function parseOptions(raw: string | null | undefined, type?: string): string[] {
  if (type === 'yesno') return [...YES_NO];
  const value = raw ?? '';
  const parts = value.includes(MULTI_SEPARATOR) ? value.split(MULTI_SEPARATOR) : value.split(',');
  return parts.map((o) => o.trim()).filter(Boolean);
}

export function serializeOptions(options: string[]): string {
  return options
    .map((o) => o.trim())
    .filter(Boolean)
    .join(MULTI_SEPARATOR);
}

export function parseAnswer(answer: string | null | undefined, type: string): string[] {
  if (!answer) return [];
  return type === 'multi' ? answer.split(MULTI_SEPARATOR).filter(Boolean) : [answer];
}

export function serializeAnswer(values: string[], type: string): string {
  return type === 'multi' ? values.join(MULTI_SEPARATOR) : values[0] ?? '';
}

/**
 * Questions worth asking on almost every project, as one click each.
 *
 * A blank box asks the author to invent an onboarding process from nothing
 * every time, so in practice one question gets written and the rest never do.
 * These are the ones that actually block work when they are missing —
 * credentials, content, who decides — grouped so the list can be skimmed.
 */
export interface OnboardingPreset {
  group: string;
  question: string;
  type: OnboardingType;
  options?: string[];
}

export const ONBOARDING_PRESETS: OnboardingPreset[] = [
  {
    group: 'Access',
    question: 'Who currently controls your domain name, and can you get into that account?',
    type: 'select',
    options: ['We control it', 'Our old developer has it', 'Not sure', 'We do not have one yet'],
  },
  {
    group: 'Access',
    question: 'Where is your website hosted at the moment?',
    type: 'text',
  },
  {
    group: 'Access',
    question: 'Do you have a Google Business Profile we should keep in step with the site?',
    type: 'yesno',
  },
  {
    group: 'Content',
    question: 'Do you have professional photography we can use, or should we plan around stock?',
    type: 'select',
    options: ['We have photography', 'Some, not enough', 'None — plan around stock'],
  },
  {
    group: 'Content',
    question: 'Who is writing the words for each page?',
    type: 'select',
    options: ['We will write it', 'We want you to write it', 'A mix — we will say which'],
  },
  {
    group: 'Content',
    question: 'Do you have a logo and brand colours we have to design around?',
    type: 'yesno',
  },
  {
    group: 'Content',
    question: 'Which pages does the site need?',
    type: 'multi',
    options: ['Home', 'About', 'Services', 'Work or portfolio', 'Pricing', 'Blog', 'Contact', 'FAQ'],
  },
  {
    group: 'How you work',
    question: 'Who signs things off, and is anybody else involved in that decision?',
    type: 'textarea',
  },
  {
    group: 'How you work',
    question: 'Where should new enquiries go?',
    type: 'text',
  },
  {
    group: 'How you work',
    question: 'Is there a date you need this live by, and what is driving it?',
    type: 'textarea',
  },
];

/** How far through they are, for a progress line neither side had. */
export function onboardingProgress(questions: Array<{ response?: unknown | null }>): {
  answered: number;
  total: number;
  done: boolean;
  line: string;
} {
  const total = questions.length;
  const answered = questions.filter((q) => q.response).length;
  const left = total - answered;

  return {
    answered,
    total,
    done: total > 0 && left === 0,
    line:
      total === 0
        ? 'No questions yet.'
        : left === 0
          ? `All ${total} answered.`
          : answered === 0
            ? `${total} question${total === 1 ? '' : 's'}, none answered yet.`
            : `${answered} of ${total} answered — ${left} to go.`,
  };
}
