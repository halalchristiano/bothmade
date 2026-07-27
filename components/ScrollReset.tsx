'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Native scrolling only — no hijack library. Smooth-scroll libs intercept
 * wheel/keyboard input and are exactly why "up and down stopped working";
 * the browser's own scrolling cannot break. This component just makes sure
 * a route change starts you at the top (unless a #hash is doing the aiming).
 */
export function ScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
