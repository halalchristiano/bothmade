import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlogPostPage } from '@/components/BlogPost';
import { BLOG_POSTS, getBlogPost, getAdjacentBlogPosts } from '@/lib/blog';

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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) notFound();

  const { prev, next } = getAdjacentBlogPosts(slug);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.dek,
            datePublished: post.date,
            dateModified: post.date,
            url: `${SITE_URL}/blog/${post.slug}`,
            author: {
              '@type': 'Organization',
              name: 'Bothmade',
              url: SITE_URL,
            },
            publisher: {
              '@type': 'Organization',
              name: 'Bothmade',
              url: SITE_URL,
            },
            mainEntityOfPage: {
              '@type': 'WebPage',
              '@id': `${SITE_URL}/blog/${post.slug}`,
            },
          }),
        }}
      />
      <BlogPostPage post={post} prev={prev} next={next} />
    </>
  );
}
