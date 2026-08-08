import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OBJECTIONS } from '@/lib/objections';
import CallPage from '@/app/admin/call/[leadId]/page';

/**
 * Eleven objections, on the one screen where somebody is talking at you.
 *
 * They were eleven closed accordions in a fixed order, each showing only our
 * phrasing of the trigger. A rep does not remember our wording — they
 * remember the two words they just heard, and finding the match meant reading
 * down a list with a phone against their ear.
 *
 * The filter searches the meaning and the response as well as the trigger,
 * because "they said they're happy with their guy" has to reach the entry
 * headed "We already have someone who does our website."
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ leadId: 'lead_1' }),
  useSearchParams: () => new URLSearchParams(),
}));

const LEAD = {
  id: 'lead_1',
  company: 'Rigidized Metals Inc.',
  contactName: 'Dave Duran',
  email: 'dave@example.com',
  phone: '+15551234567',
  status: 'new',
  painPoints: '',
  notes: '',
  estimatedValue: null,
  nextFollowUpAt: null,
  assignedToId: null,
  activities: [],
  timezone: null,
  city: null,
  region: null,
  country: null,
};

const json = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  push.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes('/call-list')) return json({ success: true, leads: [] });
      if (target.includes('/api/admin/leads/lead_1')) return json({ success: true, lead: LEAD });
      return json({ success: true });
    })
  );
});

const openPanel = async () => {
  render(<CallPage />);
  // The objections panel renders with the script, once the lead has loaded.
  await waitFor(() => expect(screen.getByLabelText(/filter objections/i)).toBeTruthy());
  return screen.getByLabelText(/filter objections/i);
};

describe('finding the objection you just heard', () => {
  it('offers all of them until something is typed', async () => {
    await openPanel();

    expect(screen.getAllByRole('group')).toHaveLength(OBJECTIONS.length);
  });

  it('narrows on a word from what they said', async () => {
    const user = userEvent.setup();
    const box = await openPanel();

    await user.type(box, 'email');

    const shown = screen.getAllByRole('group');
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(OBJECTIONS.length);
  });

  it('searches the meaning and the response, not only our phrasing of the trigger', async () => {
    // The whole point. A rep types what the prospect said, and our wording of
    // the trigger is the one thing they have not read.
    const needle = 'agency';
    const inBody = OBJECTIONS.filter((o) =>
      `${o.meaning} ${o.response} ${o.thenWhat}`.toLowerCase().includes(needle)
    );
    const inTrigger = OBJECTIONS.filter((o) => o.trigger.toLowerCase().includes(needle));

    expect(inBody.length).toBeGreaterThan(0);
    expect(inTrigger).toHaveLength(0);

    const user = userEvent.setup();
    const box = await openPanel();
    await user.type(box, needle);

    expect(screen.getAllByRole('group')).toHaveLength(inBody.length);
  });

  it('opens what matched, because one more click is one more thing to do', async () => {
    const user = userEvent.setup();
    const box = await openPanel();

    await user.type(box, 'email');

    for (const d of screen.getAllByRole('group')) {
      expect((d as HTMLDetailsElement).open).toBe(true);
    }
  });

  it('closes them again when the box is cleared', async () => {
    const user = userEvent.setup();
    const box = await openPanel();

    await user.type(box, 'email');
    await user.clear(box);

    await waitFor(() => expect(screen.getAllByRole('group')).toHaveLength(OBJECTIONS.length));
    for (const d of screen.getAllByRole('group')) {
      expect((d as HTMLDetailsElement).open).toBe(false);
    }
  });

  it('says so rather than showing an empty panel', async () => {
    const user = userEvent.setup();
    const box = await openPanel();

    await user.type(box, 'zzzzz');

    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(screen.getByText(/nothing matches/i)).toBeTruthy();
    expect(screen.getByText(new RegExp(`${OBJECTIONS.length}`))).toBeTruthy();
  });

  it('is not case sensitive, because nobody capitalises mid-call', async () => {
    const user = userEvent.setup();
    const box = await openPanel();

    await user.type(box, 'EMAIL');
    const upper = screen.getAllByRole('group').length;

    await user.clear(box);
    await user.type(box, 'email');

    expect(upper).toBeGreaterThan(0);
    expect(screen.getAllByRole('group')).toHaveLength(upper);
  });
});
