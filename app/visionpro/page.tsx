import type { Metadata } from 'next';
import { ServicePage, type ServicePageData } from '@/components/ServicePage';
import { VisionHero } from '@/components/heroes/VisionHero';

export const metadata: Metadata = {
  title: 'Apple Vision Pro & visionOS Development | Bothmade',
  description:
    'Spatial computing apps for Apple Vision Pro. visionOS development in SwiftUI and RealityKit — immersive spaces, hand tracking, and 3D content pipelines.',
  alternates: { canonical: '/visionpro' },
  openGraph: {
    title: 'Apple Vision Pro & visionOS Development | Bothmade',
    description:
      'Spatial computing apps for Apple Vision Pro, built in SwiftUI and RealityKit.',
    url: '/visionpro',
    type: 'website',
  },
};

const DATA: ServicePageData = {
  accent: 'purple',
  capabilities: [
    {
      title: 'visionOS Applications',
      desc: 'Native spatial apps in SwiftUI and RealityKit. Windows, volumes, and fully immersive spaces.',
    },
    {
      title: 'Spatial Interaction',
      desc: 'Gaze targeting, hand gestures, and spatial audio designed to feel effortless rather than clever.',
    },
    {
      title: '3D Content Pipelines',
      desc: 'Model optimization, USDZ pipelines, and materials tuned for headset rendering budgets.',
    },
    {
      title: 'Enterprise & Training',
      desc: 'Simulation, visualization, and collaborative review for teams working with physical things.',
    },
  ],
  stackIntro:
    "Vision Pro is new enough that most of what's written about it is theory, not shipped software. We build in Apple's own frameworks rather than a cross-platform wrapper — because a wrapper is what makes an app feel like a port instead of something designed for the headset, and on a platform this new, that difference is the whole pitch to your users. The stack below is what actually gets a spatial app from a sketch to the App Store, not just a demo that looks good in a pitch.",
  stack: [
    {
      heading: 'Frameworks',
      items: ['visionOS SDK', 'RealityKit', 'SwiftUI', 'ARKit'],
    },
    {
      heading: 'Content',
      items: ['USDZ / Reality Composer', 'Blender pipelines', 'PBR materials', 'Spatial audio'],
    },
    {
      heading: 'Delivery',
      items: ['Vision Pro simulator', 'On-device profiling', 'TestFlight', 'App Store Connect'],
    },
  ],
  cta: {
    title: 'Plant your flag early.',
    sub: 'The studios that define this platform are building on it right now.',
    label: 'Start your Vision Pro project',
  },
};

export default function VisionProPage() {
  return <ServicePage data={DATA} hero={<VisionHero />} />;
}
