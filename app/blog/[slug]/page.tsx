import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlogPostPage } from '@/components/BlogPost';
import { BLOG_POSTS, getBlogPost, getAdjacentBlogPosts, type BlogPost } from '@/lib/blog';
import { COMPANY_NAME } from '@/lib/company';
import { resolveSiteUrl } from '@/lib/site-url';

const SITE_URL = resolveSiteUrl();

/**
 * The article, described to a machine.
 *
 * The root layout has carried `ProfessionalService` for the studio since it
 * was written, and the sitemap calls the blog "the largest indexable surface
 * on the site" — but the posts themselves said nothing. An article with no
 * BlogPosting markup is an article a search engine has to infer a headline,
 * an author and a publication date for from the HTML, and it will not show
 * article results for one it had to guess at.
 *
 * Every field here is read off the post rather than invented: the headline is
 * the title, the description is the dek that is already the meta description,
 * the date is the one the sitemap submits, and the word count is derived from
 * the body that is actually rendered. `author` is the studio, because these
 * are unbylined — claiming a person who is not named on the page would be a
 * mismatch between the markup and the content, which is the one thing
 * structured data must never be.
 */
function articleJsonLd(post: BlogPost) {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const words = post.body.reduce(
    (total, block) => total + ('text' in block && typeof block.text === 'string' ? block.text.trim().split(/\s+/).length : 0),
    0
  );

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: post.title,
    description: post.dek,
    url,
    datePublished: post.date,
    dateModified: post.date,
    articleSection: post.tag,
    wordCount: words,
    timeRequired: `PT${post.readMinutes}M`,
    image: `${SITE_URL}/blog/${post.slug}/opengraph-image`,
    inLanguage: 'en',
    author: { '@type': 'Organization', name: COMPANY_NAME, url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: COMPANY_NAME,
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon` },
    },
  };
}

export function generateStaticParams() {
  return BLOG_POSTS.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) return { title: 'Not found | Bothmade' };

  return {
    title: `${post.title} | Bothmade Blog`,
    description: post.dek,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: `${post.title} | Bothmade Blog`,
      description: post.dek,
      url: `/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.date,
    },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) notFound();

  const { prev, next } = getAdjacentBlogPosts(slug);

  return (
    <>
      <script
        type="application/ld+json"
        // Same shape as the ProfessionalService block in the root layout: a
        // server-rendered script tag, so it is in the HTML a crawler is
        // handed rather than something it has to run JavaScript to find.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(post)) }}
      />
      <BlogPostPage post={post} prev={prev} next={next} />
    </>
  );
}
