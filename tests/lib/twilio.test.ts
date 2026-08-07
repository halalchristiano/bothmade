import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CALL_STATUS_WORDS,
  callWasAnswered,
  isTwilioConfigured,
  placeBridgedCall,
  toE164,
  twilioConfig,
  verifyTwilioSignature,
} from '@/lib/twilio';

/**
 * Calls placed through a phone network that reports back.
 *
 * The dial log records that a number was tapped, with nothing to press and no
 * way to skip it — but the browser hands off to the operating system and never
 * hears another word, so a number that rang out and a twenty-minute
 * conversation are identical to it. Routing through a carrier is what closes
 * that gap, and this file holds the two things that have to be exactly right
 * for it to be safe: the number format, and the signature on the webhooks.
 */

const KEYS = {
  TWILIO_ACCOUNT_SID: 'AC_test',
  TWILIO_AUTH_TOKEN: 'tok_test',
  TWILIO_FROM_NUMBER: '+15005550006',
};

beforeEach(() => Object.assign(process.env, KEYS));
afterEach(() => {
  for (const k of Object.keys(KEYS)) delete process.env[k as keyof typeof KEYS];
  vi.unstubAllGlobals();
});

describe('whether it is switched on', () => {
  /**
   * Every deployment without credentials has to keep working exactly as it
   * did. This is an upgrade to how calls are placed, not a dependency the app
   * acquires.
   */
  it('is off unless all three credentials are present', () => {
    expect(isTwilioConfigured()).toBe(true);

    for (const missing of Object.keys(KEYS)) {
      const kept = process.env[missing];
      delete process.env[missing];
      expect(isTwilioConfigured(), `without ${missing}`).toBe(false);
      process.env[missing] = kept;
    }
  });

  it('treats whitespace as absent rather than as a credential', () => {
    process.env.TWILIO_AUTH_TOKEN = '   ';
    expect(twilioConfig()).toBeNull();
  });
});

/**
 * The book is stored as people read it aloud — "(212) 555-0100" — because a
 * rep reads it back over the phone. A carrier accepts one format and rejects
 * everything else outright.
 */
describe('turning a written number into a dialable one', () => {
  it('reads the shapes this book actually contains', () => {
    expect(toE164('(212) 555-0100')).toBe('+12125550100');
    expect(toE164('212-555-0100')).toBe('+12125550100');
    expect(toE164('1 (212) 555-0100')).toBe('+12125550100');
    expect(toE164('+1 212 555 0100')).toBe('+12125550100');
  });

  it('leaves an international number as written', () => {
    expect(toE164('+44 7496 815847')).toBe('+447496815847');
  });

  /**
   * Conservative on purpose. A number this cannot confidently convert must
   * come back null so the call is refused — dialling a guess means a
   * stranger's phone rings and somebody hears a confused hello.
   */
  it('refuses anything it cannot be sure of', () => {
    for (const bad of ['', null, undefined, '555-0100', 'ext. 204', 'call the office', '+12']) {
      expect(toE164(bad), String(bad)).toBeNull();
    }
  });

  it('refuses a number too long to be real', () => {
    expect(toE164('+1234567890123456789')).toBeNull();
  });
});

/**
 * The check that guards the money.
 *
 * These endpoints are public by necessity — a carrier has to reach them — and
 * one answers with an instruction to dial a number. An unverified version
 * could be made to ring anywhere on earth at our expense, which is the whole
 * reason toll fraud is a category.
 */
describe('proving a webhook came from Twilio', () => {
  const URL_ = 'https://bothmade.studio/api/twilio/voice?leadId=lead_1';
  const TOKEN = 'tok_test';

  /** Twilio's scheme: URL, then every param as key-then-value, sorted. */
  const sign = (url: string, params: Record<string, string>, token = TOKEN) =>
    createHmac('sha1', token)
      .update(
        Buffer.from(
          Object.keys(params)
            .sort()
            .reduce((acc, k) => acc + k + params[k], url),
          'utf-8'
        )
      )
      .digest('base64');

  const PARAMS = { CallSid: 'CA123', From: '+15005550006', To: '+12125550100' };

  it('accepts a correctly signed request', () => {
    expect(verifyTwilioSignature(URL_, PARAMS, sign(URL_, PARAMS), TOKEN)).toBe(true);
  });

  it('sorts the parameters, whatever order they arrived in', () => {
    const shuffled = { To: PARAMS.To, CallSid: PARAMS.CallSid, From: PARAMS.From };

    expect(verifyTwilioSignature(URL_, shuffled, sign(URL_, PARAMS), TOKEN)).toBe(true);
  });

  it('refuses a request with no signature at all', () => {
    expect(verifyTwilioSignature(URL_, PARAMS, null, TOKEN)).toBe(false);
    expect(verifyTwilioSignature(URL_, PARAMS, '', TOKEN)).toBe(false);
  });

  /** The attack it exists for: the same signature, a different number. */
  it('refuses a request whose parameters were changed after signing', () => {
    const signature = sign(URL_, PARAMS);

    expect(
      verifyTwilioSignature(URL_, { ...PARAMS, To: '+447700900000' }, signature, TOKEN)
    ).toBe(false);
  });

  it('refuses a signature made for a different URL', () => {
    const signature = sign('https://bothmade.studio/api/twilio/voice?leadId=lead_999', PARAMS);

    expect(verifyTwilioSignature(URL_, PARAMS, signature, TOKEN)).toBe(false);
  });

  it('refuses a signature made with a different token', () => {
    expect(verifyTwilioSignature(URL_, PARAMS, sign(URL_, PARAMS, 'somebody_else'), TOKEN)).toBe(
      false
    );
  });

  /** timingSafeEqual throws on a length mismatch rather than answering. */
  it('answers rather than throwing on a nonsense signature', () => {
    expect(verifyTwilioSignature(URL_, PARAMS, 'not-base64-at-all', TOKEN)).toBe(false);
  });

  it('handles a request with no parameters', () => {
    expect(verifyTwilioSignature(URL_, {}, sign(URL_, {}), TOKEN)).toBe(true);
  });
});

describe('placing the call', () => {
  const fetchMock = vi.fn();
  const ok = (body: unknown) =>
    ({ ok: true, status: 201, json: async () => body }) as unknown as Response;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  const place = () =>
    placeBridgedCall({
      config: twilioConfig()!,
      agentNumber: '+447496815847',
      answerUrl: 'https://bothmade.studio/api/twilio/voice?leadId=lead_1',
      statusUrl: 'https://bothmade.studio/api/twilio/status?leadId=lead_1',
    });

  /**
   * The rep's phone first, then the lead. Backwards on paper and right for a
   * phone in a pocket: no app, no browser microphone, and the rep is already
   * on the line when the lead answers so nobody hears dead air.
   */
  it('rings the rep, not the lead', async () => {
    fetchMock.mockResolvedValue(ok({ sid: 'CA123', status: 'queued' }));

    await place();

    const body = new URLSearchParams(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body.get('To')).toBe('+447496815847');
    expect(body.get('From')).toBe('+15005550006');
    expect(body.get('Url')).toContain('/api/twilio/voice');
  });

  it('authenticates as the account', async () => {
    fetchMock.mockResolvedValue(ok({ sid: 'CA123', status: 'queued' }));

    await place();

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(Buffer.from(auth.replace('Basic ', ''), 'base64').toString()).toBe('AC_test:tok_test');
  });

  /**
   * "The 'To' number is not a valid phone number" names the fix. "The call
   * failed" sends somebody hunting.
   */
  it('passes the provider wording through when it refuses', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "The 'To' number is not a valid phone number." }),
    } as unknown as Response);

    await expect(place()).rejects.toThrow(/not a valid phone number/);
  });

  /** A response with no SID is not a placed call, whatever the status code. */
  it('refuses to report a call it has no id for', async () => {
    fetchMock.mockResolvedValue(ok({ status: 'queued' }));

    await expect(place()).rejects.toThrow();
  });
});

/**
 * What separates a conversation from a phone that rang out.
 *
 * Twilio reports 'completed' for both — a call answered and spoken on, and one
 * that rang until the caller hung up. Duration is the only thing that tells
 * them apart, and this verdict is what the whole exercise is for.
 */
describe('whether they actually picked up', () => {
  it('counts a call somebody spoke on', () => {
    expect(callWasAnswered('completed', 214)).toBe(true);
  });

  it('does not count a completed call of no length', () => {
    expect(callWasAnswered('completed', 0)).toBe(false);
    expect(callWasAnswered('completed', null)).toBe(false);
    // A click and an immediate hang-up is not a conversation.
    expect(callWasAnswered('completed', 2)).toBe(false);
  });

  it('does not count the ways a call fails', () => {
    for (const status of ['busy', 'no-answer', 'failed', 'canceled']) {
      expect(callWasAnswered(status, 30), status).toBe(false);
    }
  });

  /** Every status the provider can send has words a rep would recognise. */
  it('has a human phrase for every outcome', () => {
    for (const status of ['queued', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'failed', 'canceled']) {
      expect(CALL_STATUS_WORDS[status], status).toBeTruthy();
    }
  });
});
