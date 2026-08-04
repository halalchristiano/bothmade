import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Brandon Roofing · Roof Intelligence Concept',
  description: 'An immersive interactive concept for Brandon Roofing.',
  robots: { index: false, follow: false },
};

export default function ImmersiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
