import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BLOG_POSTS, headingSlug } from '@/lib/blog';

/**
 * Two things the blog was missing: a way to link to a section, and a way to
 * tell a machine what it is looking at.
 *
 * These are twelve-minute technical posts with several sections each, and no
 * heading carried an id — so the only way to point somebody at one was to
 * send the whole article and describe where to scroll.
 *
 * And the posts said nothing about themselves. The root layout has carried
 * ProfessionalService for the studio since it was written, and the sitemap
 * calls the blog "the largest indexable surface on the site", but an article
 * with no BlogPosting markup is one a search engine has to guess a headline,
 * a date and an author for — and it will not show article results for a guess.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/blog' }));

const POST = BLOG_POSTS.find((p) => p.body.some((b) => b.type === 'heading'))!;
const FIRST_HEADING = POST.body.find(
  (b): b is { type: 'heading'; text: string } => b.type === 'heading'
)!;

const { BlogPostPage } = await import('@/components/BlogPost');
const BlogSlugPage = (await import('@/app/blog/[slug]/page')).default;

describe('linking to a section of an article', () => {
  it('gives the heading an id built from its own words', () => {
    const { container } = render(<BlogPostPage post={POST} />);
    const id = headingSlug(FIRST_HEADING.text);

    expect(container.querySelector(`h2#${CSS.escape(id)}`)).toBeTruthy();
  });

  it('makes the heading its own anchor, so the link is where the reader is looking', () => {
    render(<BlogPostPage post={POST} />);
    const id = headingSlug(FIRST_HEADING.text);

    const link = screen.getByRole('link', { name: new RegExp(FIRST_HEADING.text.slice(0, 20), 'i') });
    expect(link.getAttribute('href')).toBe(`#${id}`);
  });

  it('leaves room for the fixed nav, so a deep link does not land under it', () => {
    // Without this the heading arrives behind the bar it was supposed to
    // arrive at, which reads as the link having gone to the wrong place.
    const { container } = render(<BlogPostPage post={POST} />);
    const id = headingSlug(FIRST_HEADING.text);

    expect(container.querySelector(`h2#${CSS.escape(id)}`)?.className).toContain('scroll-mt-');
  });

  it('gives every heading in the post a distinct id', () => {
    const { container } = render(<BlogPostPage post={POST} />);
    const ids = Array.from(container.querySelectorAll('h2[id]')).map((h) => h.id);

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('what the article tells a crawler', () => {
  const schemaFor = async (slug: string) => {
    const { container } = render(
      await BlogSlugPage({ params: Promise.resolve({ slug }) })
    );
    const tag = container.querySelector('script[type="application/ld+json"]');
    return JSON.parse(tag?.textContent ?? '{}');
  };

  it('declares itself a BlogPosting, with the headline and date the page shows', async () => {
    const schema = await schemaFor(POST.slug);

    expect(schema['@type']).toBe('BlogPosting');
    expect(schema.headline).toBe(POST.title);
    expect(schema.description).toBe(POST.dek);
    expect(schema.datePublished).toBe(POST.date);
  });

  it('points at its own canonical URL rather than a relative path', async () => {
    const schema = await schemaFor(POST.slug);

    expect(schema.url).toMatch(/^https?:\/\/.+\/blog\/.+/);
    expect(schema.mainEntityOfPage['@id']).toBe(schema.url);
  });

  it('names the studio as author and publisher, because the posts are unbylined', async () => {
    // Claiming a person who is not named on the page is a mismatch between
    // the markup and the content, which is the one thing this must never be.
    const schema = await schemaFor(POST.slug);

    expect(schema.author['@type']).toBe('Organization');
    expect(schema.publisher.name).toBe(schema.author.name);
  });

  it('reports a reading time and a word count read off the real body', async () => {
    const schema = await schemaFor(POST.slug);

    expect(schema.timeRequired).toBe(`PT${POST.readMinutes}M`);
    expect(schema.wordCount).toBeGreaterThan(100);
  });

  it('is valid JSON on every post, not just this one', async () => {
    // A single unescaped character in a title would break the whole block,
    // and a broken block is worse than none: it is markup a crawler rejects.
    for (const post of BLOG_POSTS) {
      const schema = await schemaFor(post.slug);
      expect(schema.headline, post.slug).toBe(post.title);
    }
  });
});
