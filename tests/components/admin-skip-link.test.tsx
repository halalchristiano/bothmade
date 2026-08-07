import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminLayout from '@/app/admin/layout';

/**
 * Getting to the page.
 *
 * The sidebar comes before the content in the DOM, so on every admin page a
 * keyboard user tabbed past the search button and the whole nav — sixteen or
 * so stops — before reaching anything they came for. Then again on the next
 * page, and the next. This is the tool the studio lives in all day; the
 * marketing site has had a skip link since launch and this did not.
 *
 * The two halves that make one work are both pinned here. The link has to be
 * the first thing focus reaches, and the target has to be able to hold focus
 * — a bare `href="#id"` moves the scroll position and leaves focus on the
 * link, so the very next Tab walks back into the sidebar the skip existed to
 * get out of.
 */

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/admin/dashboard',
}));

beforeEach(() => {
  vi.clearAllMocks();
  // The shell asks who is signed in and how many messages are unread; neither
  // matters here, and an unmocked fetch would warn on every render.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }) as unknown as Response)
  );
});

const shell = () =>
  render(
    <AdminLayout>
      <h1>Dashboard</h1>
      <button>Something on the page</button>
    </AdminLayout>
  );

describe('the skip link', () => {
  it('is the first thing a Tab reaches', async () => {
    const user = userEvent.setup();
    shell();

    await user.tab();

    expect(document.activeElement).toHaveAccessibleName('Skip to content');
  });

  it('points at the main landmark', () => {
    shell();

    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link).toHaveAttribute('href', '#admin-main');
    expect(document.querySelector('#admin-main')?.tagName).toBe('MAIN');
  });

  /**
   * The half that is easy to leave out. Without a tabindex the browser
   * scrolls to the target and keeps focus on the link, so Tab continues into
   * the sidebar and the skip achieves nothing for the person it is for.
   */
  it('lands on a target that can actually take focus', () => {
    shell();

    const main = document.querySelector('#admin-main') as HTMLElement;
    expect(main).toHaveAttribute('tabindex', '-1');

    main.focus();
    expect(document.activeElement).toBe(main);
  });

  it('stays out of the way until it is focused', () => {
    shell();
    expect(screen.getByRole('link', { name: 'Skip to content' }).className).toContain('sr-only');
  });
});

describe('the landmarks', () => {
  /**
   * Two navs — the desktop sidebar and the mobile sheet — announced as
   * "navigation" and "navigation", with nothing to tell them apart in a
   * screen reader's list of regions.
   */
  it('names the sidebar, rather than leaving a second unnamed navigation', () => {
    shell();
    expect(screen.getByRole('complementary', { name: 'Main' })).toBeTruthy();
  });

  it('has exactly one main region for the skip link to target', () => {
    shell();
    expect(document.querySelectorAll('main').length).toBe(1);
  });
});
