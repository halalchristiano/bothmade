'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { trackEvent } from '@/lib/analytics';

export default function ContactSuccessPage() {
  useEffect(() => {
    trackEvent('contact_success');
  }, []);

  return (
    <main className="min-h-screen bg-[#05030a] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg text-center">
        <div className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center text-3xl mx-auto mb-6">
          ✓
        </div>
        <h1 className="text-3xl font-bold mb-4">Message received</h1>
        <p className="text-white/50 mb-8">
          Thanks for reaching out — we&apos;ll reply within 24 hours. In the meantime, feel
          free to browse our services or see how pricing works.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/start"
            className="inline-block bg-white text-black px-6 py-3 rounded-lg font-semibold hover:bg-white/90 transition-colors"
          >
            See pricing
          </Link>
          <Link
            href="/"
            className="inline-block border border-white/20 px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
