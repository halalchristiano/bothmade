import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

/**
 * Shared shell for the privacy and terms pages — nav, a readable prose column
 * on the site's dark ground, and the footer. Kept deliberately plain: legal
 * copy should be easy to read, not animated.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-6 pt-32 pb-24">
        <h1 className="text-4xl font-bold mb-2">{title}</h1>
        <p className="text-sm text-white/40 mb-12">Last updated: {updated}</p>
        <div className="space-y-6 text-white/70 leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-10 [&_h2]:mb-3 [&_a]:text-sky-300 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_strong]:text-white">
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}
