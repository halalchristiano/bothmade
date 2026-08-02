import type { Metadata } from 'next';
import { ServicePage, type ServicePageData } from '@/components/ServicePage';
import { WebHero } from '@/components/heroes/WebHero';

export const metadata: Metadata = {
  title: 'Web Development | Bothmade',
  description:
    'Marketing sites, SaaS platforms, and dashboards built with React, Next.js, and TypeScript. Fast, accessible, and built to convert.',
  alternates: { canonical: '/web' },
  openGraph: {
    title: 'Web Development | Bothmade',
    description:
      'Marketing sites, SaaS platforms, and dashboards built with React, Next.js, and TypeScript.',
    url: '/web',
    type: 'website',
  },
};

const DATA: ServicePageData = {
  accent: 'sky',
  capabilities: [
    {
      title: 'Marketing Sites',
      desc: 'High-converting pages that tell your story. SEO-ready, sub-two-second loads, flawless on every screen.',
    },
    {
      title: 'SaaS Platforms',
      desc: 'Accounts, billing, dashboards, real-time sync. The unglamorous plumbing done properly.',
    },
    {
      title: 'E-commerce',
      desc: 'Storefronts built for revenue. Inventory, checkout, shipping, and the analytics to tune it.',
    },
    {
      title: 'Data & Dashboards',
      desc: 'Visualization tools that make complicated information feel obvious at a glance.',
    },
  ],
  stack: [
    {
      heading: 'Frontend',
      items: ['React & Next.js', 'TypeScript', 'Tailwind CSS', 'Framer Motion'],
    },
    {
      heading: 'Backend',
      items: ['Node.js / API Routes', 'PostgreSQL & Supabase', 'Auth & sessions', 'S3 file storage'],
    },
    {
      heading: 'Infrastructure',
      items: [
        'Vercel edge hosting',
        'GitHub Actions CI/CD',
        'Stripe payments',
        'Analytics & monitoring',
      ],
    },
  ],
  startService: 'website',
  contactService: 'web',
  cta: {
    title: 'Let’s build your web presence.',
    sub: 'From first sketch to production deploy — and the monitoring that comes after.',
    label: 'Start a project',
  },
};

export default function WebPage() {
  return <ServicePage data={DATA} hero={<WebHero />} />;
}
