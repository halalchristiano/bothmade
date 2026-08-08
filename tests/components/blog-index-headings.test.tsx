import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BlogIndex } from '@/components/BlogIndex';
import { BLOG_POSTS } from '@/lib/blog';

/**
 * The heading outline is the table of contents a screen reader user actually
 * navigates by.
 *
 * On a page that is a list of links, jumping heading to heading is how you
 * reach the posts without sitting through the intro. That only works if the
 * levels describe the real structure: the page went h1 -> h3 with no h2
 * anywhere, so every post title claimed to sit inside a section that was
 * never announced.
 *
 * Nothing about this is visible. app/globals.css sets no heading styles, so
 * Tailwind's preflight flattens h2 and h3 to the same inherited size and
 * weight and all the visual properties come from the className — which is
 * exactly why it survived being looked at, and why it needs a test rather
 * than an eye.
 */

function headingLevels(): number[] {
  return screen
    .getAllByRole('heading')
    .map((el) => Number(el.tagName[1]))
    .filter((n) => !Number.isNaN(n));
}

describe('the blog index outline', () => {
  it('has exactly one h1', () => {
    render(<BlogIndex />);
    expect(headingLevels().filter((n) => n === 1)).toHaveLength(1);
  });

  it('never skips a level', () => {
    // The actual regression: h1 followed by h3. Written as a general rule so
    // it also catches an h4 dropped in later.
    render(<BlogIndex />);
    const levels = headingLevels();
    const skips = levels
      .map((level, i) => (i > 0 && level - levels[i - 1] > 1 ? `h${levels[i - 1]}->h${level}` : null))
      .filter(Boolean);
    expect(skips, `heading levels were ${levels.join(', ')}`).toEqual([]);
  });

  it('puts every post title at h2, directly under the page heading', () => {
    render(<BlogIndex />);

    // One pass over the headings rather than a getByRole(name) per post.
    // Accessible-name computation walks the subtree for every candidate, and
    // doing that once per post against the whole page — Nav and Footer
    // included — is what made an earlier version of this test time out.
    const byText = new Map(
      screen.getAllByRole('heading').map((el) => [el.textContent?.trim(), el.tagName])
    );

    for (const post of BLOG_POSTS) {
      expect(byText.get(post.title), `"${post.title}" should be an h2`).toBe('H2');
    }
  });

  it('keeps each title inside its own post link, so the outline and the targets agree', () => {
    // A heading a screen reader lands on is only useful if activating the
    // thing it names goes to the post. This is what makes the level change
    // worth anything.
    render(<BlogIndex />);

    // Hoisted for the same reason as above: getAllByRole computes roles across
    // the whole tree, so calling it inside the loop pays that cost per post.
    const headings = screen.getAllByRole('heading');

    for (const post of BLOG_POSTS) {
      const heading = headings.find((el) => el.textContent?.trim() === post.title);
      expect(heading, `no heading for "${post.title}"`).toBeDefined();

      const link = heading!.closest('a');
      expect(link, `"${post.title}" is not inside a link`).not.toBeNull();
      expect(link).toHaveAttribute('href', `/blog/${post.slug}`);
    }
  });
});

