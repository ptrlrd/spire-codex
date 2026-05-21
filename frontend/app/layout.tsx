import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "./components/Navbar";
import DonationBanner from "./components/DonationBanner";
import OverwolfBanner from "./components/OverwolfBanner";
import Footer from "./components/Footer";
import GlobalSearch from "./components/GlobalSearch";
import { Suspense } from "react";
import { LanguageProvider } from "./contexts/LanguageContext";
import { BetaVersionProvider } from "./contexts/BetaVersionContext";
import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE } from "@/lib/seo";

// Self-hosted Umami analytics. Both values are public-by-design — the
// browser fetches the script + sends the website ID on every page
// view — so there's no secret to manage. Hardcoding them as constants
// dodges Next.js's static-prerender trap: pages exporting
// `force-static` (most of the site) bake the layout at Docker build
// time, when runtime env vars aren't reachable, which silently strips
// the script tag from every prerendered page.
//
// Local-dev pollution is handled at the Umami side, not here — the
// website is configured with `spire-codex.com` as its allowed domain
// so pings from `localhost:3000` are rejected by Umami before they
// land in the stats.
const UMAMI_SRC = "https://analytics.spire-codex.com/script.js";
const UMAMI_WEBSITE_ID = "715a2b92-5064-4369-9d33-cdd1c0ea8f93";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `Database - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
  description:
    "Fan-built database for Slay the Spire 2 (sts2). Browse cards, relics, monsters, potions, events, powers, plus run stats and tier lists.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Spire Codex",
    // Default social card for every page that doesn't set its own
    // `openGraph.images`. Home pages override to the bare logo;
    // entity detail pages override to the entity sprite.
    images: [{ url: DEFAULT_OG_IMAGE, width: 3000, height: 3000 }],
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <LanguageProvider>
          <Suspense>
            <BetaVersionProvider>
              <Navbar />
              <div className="pt-16">
                <OverwolfBanner />
                <DonationBanner />
                {/* tabIndex=-1 lets Navbar's main.focus() (PR #142) clear
                    focus-within from the dropdown after route changes. The
                    outline-none is required because the programmatic focus
                    would otherwise paint a visible browser focus ring around
                    the entire content area, which read as a stray "tab" line
                    underneath the donation banner on every navigation. */}
                <main tabIndex={-1} className="outline-none">{children}</main>
              </div>
              <Footer />
              <GlobalSearch />
            </BetaVersionProvider>
          </Suspense>
        </LanguageProvider>
        {UMAMI_SRC && UMAMI_WEBSITE_ID && (
          <Script
            src={UMAMI_SRC}
            data-website-id={UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
            defer
          />
        )}
      </body>
    </html>
  );
}
