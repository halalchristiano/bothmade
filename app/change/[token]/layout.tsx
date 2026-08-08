import type { Metadata } from 'next';

/**
 * A capability link: the URL is the credential.
 *
 * The page itself is a client component, so it cannot export metadata — and
 * without this it inherited the root layout's, which meant two things. The
 * tab and every link preview said "Bothmade | Web & Apple Native Development",
 * the marketing homepage, on a page a client is explicitly invited to forward
 * to their own team. And the robots tag said `index, follow`: an instruction
 * to index somebody's change order, served on the page itself.
 *
 * robots.txt already disallows this path, but that only asks a crawler not to
 * fetch — a URL it reaches another way can still be indexed, and nothing at
 * all stops a link-preview bot. `/stop` has carried this since it was written;
 * these five were missed because a client component cannot say it inline.
 */
export const metadata: Metadata = {
  title: 'Change to your project',
  description: 'A change to approve or decline.',
  robots: { index: false, follow: false },
};

export default function CapabilityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
