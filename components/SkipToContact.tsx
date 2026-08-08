'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The marketing site's skip link, offered only where it goes somewhere.
 *
 * It lived inline in the root layout, and the root layout wraps everything —
 * so every admin page opened with "Skip to contact form" as the first thing
 * Tab reached, pointing at a `#contact` that exists on the marketing pages
 * and nowhere else. Pressing it did nothing at all.
 *
 * That got worse rather than better when the admin gained its own skip link:
 * the dead one is earlier in the DOM, so it took the first Tab and the real
 * one took the second. A keyboard user's first move on every admin screen was
 * a link that goes nowhere, followed by the link they wanted.
 *
 * The target decides. Rather than listing which routes have a contact form —
 * a list that would be wrong the first time somebody adds a page — this asks
 * the document whether `#contact` is actually there, and says nothing when it
 * isn't. Re-checked on navigation, because this survives client-side route
 * changes.
 *
 * Rendered by default and withdrawn on mount, so the marketing site keeps a
 * working skip link with JavaScript off — which is the case it exists for.
 */
export function SkipToContact() {
  const pathname = usePathname();
  const [hasTarget, setHasTarget] = useState(true);

  useEffect(() => {
    setHasTarget(!!document.getElementById('contact'));
  }, [pathname]);

  if (!hasTarget) return null;

  return (
    <a
      href="#contact"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:rounded-full focus:bg-white focus:px-6 focus:py-3 focus:text-sm focus:font-medium focus:text-black"
    >
      Skip to contact form
    </a>
  );
}
