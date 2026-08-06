import type { Metadata } from 'next';
import { RigidizedShell } from './RigidizedUI';

/**
 * A private design concept for Rigidized Metals Corporation.
 *
 * `robots: index false` is not decoration. This uses another company's name
 * and product designations to show them what a tool built around their own
 * catalogue could look like — which is ordinary practice for a pitch, and
 * only stays ordinary while the page is unmistakably a concept and never
 * competes with their real site in search. The banner at the top of every
 * page says whose it is and what it is not.
 */
export const metadata: Metadata = {
  title: 'Rigidized Metals · Pattern & finish selector — concept',
  description:
    'An unsolicited design concept by Bothmade: a pattern, finish and application selector for Rigidized Metals Corporation.',
  robots: { index: false, follow: false },
};

export default function RigidizedLayout({ children }: { children: React.ReactNode }) {
  return <RigidizedShell>{children}</RigidizedShell>;
}
