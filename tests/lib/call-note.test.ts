import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A note typed one-handed between calls is the part of logging a call that
 * actually costs effort, and the part that gets skipped. Handing it to a
 * model is only worth doing if what comes back can't quietly become the
 * record — so the guarantees here are about what it refuses to accept, not
 * about the prose.
 */

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...args: unknown[]) => create(...args) };
  },
}));

const { canTidyCallNotes, tidyCallNote } = await import('@/lib/call-note');

const reply = (body: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(body) }] });

const INPUT = {
  raw: 'spoke to mgr not owner, owner back mon, uses square hates it, maybe 5k, wants restaurant examples',
  company: 'Linpotia Cafe',
  contactName: 'Frell Handa',
  outcomeLabel: 'Spoke — interested',
  today: '2026-08-05',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
});

describe('canTidyCallNotes', () => {
  it('is off when no key is configured, so the button never appears', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    expect(canTidyCallNotes()).toBe(false);
  });

  it('is on once a key is set', () => {
    expect(canTidyCallNotes()).toBe(true);
  });
});

describe('tidyCallNote', () => {
  it('refuses to run at all without a key rather than failing mid-call', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    await expect(tidyCallNote(INPUT)).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns the note, the next step and the date it found', async () => {
    create.mockResolvedValue(
      reply({
        note: 'Spoke to the manager rather than the owner, who is back on Monday. They use Square for booking and dislike it. Budget of around $5,000 was mentioned.',
        nextStep: 'Send three examples of restaurant sites',
        followUpDate: '2026-08-10',
      })
    );

    const result = await tidyCallNote(INPUT);

    expect(result.note).toContain('Square');
    expect(result.nextStep).toBe('Send three examples of restaurant sites');
    expect(result.followUpDate).toBe('2026-08-10');
  });

  /**
   * A date is the one field here that changes what the system does — it sets
   * when the lead resurfaces. Anything that isn't plainly a date is dropped
   * rather than passed along to be parsed by something downstream.
   */
  it('drops a date that is not a date, instead of passing it on', async () => {
    for (const bad of ['next Monday', 'soon', '10/08/2026', '2026-8-5', '', 42, undefined]) {
      create.mockResolvedValue(reply({ note: 'Spoke to them.', nextStep: '', followUpDate: bad }));

      expect((await tidyCallNote(INPUT)).followUpDate).toBeNull();
    }
  });

  it('tells the model what day it is, so "Monday" can resolve to one', async () => {
    create.mockResolvedValue(reply({ note: 'x', nextStep: '', followUpDate: null }));

    await tidyCallNote(INPUT);

    const sent = create.mock.calls[0][0];
    expect(sent.messages[0].content).toContain('2026-08-05');
    // And who the call was with, so the note can name them.
    expect(sent.messages[0].content).toContain('Frell Handa');
    expect(sent.messages[0].content).toContain('Linpotia Cafe');
  });

  it('constrains the answer to the shape the page expects', async () => {
    create.mockResolvedValue(reply({ note: 'x', nextStep: '', followUpDate: null }));

    await tidyCallNote(INPUT);

    const sent = create.mock.calls[0][0];
    expect(sent.model).toBe('claude-opus-5');
    expect(sent.output_config.format.type).toBe('json_schema');
    expect(sent.output_config.format.schema.required).toEqual(['note', 'nextStep', 'followUpDate']);
  });

  it('surfaces an empty answer as a failure rather than wiping the rep\'s note', async () => {
    create.mockResolvedValue({ content: [] });

    await expect(tidyCallNote(INPUT)).rejects.toThrow();
  });
});
