import type { Metadata } from "next";
import { resolveSiteUrl } from '@/lib/site-url';
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import "./globals.css";
import { ScrollReset } from "@/components/ScrollReset";
import { ScrollProgress } from "@/components/ScrollProgress";
import { ScrollSeamIndicator } from "@/components/ScrollSeamIndicator";
import { SkipToContact } from "@/components/SkipToContact";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = resolveSiteUrl();

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
              email: 'info@bothmade.studio',
              logo: `${SITE_URL}/icon`,
              image: `${SITE_URL}/opengraph-image`,
              // Signals the bracket without publishing a rate card in schema.
              priceRange: '$$$',
              address: {
                '@type': 'PostalAddress',
                streetAddress: 'Suite 695, 80A Ruskin Ave',
                addressLocality: 'Welling',
                addressRegion: 'London',
                postalCode: 'DA16 3QQ',
                addressCountry: 'GB',
              },
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
        {/* Only on pages that actually have a contact form — see the
            component. This is the root layout, so it wraps the admin too, and
            an admin page opened with a skip link to a #contact that does not
            exist there. */}
        <SkipToContact />
        <ScrollProgress />
        <ScrollReset />
        <ScrollSeamIndicator />
        {children}
        {/* Page views + conversion data. No-op outside Vercel deployments,
            so local dev and CI stay clean. */}
        <Analytics />

        {/* GA4, for importing conversions into the ad platforms. Kept
            alongside Vercel Analytics rather than replacing it, and loaded
            only once NEXT_PUBLIC_GA_MEASUREMENT_ID is set — until then no
            script is fetched and no cookie is written. */}
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
      </body>
    </html>
  );
}
