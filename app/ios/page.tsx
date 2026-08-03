import type { Metadata } from 'next';
import { ServicePage, type ServicePageData } from '@/components/ServicePage';
import { IOSHero } from '@/components/heroes/IOSHero';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'iOS, iPad & Mac App Development | Bothmade',
  description:
    'Native Apple software in Swift and SwiftUI. iPhone, iPad, and macOS apps built for App Store approval, retention, and revenue.',
  alternates: { canonical: '/ios' },
  openGraph: {
    title: 'iOS, iPad & Mac App Development | Bothmade',
    description:
      'Native Apple software in Swift and SwiftUI, built for App Store approval, retention, and revenue.',
    url: '/ios',
    type: 'website',
    images: [{ url: `${SITE_URL}/opengraph-image` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'iOS, iPad & Mac App Development | Bothmade',
    description:
      'Native Apple software in Swift and SwiftUI, built for App Store approval, retention, and revenue.',
    images: [`${SITE_URL}/opengraph-image`],
  },
};

const DATA: ServicePageData = {
  accent: 'indigo',
  capabilities: [
    {
      title: 'Swift & SwiftUI',
      desc: 'Modern, performant apps on current Apple frameworks. No cross-platform compromises.',
    },
    {
      title: 'App Store Strategy',
      desc: 'We know how review works. Architecture, compliance, metadata, and launch sequencing.',
    },
    {
      title: 'Backend & Sync',
      desc: 'Secure APIs, offline-first sync, push notifications, and cloud infrastructure that scales.',
    },
    {
      title: 'Monetization',
      desc: 'In-app purchases, subscriptions, paywalls, and the behavioral analytics to tune them.',
    },
    {
      title: 'macOS Desktop',
      desc: 'Menu bar utilities to full desktop suites. Software that respects platform conventions.',
    },
  ],
  stack: [
    {
      heading: 'Language',
      items: ['Swift', 'SwiftUI', 'UIKit & AppKit', 'Combine'],
    },
    {
      heading: 'Data',
      items: ['SwiftData & Core Data', 'CloudKit', 'Realm', 'Keychain'],
    },
    {
      heading: 'Pipeline',
      items: ['Xcode Cloud', 'TestFlight', 'Fastlane', 'App Store Connect'],
    },
  ],
  cta: {
    title: 'Ready to build your app?',
    sub: 'Tell us the idea. We’ll tell you honestly what it takes to ship it well.',
    label: 'Get in touch',
  },
};

export default function IOSPage() {
  return <ServicePage data={DATA} hero={<IOSHero />} />;
}
