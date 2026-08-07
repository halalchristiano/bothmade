import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TeamPage from '@/app/admin/team/page';

/**
 * The team list, read on a phone.
 *
 * Two things it did that only work with a mouse and a wide window. The rule
 * about your own role — another owner has to change it — lived in a `title`
 * on the disabled dropdown, and a tooltip needs a pointer to hover: on a
 * phone you got a greyed-out control and nothing anywhere saying why, which
 * is not a rule anybody guesses. And "remove this teammate", the one
 * destructive control on the page, was a bare 15px glyph sitting immediately
 * beside the dropdown people actually came to use — about a third of the
 * width a finger needs, and the smallest target in the row.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const MEMBERS = [
  { id: 'me', name: 'Kiana', email: 'kiana@bothmade.studio', role: 'owner', title: null, createdAt: new Date().toISOString() },
  { id: 'them', name: 'Evan', email: 'evan@bothmade.studio', role: 'sales', title: null, createdAt: new Date().toISOString() },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/api/auth/me')) {
        return { ok: true, status: 200, json: async () => ({ user: { id: 'me', role: 'owner' } }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ success: true, users: MEMBERS }) } as unknown as Response;
    })
  );
});

const ready = async () => {
  render(<TeamPage />);
  await waitFor(() => expect(screen.getByText('evan@bothmade.studio')).toBeTruthy());
};

describe('an owner looking at the team list', () => {
  it('says on the page why their own role is locked', async () => {
    await ready();

    // On the page, not in a title attribute nobody on a touch screen can
    // summon.
    expect(screen.getByText(/another owner has to change your role/i)).toBeTruthy();
  });

  it('leaves the explanation off the rows it does not apply to', async () => {
    await ready();

    expect(screen.getAllByText(/another owner has to change your role/i)).toHaveLength(1);
  });

  it('gives every role dropdown a name of its own', async () => {
    await ready();

    // Two selects on the page; without a label they are indistinguishable to
    // anything that is not looking at the layout.
    expect(screen.getByRole('combobox', { name: /role for Evan/i })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /role for Kiana/i })).toBeTruthy();
  });

  it('gives the destructive control a target you can hit with a thumb', async () => {
    await ready();

    const remove = screen.getByRole('button', { name: /remove Evan/i });
    // h-11/w-11 — 44px, the smallest target that reliably takes a tap.
    expect(remove.className).toMatch(/\bh-11\b/);
    expect(remove.className).toMatch(/\bw-11\b/);
  });

  it('offers no way to remove yourself', async () => {
    await ready();

    expect(screen.queryByRole('button', { name: /remove Kiana/i })).toBeNull();
  });
});
