import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CallCockpit from '@/app/admin/call/[leadId]/page';

/**
 * Call HQ is two screens in sequence and only ever admitted to being one.
 *
 * Before the call you want the script; after it you want the outcome buttons.
 * On a phone — where these calls actually get made — the layout collapses to
 * one column and those buttons sat below the entire script and eight
 * objection accordions. Coming back from the dialler meant scrolling past
 * everything you no longer needed to reach the only thing you did, which is a
 * large part of why calls went unlogged at all.
 *
 * The app already knows which of the two moments it is in, because it records
 * the dial. These tests hold it to using that.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useParams: () => ({ leadId: 'lead_1' }),
}));

const LEAD = {
  id: 'lead_1',
  company: 'Ridgeline Roofing',
  contactName: 'Dana Whitmore',
  email: 'dana@ridgeline.com',
  phone: '+13365550100',
  status: 'contacted',
  notes: null,
  customPainPoints: null,
  essentialPoints: null,
  upsellPoints: null,
  painPoints: [],
  estimateLowCents: null,
  estimateHighCents: null,
  personalizedObservation: 'the booking form 404s on a phone',
  currentSiteAssessment: null,
  activities: [],
};

const QUEUE = [
  { id: 'lead_0', company: 'Cascade Dental', contactName: null, reason: 'replied' },
  { id: 'lead_1', company: 'Ridgeline Roofing', contactName: null, reason: 'opened' },
  { id: 'lead_2', company: 'Harbor Law', contactName: null, reason: 'overdue' },
];

const respond = (over: { lead?: Record<string, unknown> } = {}) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const href = String(url);
    if (href.includes('/call-list')) {
      return { ok: true, status: 200, json: async () => ({ success: true, callable: QUEUE }) } as Response;
    }
    if (href.includes('/dial')) {
      return { ok: true, status: 200, json: async () => ({ success: true }) } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, lead: { ...LEAD, ...over.lead } }),
    } as Response;
  });

beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  push.mockClear();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  respond();
});

const dialButton = async () => (await screen.findAllByRole('link', { name: /\+13365550100/ }))[0]!;

let visibility: DocumentVisibilityState = 'visible';

/**
 * Pressing Call on the sheet iOS puts up.
 *
 * The tap alone is not a call — the sheet is drawn over the page and Cancel
 * changes nothing the browser can see. Pressing Call opens the phone app,
 * which backgrounds the browser, and that is the only signal there is.
 */
const handOverToThePhone = () => {
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('before the number is dialled', () => {
  it('offers the number to call', async () => {
    render(<CallCockpit />);

    expect(await dialButton()).toBeTruthy();
    expect(screen.queryByText(/how did it go\? log it/i)).toBeNull();
  });
});

describe('coming back from the dialler', () => {
  /**
   * The one event that tells the two moments apart. It is already recorded
   * for the dashboard; this is the same fact doing a second job.
   */
  it('switches from "call them" to "log it" once dialled', async () => {
    render(<CallCockpit />);

    await userEvent.click(await dialButton());
    handOverToThePhone();

    expect(await screen.findByText(/how did it go\? log it/i)).toBeTruthy();
  });

  /**
   * Somebody who backs out of the sheet should find the page exactly as they
   * left it — script and all — not flipped into its after-the-call shape.
   */
  it('leaves the screen alone when they press Cancel', async () => {
    render(<CallCockpit />);

    await userEvent.click(await dialButton());

    expect(screen.queryByText(/how did it go\? log it/i)).toBeNull();
  });

  /**
   * The phone app takes the screen and the page may be discarded before it
   * comes back — so the state has to survive exactly the event that makes it
   * true, or it is useless at the only moment it matters.
   */
  it('remembers the dial across the page being thrown away', async () => {
    sessionStorage.setItem('dialled:lead_1', '1');

    render(<CallCockpit />);

    expect(await screen.findByText(/how did it go\? log it/i)).toBeTruthy();
  });

  /** One lead's dial must not put another lead's screen into the wrong mode. */
  it('does not carry the flag to a different lead', async () => {
    sessionStorage.setItem('dialled:lead_999', '1');

    render(<CallCockpit />);
    await dialButton();

    expect(screen.queryByText(/how did it go\? log it/i)).toBeNull();
  });
});

/**
 * Forty calls in an afternoon is forty round trips from keyboard to mouse and
 * back, to press one of ten buttons that never move. The shortcut is not a
 * power feature — it is the difference between logging the call and deciding
 * to log it later, which in practice means not at all.
 */
describe('picking an outcome from the keyboard', () => {
  it('selects the outcome the number points at', async () => {
    render(<CallCockpit />);
    await dialButton();

    await userEvent.keyboard('1');

    expect(await screen.findByText(/rang out, nobody picked up/i)).toBeTruthy();
  });

  it('backs out on escape', async () => {
    render(<CallCockpit />);
    await dialButton();
    await userEvent.keyboard('1');
    await screen.findByText(/rang out, nobody picked up/i);

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByText(/rang out, nobody picked up/i)).toBeNull());
  });

  /**
   * A digit typed into the call note must stay in the call note. Eating it to
   * flip the outcome underneath somebody mid-sentence is worse than having no
   * shortcut at all.
   */
  it('leaves the keys alone while the note is being written', async () => {
    render(<CallCockpit />);
    await dialButton();
    await userEvent.keyboard('2');
    const note = await screen.findByLabelText(/call note/i);

    await userEvent.type(note, 'rang 3 times');

    expect((note as HTMLTextAreaElement).value).toBe('rang 3 times');
    // Still on the outcome that was picked, not whatever "3" points at.
    expect(screen.getByText(/left a message/i)).toBeTruthy();
  });
});

/**
 * Why this business is in front of you.
 *
 * The rail said it for every other lead in the queue and said nothing about
 * the one on screen — so the most useful thing to know before dialling was on
 * the page you had just left.
 */
describe('the header', () => {
  it('says why this lead came up', async () => {
    render(<CallCockpit />);

    expect(await screen.findByText('Opened your email')).toBeTruthy();
  });

  it('says where you are in the queue', async () => {
    render(<CallCockpit />);

    expect(await screen.findByText(/2 of 3 today/)).toBeTruthy();
  });
});

/**
 * "Not now" — the exit this screen never had. You open a lead, see it is half
 * seven in the evening where they are, and the only ways out were the back
 * button or ringing them anyway.
 */
describe('skipping one', () => {
  it('pushes the follow-up out and moves to the next lead', async () => {
    render(<CallCockpit />);

    await userEvent.click(await screen.findByRole('button', { name: 'tomorrow' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/call/lead_2'));

    const patch = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls.find(
      ([, init]) => init?.method === 'PATCH'
    );
    expect(JSON.parse(String(patch?.[1]?.body))).toHaveProperty('nextFollowUpAt');
  });
});
