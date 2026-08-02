import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ScrollReset } from "@/components/ScrollReset";
import { ScrollProgress } from "@/components/ScrollProgress";
import { ScrollSeamIndicator } from "@/components/ScrollSeamIndicator";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Bothmade | Web & Apple Native Development",
    template: "%s",
  },
  description:
    "One studio for the web and every Apple platform. Websites, iOS and iPad apps, macOS software, and Vision Pro experiences — designed and shipped by one team.",
  keywords: [
    "web development agency",
    "iOS app development",
    "Vision Pro app development",
    "visionOS development",
    "macOS app development",
    "Next.js development",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    siteName: "Bothmade",
    type: "website",
    url: "/",
    title: "Bothmade | Web & Apple Native Development",
    description:
      "One studio for the web and every Apple platform. Web, iOS, iPad, Mac, and Vision Pro.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bothmade | Web & Apple Native Development",
    description:
      "One studio for the web and every Apple platform. Web, iOS, iPad, Mac, and Vision Pro.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
        {/* Machine-readable identity for search — what the site is, in the
            vocabulary Google actually indexes agencies by. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ProfessionalService',
              name: 'Bothmade',
              url: SITE_URL,
              description:
                'Web and native Apple development studio. Websites, iOS and iPad apps, macOS software, and Vision Pro experiences — designed and shipped by one team.',
              knowsAbout: [
                'Web development',
                'iOS app development',
                'macOS app development',
                'visionOS development',
                'Next.js',
                'SwiftUI',
              ],
            }),
          }}
        />
        <a
          href="#contact"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:rounded-full focus:bg-white focus:px-6 focus:py-3 focus:text-sm focus:font-medium focus:text-black"
        >
          Skip to contact form
        </a>
        <ScrollProgress />
        <ScrollReset />
        <ScrollSeamIndicator />
        {children}
      </body>
    </html>
  );
}
