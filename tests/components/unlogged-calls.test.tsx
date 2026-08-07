import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueueView } from '@/components/admin/sales/QueueView';

/**
 * Calls that were made and never recorded.
 *
 * THE REPORT. "Evan says he logged all the calls he made, the dashboard says
 * 1." He had. The app had thrown the rest away.
 *
 * Tapping Dial stashed the business in `sessionStorage` under a single key so
 * the "how did it go?" prompt could survive the dialler backgrounding the
 * browser. Working down the sheet — dial, talk, come back, dial the next —
 * overwrote that key every time. Each new call silently erased the prompt for
 * the one before it, so an afternoon of work arrived in the database as one
 * logged outcome and a dashboard that looked like it had lost everything.
 *
 * The fix is a list rather than a slot. What is pinned here is that dialling
 * never destroys an earlier unlogged call, and that the pile is visible —
 * a rep who cannot see three calls stacked up behind this one will walk away
 * believing they are done.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

let idCounter = 0;
const row = (over: Record<string, unknown> = {}) => ({
  id: `lead_${++idCounter}`,
  company: `Business ${idCounter}`,
  contactName: null,
  phone: '+13365550100',
  email: 'x@example.com',
  status: 'new',
  hotLead: false,
  estimatedValue: 500000,
  industry: 'Roofing',
  region: 'NC',
  timesCalled: 0,
  nextFollowUpAt: null,
  emailDeliveryFailedReason: null,
  salesNote: null,
  // A band that starts expanded, so the rows (and their Dial links) are on
  // screen without a test having to click a section open first.
  reason: 'replied',
  opens: 0,
  openBand: 'silent',
  openHeadline: 'No opens yet',
  openNextStep: null,
  assignedTo: null,
  lastActivity: null,
  nextTouch: null,
  ...over,
});

const callable = [row({ company: 'Ridgeline Roofing' }), row({ company: 'Cascade Dental' })];

beforeEach(() => {
  idCounter = 0;
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();

  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          callable,
          noPhone: [],
          noSignal: [],
          scheduledHot: [],
          totalOpen: 2,
          callsToday: 0,
          breakdown: { replied: 2 },
          noPhoneCount: 0,
          truncated: false,
          gmailStatus: 'ok',
          googleOAuthAvailable: true,
        }),
      }) as unknown as Response
  );
});

/** Tapping the tel: link is what marks a call as started. */
const dial = async (company: string) => {
  const link = await screen.findByLabelText(new RegExp(`Call ${company} on`, 'i'));
  await userEvent.click(link);
};

const stored = () => JSON.parse(sessionStorage.getItem('pendingCalls') || '[]');

describe('dialling more than one business', () => {
  /** The bug, exactly: the second dial used to erase the first. */
  it('keeps every unlogged call instead of only the last', async () => {
    render(<QueueView />);

    await dial('Ridgeline Roofing');
    await dial('Cascade Dental');

    expect(stored().map((c: { company: string }) => c.company)).toEqual([
      'Ridgeline Roofing',
      'Cascade Dental',
    ]);
  });

  /**
   * Said out loud, because the whole reason the prompt exists is that
   * unlogged calls used to vanish without trace. A rep who cannot see the
   * backlog will close the tab believing the day is recorded.
   */
  it('says how many are still waiting to be logged', async () => {
    render(<QueueView />);

    await dial('Ridgeline Roofing');
    await dial('Cascade Dental');

    expect(await screen.findByText(/haven't logged/i)).toBeTruthy();
  });

  /** Oldest first, so the one whose details are fading gets logged first. */
  it('asks about the first one rung, not the last', async () => {
    render(<QueueView />);

    await dial('Ridgeline Roofing');
    await dial('Cascade Dental');

    expect(await screen.findByText(/You called Ridgeline Roofing/i)).toBeTruthy();
  });

  /**
   * A number that rang out and was tried again is one unlogged call, not two.
   * Otherwise the prompt asks twice about a conversation that happened once.
   */
  it('treats a redial as the same call', async () => {
    render(<QueueView />);

    await dial('Ridgeline Roofing');
    await dial('Ridgeline Roofing');

    expect(stored()).toHaveLength(1);
  });
});

describe('working through the pile', () => {
  it('moves on to the next one when the first is dismissed', async () => {
    render(<QueueView />);

    await dial('Ridgeline Roofing');
    await dial('Cascade Dental');
    await userEvent.click(await screen.findByRole('button', { name: /dismiss/i }));

    expect(await screen.findByText(/You called Cascade Dental/i)).toBeTruthy();
    expect(stored().map((c: { company: string }) => c.company)).toEqual(['Cascade Dental']);
  });

  it('clears the prompt entirely once the last one is dealt with', async () => {
    render(<QueueView />);

    await dial('Ridgeline Roofing');
    await userEvent.click(await screen.findByRole('button', { name: /dismiss/i }));

    expect(stored()).toEqual([]);
    expect(screen.queryByText(/how did it go/i)).toBeNull();
  });
});

/**
 * An afternoon's worth of dials still in storage from before this change.
 * Losing the call in progress because the app was deployed mid-call is a
 * small version of exactly the bug being fixed.
 */
describe('an entry left by the old single-slot version', () => {
  it('is carried over rather than dropped', async () => {
    sessionStorage.setItem(
      'pendingCalls',
      JSON.stringify({ id: 'lead_old', company: 'Old Shape Co', at: Date.now() })
    );

    render(<QueueView />);

    expect(await screen.findByText(/You called Old Shape Co/i)).toBeTruthy();
  });
});
