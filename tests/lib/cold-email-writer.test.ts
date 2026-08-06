import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The rule that outranks the writing.
 *
 * A model asked to sound personal will produce "I noticed your site hasn't
 * been updated since 2019" about a business nobody looked at, and that email
 * goes to a real person who knows it is false — from a studio whose entire
 * pitch is that it pays attention. One invented detail costs more than a
 * hundred generic emails, so the check that catches them is tested harder
 * than anything else here.
 */

const create = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...args: unknown[]) => create(...args) };
  },
}));

vi.mock('@/lib/env', () => ({
  anthropicApiKey: () => 'test-key',
}));

const { writeLeadEmails, findInventedFacts, canWriteEmails } = await import('@/lib/cold-email-writer');

const LEAD = {
  company: 'Rowan Dental',
  industry: 'Dental practice',
  city: 'Austin',
  region: 'TX',
  googleRating: 4.9,
  googleReviewCount: 312,
  painPoints: ['No online booking: every appointment is taken by phone.'],
};

const COLD = `Subject: your booking line after six

Hi [First Name],

I went looking for a dentist in Austin the way a patient does, at nine at night, and I got as far as a phone number.

Four hundred words of perfectly good reason to pick you, and one thing to do about it: ring in the morning.

There's a problem underneath that isn't anyone's fault. A website can list what you do; it cannot take a booking at nine at night, and that is when people decide.

I'd like to build you a homepage concept that does. Free, nothing to pay, no obligation, and you keep the ideas whether or not we ever work together.

Want me to build you one?

[Sender Name]`;

const MOCKUP = `Subject: here it is

Here it is.

The booking is on the homepage rather than behind a phone number, and the reviews sit next to it where they do the most work.

It's a static design rather than a working build, so nothing clicks. I'd rather show you the idea honestly than fake a demo.

Two questions: is same-day booking something you'd want to offer, or does that break the diary?

[Sender Name]`;

const answer = (obj: Record<string, string>) => ({
  content: [{ type: 'text', text: JSON.stringify(obj) }],
});

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue(
    answer({ observation: 'Your reviews are excellent and invisible.', coldEmail: COLD, mockupEmail: MOCKUP })
  );
});

describe('writing both emails', () => {
  it('returns two sendable drafts and the observation', async () => {
    const out = await writeLeadEmails(LEAD);

    expect(out.coldEmail.startsWith('Subject:')).toBe(true);
    expect(out.mockupEmail.startsWith('Subject:')).toBe(true);
    expect(out.observation).toBeTruthy();
  });

  it('gives the model only the facts it was handed', async () => {
    await writeLeadEmails(LEAD);

    const prompt = create.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain('Rowan Dental');
    expect(prompt).toContain('Austin');
    expect(prompt).toContain('312');
    expect(prompt).toContain('No online booking');
    // Nothing about the deal's value reaches the model as something to say.
    expect(prompt).not.toMatch(/\$|estimated value/i);
  });

  it('refuses a draft with no usable subject line', async () => {
    create.mockResolvedValue(
      answer({ observation: 'x', coldEmail: 'Hi there, we are a web design agency.', mockupEmail: MOCKUP })
    );

    await expect(writeLeadEmails(LEAD)).rejects.toThrow(/subject line/i);
  });

  /** The refusal is the feature working, and it has to reach the caller. */
  it('refuses a draft that invented a year', async () => {
    create.mockResolvedValue(
      answer({
        observation: 'x',
        coldEmail: COLD.replace('at nine at night', 'and your site has not changed since 2019'),
        mockupEmail: MOCKUP,
      })
    );

    await expect(writeLeadEmails(LEAD)).rejects.toThrow(/claimed something nobody told it/i);
  });

  it('refuses a promised result', async () => {
    create.mockResolvedValue(
      answer({
        observation: 'x',
        coldEmail: COLD.replace('Want me to build you one?', 'This will double your bookings in 30 days.'),
        mockupEmail: MOCKUP,
      })
    );

    await expect(writeLeadEmails(LEAD)).rejects.toThrow(/claimed something nobody told it/i);
  });

  it('checks the mockup email too, not only the first one', async () => {
    create.mockResolvedValue(
      answer({
        observation: 'x',
        coldEmail: COLD,
        mockupEmail: MOCKUP.replace('Here it is.', 'I rang your front desk on Tuesday.'),
      })
    );

    await expect(writeLeadEmails(LEAD)).rejects.toThrow(/claimed something nobody told it/i);
  });
});

describe('what counts as invented', () => {
  it('allows a number the lead actually carries', () => {
    expect(findInventedFacts('All 312 of those reviews say the same thing.', LEAD)).toEqual([]);
    expect(findInventedFacts('A 4.9 that nobody sees.', LEAD)).toEqual([]);
  });

  it('allows a year we were told about', () => {
    expect(findInventedFacts('Trading since 1998 and it shows.', { ...LEAD, yearFounded: 1998 })).toEqual([]);
  });

  it('catches a metric we do not hold', () => {
    expect(findInventedFacts('Your traffic is going to the wrong page.', LEAD)).toHaveLength(1);
  });

  it('catches a percentage nobody measured', () => {
    expect(findInventedFacts('Around 60% of visitors leave.', LEAD)).toHaveLength(1);
  });

  /** Research prose is a fact we were given, even when it contains a number. */
  it('allows a number that came out of the research itself', () => {
    const lead = {
      ...LEAD,
      currentSiteAssessment: 'Template site, last touched in 2019, no booking.',
    };
    expect(findInventedFacts('The site has not moved since 2019.', lead)).toEqual([]);
  });
});

describe('availability', () => {
  it('is on when there is a key', () => {
    expect(canWriteEmails()).toBe(true);
  });
});

/**
 * A scrape gives you "Dental practice, Austin, 4.9, 312 reviews" and nothing
 * else. Written from that alone an email has one move left — something vague
 * about their online presence — which is the exact email everybody else
 * sends. The trade notes are what stop that, and the line they must not cross
 * is stating a category truth as something somebody checked.
 */
describe('what is true of the trade', () => {
  it('hands over the note for the trade it recognises', async () => {
    await writeLeadEmails({ ...LEAD, industry: 'Cosmetic dentistry' });

    const prompt = create.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toMatch(/late at night on a phone/i);
    expect(prompt).toMatch(/do not quote it/i);
    // The distinction the whole thing rests on.
    expect(prompt).toMatch(/may not state it as something you saw/i);
  });

  it('picks the trade from the company name when there is no industry', async () => {
    await writeLeadEmails({ company: 'Hillcrest Custom Home Builders' });

    const prompt = create.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toMatch(/portfolio is the entire product/i);
  });

  it('sends no trade note at all rather than the wrong one', async () => {
    await writeLeadEmails({ company: 'Norbrook Holdings' });

    const prompt = create.mock.calls[0][0].messages[0].content as string;
    expect(prompt).not.toMatch(/BACKGROUND ON THE TRADE/);
  });

  it('tells a manufacturer apart from a clinic', async () => {
    await writeLeadEmails({ company: 'Ohio Gratings', industry: 'Metal bar grating manufacturing' });
    const manufacturer = create.mock.calls[0][0].messages[0].content as string;
    expect(manufacturer).toMatch(/catalogue is bigger than a website/i);
    expect(manufacturer).not.toMatch(/before-and-after/i);
  });
});
