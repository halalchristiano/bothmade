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

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) notFound();

  const { prev, next } = getAdjacentBlogPosts(slug);

  return <BlogPostPage post={post} prev={prev} next={next} />;
}
