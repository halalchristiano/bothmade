import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CaseStudyPage } from '@/components/CaseStudy';
import { CASE_STUDIES, getCaseStudy, getNextCaseStudy } from '@/lib/case-studies';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export function generateStaticParams() {
  return CASE_STUDIES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const study = getCaseStudy(slug);

  if (!study) return { title: 'Not found | Bothmade' };

  return {
    title: `${study.title} | Bothmade`,
    description: study.summary,
    alternates: { canonical: `/work/${study.slug}` },
    openGraph: {
      title: `${study.title} | Bothmade`,
      description: study.summary,
      url: `/work/${study.slug}`,
      type: 'article',
      images: [{ url: `${SITE_URL}/opengraph-image` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${study.title} | Bothmade`,
      description: study.summary,
      images: [`${SITE_URL}/opengraph-image`],
    },
    // Unpublished studies stay out of the index until they say something real.
    robots: study.status === 'live' ? undefined : { index: false, follow: true },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const study = getCaseStudy(slug);

  if (!study) notFound();

  return <CaseStudyPage study={study} next={getNextCaseStudy(slug)} />;
}
