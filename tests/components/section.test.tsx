import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Section } from '@/components/admin/ui';

/**
 * A named, collapsible section of a long page.
 *
 * THE PROBLEM. The lead page put everything about a business on one scroll —
 * the brief, the mockups, the files, the qualification, the timeline — as a
 * stack of identical bordered cards. Any one of them is fine; twelve is a
 * page where finding the mockup means scrolling past four things you are not
 * doing, every time.
 *
 * Collapsing alone does not fix it. A shut box labelled "Mockups" is a
 * question you still have to open the box to answer, so people leave
 * everything open and nothing is gained. The summary is the point of this
 * component; the chevron is not.
 */

beforeEach(() => {
  localStorage.clear();
});

const body = 'the detail nobody needs until they need it';

describe('what a shut section says', () => {
  /**
   * The whole reason this is worth collapsing. A closed section has to answer
   * the question you would have opened it to answer, or it has only cost you
   * a click.
   */
  it('answers the question instead of just naming itself', () => {
    render(
      <Section id="t1" title="Mockups" summary="Sent 2 days ago · opened 3 times">
        <p>{body}</p>
      </Section>
    );

    expect(screen.getByText(/sent 2 days ago · opened 3 times/i)).toBeTruthy();
    expect(screen.queryByText(body)).toBeNull();
  });

  /**
   * Not rendered rather than hidden. Several of these mount forms, fetch data
   * or draw tables, and building all of them to then display:none most is the
   * cost this exists to avoid.
   */
  it('does not build what it is not showing', () => {
    render(
      <Section id="t2" title="Files">
        <input aria-label="a field that would otherwise mount" />
      </Section>
    );

    expect(screen.queryByLabelText(/a field that would otherwise mount/i)).toBeNull();
  });

  it('stops repeating the summary once the detail is on screen', async () => {
    render(
      <Section id="t3" title="Mockups" summary="Sent 2 days ago">
        <p>{body}</p>
      </Section>
    );

    await userEvent.click(screen.getByRole('button', { name: /mockups/i }));

    expect(screen.getByText(body)).toBeTruthy();
    expect(screen.queryByText('Sent 2 days ago')).toBeNull();
  });
});

describe('remembering the choice', () => {
  /**
   * Somebody who works mockups all day and never touches qualification should
   * get their page back the way they left it.
   */
  it('keeps a section open across a reload', async () => {
    const { unmount } = render(
      <Section id="t4" title="Mockups">
        <p>{body}</p>
      </Section>
    );
    await userEvent.click(screen.getByRole('button', { name: /mockups/i }));
    unmount();

    render(
      <Section id="t4" title="Mockups">
        <p>{body}</p>
      </Section>
    );

    expect(await screen.findByText(body)).toBeTruthy();
  });

  /** And the other way — a section shut on purpose stays shut. */
  it('keeps a default-open section shut once it has been closed', async () => {
    const { unmount } = render(
      <Section id="t5" title="Timeline" defaultOpen>
        <p>{body}</p>
      </Section>
    );
    await userEvent.click(screen.getByRole('button', { name: /timeline/i }));
    unmount();

    render(
      <Section id="t5" title="Timeline" defaultOpen>
        <p>{body}</p>
      </Section>
    );

    expect(screen.queryByText(body)).toBeNull();
  });

  it('keeps one section choice out of another', async () => {
    render(
      <>
        <Section id="t6a" title="Mockups">
          <p>mockup detail</p>
        </Section>
        <Section id="t6b" title="Files">
          <p>file detail</p>
        </Section>
      </>
    );

    await userEvent.click(screen.getByRole('button', { name: /mockups/i }));

    expect(screen.getByText('mockup detail')).toBeTruthy();
    expect(screen.queryByText('file detail')).toBeNull();
  });
});

/**
 * A flag that survives being collapsed, because the whole risk of a
 * collapsible page is that the thing needing doing is behind a closed door.
 */
describe('a section with something needing doing', () => {
  it('says so while shut', () => {
    render(
      <Section id="t7" title="Mockups" attention summary="Built and never sent">
        <p>{body}</p>
      </Section>
    );

    expect(screen.getByText(/needs you/i)).toBeTruthy();
    expect(screen.getByText(/built and never sent/i)).toBeTruthy();
  });
});

describe('screen readers', () => {
  it('reports whether it is open', async () => {
    render(
      <Section id="t8" title="Mockups">
        <p>{body}</p>
      </Section>
    );
    const toggle = screen.getByRole('button', { name: /mockups/i });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});
