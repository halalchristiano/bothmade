import type { Metadata } from 'next';
import { ServicePage, type ServicePageData } from '@/components/ServicePage';
import { IOSHero } from '@/components/heroes/IOSHero';

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
  stackIntro:
    "We build native, in Apple's own tools, rather than a cross-platform framework that treats iOS as one target among many. That's the difference between an app that feels like it shipped from Cupertino and one that feels like a web page wearing an app icon — smoother animations, faster launches, and none of the small platform quirks a wrapper never quite gets right. It's also what keeps you off the upgrade treadmill: native apps pick up new iOS features on day one instead of waiting on a third-party framework to catch up.",
  stack: [
    {
      heading: 'Language',
      desc: "Swift and SwiftUI are Apple's own — the same language and framework Apple's own apps are built in, updated the same day iOS is. That means your app looks and moves like it belongs on the device, instead of a few versions behind the platform.",
      items: ['Swift', 'SwiftUI', 'UIKit & AppKit', 'Combine'],
    },
    {
      heading: 'Data',
      desc: "Where your users' information actually lives, chosen for what the app needs to do — CloudKit syncs across a user's own devices for free, Keychain keeps credentials genuinely secure instead of sitting in a plain file. The right choice here is invisible when it works and very visible when it doesn't.",
      items: ['SwiftData & Core Data', 'CloudKit', 'Realm', 'Keychain'],
    },
    {
      heading: 'Pipeline',
      desc: "How the app actually reaches the App Store, repeatably, without a manual checklist someone forgets a step of. TestFlight gets builds to real testers before launch; Fastlane means submitting an update is a command, not an afternoon.",
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
