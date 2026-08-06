import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueueView } from '@/components/admin/sales/QueueView';

/**
 * Filtering the call sheet, and filtering the pile that never opened it.
 *
 * These are two different jobs. Working the sheet means narrowing to what is
 * worth ringing this morning. Opening "emailed, nobody has opened it" means
 * asking a different question entirely — did that send land, and is there
 * anything big enough in here to chase another way. They shared one set of
 * filters, so doing the second undid the first, and going back to the sheet
 * meant setting it up again from scratch.
 *
 * The other thing pinned here is the count beside each option. It is measured
 * against the OTHER filters, so it is always the number of rows you would get
 * by clicking it. A count taken across the whole book reads as a promise the
 * click then breaks.
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
  timesCalled: 1,
  nextFollowUpAt: null,
  emailDeliveryFailedReason: null,
  salesNote: null,
  reason: 'never-contacted',
  opens: 0,
  openBand: 'silent',
  openHeadline: 'No opens yet',
  openNextStep: null,
  assignedTo: null,
  lastActivity: null,
  ...over,
});

function respondWith(body: Record<string, unknown>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          callable: [],
          noPhone: [],
          noSignal: [],
          scheduledHot: [],
          totalOpen: 0,
          callsToday: 0,
          breakdown: {},
          noPhoneCount: 0,
          truncated: false,
          gmailStatus: 'ok',
          googleOAuthAvailable: true,
          ...body,
        }),
      }) as unknown as Response
  );
}

/** The filter bar belonging to the unopened section, not the sheet's. */
const unopenedPanel = () => screen.getByTestId('no-signal-filters');

/*
 * Counted, not fetched. The top-of-page "call this one" card repeats whoever
 * leads the sheet, so a business can legitimately appear twice — getByText
 * would throw on the very rows these tests care most about.
 */
const shown = (name: string) => screen.queryAllByText(name).length > 0;

beforeEach(() => {
  idCounter = 0;
  vi.restoreAllMocks();
  /*
   * The sort and the "sensible hour" toggle are remembered across sessions,
   * which means across tests too — one test clicking "Biggest deal" left the
   * next one rendering a flat list it never asked for. That is the same trap
   * the nudge below exists for, and it caught itself here first.
   */
  localStorage.clear();
});

describe('the two filter bars', () => {
  it('does not narrow the unopened pile when the sheet is narrowed', async () => {
    respondWith({
      callable: [
        row({ company: 'Sheet Cheap', estimatedValue: 100000 }),
        row({ company: 'Sheet Rich', estimatedValue: 3000000 }),
      ],
      noSignal: [
        row({ company: 'Quiet Cheap', estimatedValue: 100000, reason: 'no-follow-up' }),
        row({ company: 'Quiet Rich', estimatedValue: 3000000, reason: 'no-follow-up' }),
      ],
    });
    render(<QueueView />);
    await screen.findAllByText('Sheet Cheap');

    await userEvent.click(await screen.findByText('Show anyway'));
    expect(shown('Quiet Cheap')).toBe(true);

    // Narrow the sheet to deals the cheap rows can't meet.
    const sheetBar = screen.getByTestId('call-sheet-filters');
    await userEvent.click(within(sheetBar).getByRole('button', { name: /\$5k\+/ }));

    expect(shown('Sheet Cheap')).toBe(false);
    // The whole point: untouched.
    expect(shown('Quiet Cheap')).toBe(true);
  });

  it('does not narrow the sheet when the unopened pile is narrowed', async () => {
    respondWith({
      callable: [
        row({ company: 'Sheet Cheap', estimatedValue: 100000 }),
        row({ company: 'Sheet Rich', estimatedValue: 3000000 }),
      ],
      noSignal: [
        row({ company: 'Quiet Cheap', estimatedValue: 100000, reason: 'no-follow-up' }),
        row({ company: 'Quiet Rich', estimatedValue: 3000000, reason: 'no-follow-up' }),
      ],
    });
    render(<QueueView />);
    await userEvent.click(await screen.findByText('Show anyway'));

    await userEvent.click(within(unopenedPanel()).getByRole('button', { name: /\$5k\+/ }));

    expect(shown('Quiet Cheap')).toBe(false);
    expect(shown('Sheet Cheap')).toBe(true);
  });

  /**
   * Filtering a collapsible section to nothing used to unmount the section,
   * taking the filter that caused it with it — no way back except a reload.
   *
   * A band whose count is nought is disabled, so the bands alone cannot empty
   * the list. The search box can: it narrows the rows the filters then run
   * against, and it does not know what is already switched on.
   */
  it('keeps the unopened filters on screen when they match nothing', async () => {
    respondWith({
      noSignal: [
        row({ company: 'Quiet Cheap', estimatedValue: 100000, reason: 'no-follow-up' }),
        row({ company: 'Quiet Rich', estimatedValue: 3000000, reason: 'no-follow-up' }),
      ],
    });
    render(<QueueView />);
    await userEvent.click(await screen.findByText('Show anyway'));
    await userEvent.click(within(unopenedPanel()).getByRole('button', { name: /\$5k\+/ }));
    expect(shown('Quiet Rich')).toBe(true);

    await userEvent.type(screen.getByRole('textbox'), 'Quiet Cheap');

    expect(screen.getByText(/none of these 1 match those filters/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /clear them/i }));
    expect(shown('Quiet Cheap')).toBe(true);
  });

  it('offers no open-count bands where every row has nought opens', async () => {
    respondWith({
      callable: [row()],
      noSignal: [row({ reason: 'no-follow-up' })],
    });
    render(<QueueView />);
    await userEvent.click(await screen.findByText('Show anyway'));

    expect(within(screen.getByTestId('call-sheet-filters')).getByText('Opened')).toBeInTheDocument();
    expect(within(unopenedPanel()).queryByText('Opened')).not.toBeInTheDocument();
  });
});

describe('the counts beside each option', () => {
  it('are what you would get by clicking, with the other filters still on', async () => {
    respondWith({
      callable: [
        row({ industry: 'Roofing', estimatedValue: 3000000 }),
        row({ industry: 'Dentistry', estimatedValue: 3000000 }),
        row({ industry: 'Dentistry', estimatedValue: 100000 }),
      ],
    });
    render(<QueueView />);
    const bar = await screen.findByTestId('call-sheet-filters');

    // Across the book, $20k+ is two of the three.
    expect(within(bar).getByRole('button', { name: /\$20k\+ \(2\)/ })).toBeInTheDocument();

    await userEvent.selectOptions(within(bar).getByLabelText(/trade/i), 'Dentistry');

    // Within dentistry it is one — and that is what the chip must now say.
    expect(within(bar).getByRole('button', { name: /\$20k\+ \(1\)/ })).toBeInTheDocument();
  });

  it('counts a trade against the value filter already applied', async () => {
    respondWith({
      callable: [
        row({ industry: 'Roofing', estimatedValue: 3000000 }),
        row({ industry: 'Roofing', estimatedValue: 100000 }),
        row({ industry: 'Dentistry', estimatedValue: 3000000 }),
        row({ industry: 'Dentistry', estimatedValue: 100000 }),
      ],
    });
    render(<QueueView />);
    const bar = await screen.findByTestId('call-sheet-filters');

    await userEvent.click(within(bar).getByRole('button', { name: /\$20k\+/ }));

    expect(within(bar).getByRole('option', { name: 'Roofing (1)' })).toBeInTheDocument();
  });
});

describe('never rung', () => {
  it('shows only leads with no call logged against them', async () => {
    respondWith({
      callable: [
        row({ company: 'Tried Twice', timesCalled: 2 }),
        row({ company: 'Never Tried', timesCalled: 0 }),
      ],
    });
    render(<QueueView />);
    const bar = await screen.findByTestId('call-sheet-filters');

    await userEvent.click(within(bar).getByRole('button', { name: /never rung \(1\)/i }));

    expect(shown('Never Tried')).toBe(true);
    expect(shown('Tried Twice')).toBe(false);
  });

  it('is not offered when every lead has been rung', async () => {
    respondWith({ callable: [row({ timesCalled: 3 })] });
    render(<QueueView />);
    const bar = await screen.findByTestId('call-sheet-filters');

    expect(within(bar).queryByRole('button', { name: /never rung/i })).not.toBeInTheDocument();
  });
});

/**
 * A lead that is reading your email and has no number to ring.
 *
 * The alert email says to go and look at the call sheet. The call sheet is
 * built from leads that have a phone number, so this one was filed in the last
 * section on the page under a heading about missing numbers, unremarked, below
 * a collapsed pile of businesses that had never opened anything. The rep was
 * told to look at the top and it was at the bottom.
 */
describe('reading your email, no number to ring', () => {
  const reader = (over: Record<string, unknown> = {}) =>
    row({
      phone: null,
      reason: 'opened',
      opens: 3,
      openBand: 'hot',
      openHeadline: 'Opened 3 times',
      ...over,
    });

  it('says what to do instead of leaving it unremarked', async () => {
    respondWith({ noPhone: [reader({ company: 'Silent Reader' })] });
    render(<QueueView />);

    expect(await screen.findByText(/reading your email right now/i)).toBeInTheDocument();
    expect(screen.getByText(/reply to that email while it is still open/i)).toBeInTheDocument();
  });

  it('shows the open count on the row', async () => {
    respondWith({ noPhone: [reader({ company: 'Silent Reader' })] });
    render(<QueueView />);
    await screen.findByText('Silent Reader');

    expect(screen.getByText('3×')).toBeInTheDocument();
    expect(screen.getByText(/opened 3 times/i)).toBeInTheDocument();
  });

  it('sorts above the pile nobody has opened', async () => {
    respondWith({
      noPhone: [reader({ company: 'Silent Reader' })],
      noSignal: [row({ company: 'Never Opened', reason: 'no-follow-up' })],
    });
    render(<QueueView />);
    await screen.findByText('Silent Reader');

    const order = screen.getByText('Silent Reader').compareDocumentPosition(
      screen.getByText(/emailed, nobody has opened it/i)
    );
    // Node.DOCUMENT_POSITION_FOLLOWING — the unopened pile comes after.
    expect(order & 4).toBeTruthy();
  });

  it('keeps the plain wording when none of them are reading it', async () => {
    respondWith({ noPhone: [row({ phone: null, company: 'Just Due' })] });
    render(<QueueView />);
    await screen.findByText('Just Due');

    expect(screen.getByText(/there is nothing to ring/i)).toBeInTheDocument();
    expect(screen.queryByText(/reading your email right now/i)).not.toBeInTheDocument();
  });
});

describe('filtering by state', () => {
  it('narrows to one territory', async () => {
    respondWith({
      callable: [
        row({ company: 'Carolina Co', region: 'NC' }),
        row({ company: 'Florida Co', region: 'FL' }),
      ],
    });
    render(<QueueView />);
    const bar = await screen.findByTestId('call-sheet-filters');

    await userEvent.selectOptions(within(bar).getByLabelText(/state/i), 'FL');

    expect(shown('Florida Co')).toBe(true);
    expect(shown('Carolina Co')).toBe(false);
  });
});

/**
 * The setting that quietly undoes the ordering.
 *
 * "Biggest deal" and "Best time to call" drop the bands and return one flat
 * list, and the choice is remembered across sessions. So a click from weeks
 * ago keeps scattering the leads who opened your email through the middle of
 * the page, with nothing on screen explaining why they are not at the top.
 */
describe('sorting away from most urgent', () => {
  const openedRow = (over: Record<string, unknown> = {}) =>
    row({ reason: 'opened', opens: 3, openBand: 'hot', openHeadline: 'Opened 3 times', ...over });

  it('says so, and offers the sort back', async () => {
    respondWith({
      callable: [openedRow({ company: 'Reader', estimatedValue: 100000 }), row({ company: 'Big', estimatedValue: 3000000 })],
    });
    render(<QueueView />);
    await screen.findAllByText('Big');

    await userEvent.click(screen.getByRole('button', { name: /biggest deal/i }));
    expect(screen.getByText(/1 lead has opened your email/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /sort by most urgent/i }));
    expect(screen.queryByText(/opened your email\./i)).not.toBeInTheDocument();
  });

  it('stays quiet when nobody has opened anything', async () => {
    respondWith({ callable: [row({ company: 'Plain' })] });
    render(<QueueView />);
    await screen.findAllByText('Plain');

    await userEvent.click(screen.getByRole('button', { name: /biggest deal/i }));
    expect(screen.queryByText(/opened your email\./i)).not.toBeInTheDocument();
  });

  it('stays quiet on the sort that already puts them first', async () => {
    respondWith({ callable: [openedRow({ company: 'Reader' })] });
    render(<QueueView />);
    await screen.findAllByText('Reader');

    expect(screen.queryByText(/spreads them through the list/i)).not.toBeInTheDocument();
  });
});
