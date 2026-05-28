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
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./components/Toast";
import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE } from "@/lib/seo";

// Self-hosted Umami analytics. Both values are public-by-design — the
// browser fetches the script + sends the website ID on every page
// view — so there's no secret to manage.
//
// `UMAMI_WEBSITE_ID` reads NEXT_PUBLIC_UMAMI_WEBSITE_ID, a BUILD-TIME
// env var injected by frontend/Dockerfile via a build ARG. CI passes
// the stable Umami property's UUID to the stable image build and the
// beta property's UUID to the beta image build, so beta.spire-codex.com
// reports into its own Umami dashboard separate from the stable site.
// The fallback constant keeps `npm run dev` working without env setup.
//
// Don't switch this to a runtime env var: pages exporting
// `force-static` (most of the site) bake the layout at Docker build
// time, after which runtime env changes aren't reachable, which would
// silently strip the script tag from every prerendered page.
//
// Local-dev pollution is handled at the Umami side, not here — each
// website is configured with its own allowed domain so pings from
// `localhost:3000` are rejected before they land in the stats.
const UMAMI_SRC = "https://analytics.spire-codex.com/script.js";
const UMAMI_WEBSITE_ID =
  process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || "715a2b92-5064-4369-9d33-cdd1c0ea8f93";

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
              <AuthProvider>
              <ToastProvider>
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
              </ToastProvider>
              </AuthProvider>
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
