'use client';

import Link from 'next/link';

export default function CheckoutSuccessPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg text-center">
        <div className="bg-white rounded-2xl shadow-lg p-10">
          <div className="w-16 h-16 rounded-full bg-black text-white flex items-center justify-center text-3xl mx-auto mb-6">
            ✓
          </div>
          <h1 className="text-3xl font-bold mb-4">Payment Received</h1>
          <p className="text-gray-600 mb-6">
            Thanks for starting your project with Bothmade! We've created your account and
            sent your login details to your email, along with a temporary password.
          </p>
          <p className="text-gray-600 mb-8">
            Check your inbox, then log in to your dashboard to track progress and message
            the team.
          </p>
          <Link
            href="/client/login"
            className="inline-block bg-black text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-900 transition-colors"
          >
            Go to Client Login
          </Link>
        </div>
      </div>
    </main>
  );
}
