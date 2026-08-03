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
  stackIntro:
    "None of this is chosen to look impressive on a slide — every piece here is what we'd pick building our own product, and each one earns its place by removing a way your site could break or slow down later. TypeScript catches the bugs a looser language would ship to production. Next.js and Vercel mean your pages load fast without you thinking about servers. Boring, proven tools age well; trendy ones become the reason a rebuild costs more than the original build did.",
  stack: [
    {
      heading: 'Frontend',
      desc: "What your visitors actually touch, so it's held to the highest bar. React and Next.js render pages fast and rank well on Google; TypeScript means the interface behaves the same for every visitor, not just the ones who clicked in the right order during testing.",
      items: ['React & Next.js', 'TypeScript', 'Tailwind CSS', 'Framer Motion'],
    },
    {
      heading: 'Backend',
      desc: "The part nobody sees but everything depends on — accounts, data, files. Postgres and Supabase are the same database technology banks and Fortune 500s run on, not a trendy database that might not exist in three years when you need to change something.",
      items: ['Node.js / API Routes', 'PostgreSQL & Supabase', 'Auth & sessions', 'S3 file storage'],
    },
    {
      heading: 'Infrastructure',
      desc: "How it stays up, gets paid, and tells you what's working. Vercel means no server for you to maintain or renew; Stripe means payments that just work; analytics means you're not guessing which marketing dollar is actually earning its keep.",
      items: [
        'Vercel edge hosting',
        'GitHub Actions CI/CD',
        'Stripe payments',
        'Analytics & monitoring',
      ],
    },
  ],
  cta: {
    title: 'Let’s build your web presence.',
    sub: 'From first sketch to production deploy — and the monitoring that comes after.',
    label: 'Start a project',
  },
};

export default function WebPage() {
  return <ServicePage data={DATA} hero={<WebHero />} />;
}
