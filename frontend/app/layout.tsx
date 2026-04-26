import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "./components/Navbar";
import DonationBanner from "./components/DonationBanner";
import Footer from "./components/Footer";
import GlobalSearch from "./components/GlobalSearch";
import { Suspense } from "react";
import { LanguageProvider } from "./contexts/LanguageContext";
import { BetaVersionProvider } from "./contexts/BetaVersionContext";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

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
  title: `${SITE_NAME} - Slay the Spire 2 Database`,
  description:
    "A comprehensive database for Slay the Spire 2 — browse cards, relics, characters, monsters, and potions.",
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
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
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
      </body>
    </html>
  );
}
