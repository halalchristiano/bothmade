'use client';

import { motion, useReducedMotion } from 'framer-motion';

/**
 * Route transition veil. Next remounts a template on every navigation, so
 * each page arrives with a short rise-and-settle instead of a hard cut —
 * the same easing family as everything else on the site.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
