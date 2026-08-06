import { describe, expect, it } from 'vitest';

/**
 * The onboarding form worked and did nothing.
 *
 * Adding a question wrote a row; nothing told the client, so they found it
 * only by opening a tab they had no reason to open, and "Awaiting answer" sat
 * on the project forever with no way to chase it. Whoever wrote the question
 * typed the answers as one comma-separated string — a storage format handed
 * to a person.
 *
 * These hold the vocabulary both sides now share.
 */

import {
  MULTI_SEPARATOR,
  ONBOARDING_PRESETS,
  ONBOARDING_TYPES,
  YES_NO,
  onboardingProgress,
  onboardingType,
  parseAnswer,
  parseOptions,
  serializeAnswer,
  serializeOptions,
} from '@/lib/onboarding';

describe('the question types', () => {
  it('says which ones need answers supplying and which do not', () => {
    expect(onboardingType('select').needsOptions).toBe(true);
    expect(onboardingType('multi').needsOptions).toBe(true);
    expect(onboardingType('text').needsOptions).toBe(false);
    // The two answers are the question — asking somebody to type them is
    // asking them to type "Yes, No" every time.
    expect(onboardingType('yesno').needsOptions).toBe(false);
  });

  it('falls back to a short answer rather than rendering nothing', () => {
    expect(onboardingType('something-invented').value).toBe('text');
  });

  it('explains each type, so the choice is not a guess', () => {
    for (const type of ONBOARDING_TYPES) {
      expect(type.hint.length, type.value).toBeGreaterThan(15);
    }
  });
});

describe('options', () => {
  it('round-trips through the comma storage the database already uses', () => {
    const options = ['We control it', 'Our old developer has it', 'Not sure'];

    expect(parseOptions(serializeOptions(options))).toEqual(options);
  });

  it('supplies yes and no without anybody typing them', () => {
    expect(parseOptions('', 'yesno')).toEqual(YES_NO);
  });

  it('survives the shapes a hand-edited row can be in', () => {
    expect(parseOptions(null)).toEqual([]);
    expect(parseOptions('  ')).toEqual([]);
    expect(parseOptions('a, ,b,')).toEqual(['a', 'b']);
  });

  /**
   * The bug, found on a client's dashboard rather than in a test.
   *
   * The old field asked for "Options, comma-separated", so an option was not
   * allowed to contain a comma — and the first real one did. "Yes, and it
   * stays" rendered to the client as two separate answers, "Yes" and "and it
   * stays", which is nonsense sitting in front of a customer.
   */
  it('keeps an option that contains a comma in one piece', () => {
    const written = ['Yes, and it stays', 'Yes, but replace it', 'No system today'];

    expect(parseOptions(serializeOptions(written))).toEqual(written);
  });

  /** Rows written before the separator changed still mean what they meant. */
  it('still reads the comma-separated rows already in the database', () => {
    expect(parseOptions('Short,Medium,Long')).toEqual(['Short', 'Medium', 'Long']);
  });
});

describe('answers', () => {
  /** A "pick any" question stores several answers in one column. */
  it('keeps several answers to one question distinct', () => {
    const picked = ['Home', 'About', 'Contact'];

    expect(parseAnswer(serializeAnswer(picked, 'multi'), 'multi')).toEqual(picked);
  });

  /**
   * The separator is not a comma on purpose: an answer can contain one, and
   * splitting on it would quietly turn one answer into two.
   */
  it('does not split an answer that happens to contain a comma', () => {
    const stored = serializeAnswer(['Yes, but only on weekdays'], 'select');

    expect(parseAnswer(stored, 'select')).toEqual(['Yes, but only on weekdays']);
    expect(MULTI_SEPARATOR).not.toBe(',');
  });

  it('reads an unanswered question as no answers, not as one empty one', () => {
    expect(parseAnswer(null, 'text')).toEqual([]);
    expect(parseAnswer('', 'multi')).toEqual([]);
  });
});

describe('how far through they are', () => {
  const q = (answered: boolean) => ({ response: answered ? { answer: 'x' } : null });

  it('counts what is left, in words a person reads', () => {
    expect(onboardingProgress([q(true), q(false), q(false)]).line).toContain('1 of 3');
    expect(onboardingProgress([q(true), q(true)]).line).toMatch(/All 2 answered/);
    expect(onboardingProgress([q(false)]).line).toMatch(/none answered yet/);
  });

  it('is not done when there is nothing to do', () => {
    // An empty form must not congratulate anybody.
    expect(onboardingProgress([]).done).toBe(false);
    expect(onboardingProgress([q(true)]).done).toBe(true);
  });
});

describe('the starting points', () => {
  /**
   * A blank box asks whoever is here to invent an onboarding process from
   * nothing every time, which is why in practice one question got written and
   * the rest never did.
   */
  it('offers the questions that actually block work', () => {
    expect(ONBOARDING_PRESETS.length).toBeGreaterThan(6);
    expect(new Set(ONBOARDING_PRESETS.map((p) => p.group)).size).toBeGreaterThan(1);
  });

  it('supplies the answers for every preset that needs them', () => {
    for (const preset of ONBOARDING_PRESETS) {
      if (!onboardingType(preset.type).needsOptions) continue;
      expect(preset.options?.length ?? 0, preset.question).toBeGreaterThan(1);
    }
  });

  it('asks each one only once', () => {
    const asked = ONBOARDING_PRESETS.map((p) => p.question);
    expect(new Set(asked).size).toBe(asked.length);
  });
});

/**
 * The types the form offers and the types the API accepts have to be the
 * same list.
 *
 * They were not: the route kept its own copy of three, the form grew to five,
 * and adding a "pick any" question failed with "Question text and a valid
 * type are required" — a message that names neither the type nor the fact
 * that it was the type. Found by clicking the button, not by any test.
 */
describe('the API and the form agree on what a question can be', () => {
  it('accepts every type the builder offers', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(
      'app/api/admin/projects/[projectId]/onboarding/route.ts',
      'utf8'
    );

    // Derived from the shared list rather than a second copy of it.
    expect(source).toContain('ONBOARDING_TYPES');
    expect(source).not.toMatch(/VALID_TYPES = \['text'/);
  });
});
