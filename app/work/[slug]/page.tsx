import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CaseStudyPage } from '@/components/CaseStudy';
import { PUBLISHED_CASE_STUDIES, getCaseStudy, getNextCaseStudy } from '@/lib/case-studies';

export const dynamicParams = false;

export function generateStaticParams() {
  // Only build pages for published studies — in-progress drafts must not be
  // reachable by paid or organic traffic.
  return PUBLISHED_CASE_STUDIES.map(({ slug }) => ({ slug }));
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
    },
    // Unpublished studies stay out of the index until they say something real.
    robots: study.status === 'live' ? undefined : { index: false, follow: true },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const study = getCaseStudy(slug);

  // Defensive: only live studies are public (dynamicParams=false already 404s
  // unpublished slugs, but never render an in-progress draft even if reached).
  if (!study || study.status !== 'live') notFound();

  return <CaseStudyPage study={study} next={getNextCaseStudy(slug)} />;
}
