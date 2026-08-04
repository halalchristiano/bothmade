import type { Metadata } from 'next';
import { BrandonShell } from './BrandonUI';

export const metadata: Metadata = {
  title: 'Brandon Roofing · Local since 1990',
  description: 'A private homepage concept for Brandon Roofing in Morris County, New Jersey.',
  robots: { index: false, follow: false },
};

export default function BrandonLayout({ children }: { children: React.ReactNode }) {
  return <BrandonShell>{children}</BrandonShell>;
}
