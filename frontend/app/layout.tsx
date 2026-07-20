import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Kreon } from "next/font/google";
import "./globals.css";
import Navbar from "./components/Navbar";
import BetaChrome from "./components/BetaChrome";
import AlertTicker from "./components/AlertTicker";
import Footer from "./components/Footer";
import GlobalSearch from "./components/GlobalSearch";
import FloatingFeedback from "./components/FloatingFeedback";
import NitroAnchor from "./components/NitroAnchor";
import HighlightFeedback from "./components/HighlightFeedback";
import { LanguageProvider } from "./contexts/LanguageContext";
import { BetaVersionProvider } from "./contexts/BetaVersionContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./components/Toast";
import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE } from "@/lib/seo";

// Self-hosted Umami analytics. Both values are public-by-design, the
// browser fetches the script + sends the website ID on every page
// view, so there's no secret to manage.
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
// Local-dev pollution is handled at the Umami side, not here, each
// website is configured with its own allowed domain so pings from
// `localhost:3000` are rejected before they land in the stats.
const UMAMI_SRC = "https://analytics.spire-codex.com/script.js";
const UMAMI_WEBSITE_ID =
  process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || "715a2b92-5064-4369-9d33-cdd1c0ea8f93";

// Google Analytics 4 + Google Tag Manager, running alongside Umami. Both ids
// are public-by-design like the Umami website id. GTM could load the GA tag
// itself, but keeping the direct gtag include means pageviews keep flowing
// even while the GTM container is empty or misconfigured.
const GA_ID = "G-9ZKSNKCV77";
const GTM_ID = "GTM-NKVKGMVS";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The site typeface: Kreon, the serif Slay the Spire 2 uses, self-hosted via
// next/font (woff2, weights 300-700). Geist stays loaded as the fallback. The
// 1:1 card renderer keeps its own exact local Kreon @font-face for pixel match.
const kreon = Kreon({
  variable: "--font-kreon",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Belt-and-suspenders alongside the beta branch in robots.ts. Some bots
// honor robots.txt only partially; an explicit noindex meta on every
// beta page makes it impossible for a beta URL to enter the index.
const IS_BETA = /beta\./i.test(SITE_URL);

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `Database - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
  description:
    "Fan-built database for Slay the Spire 2 (sts2). Browse cards, relics, monsters, potions, events, powers, plus run stats and tier lists.",
  ...(IS_BETA && { robots: { index: false, follow: false } }),
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
      {/* React hoists these into <head>. Preconnecting to the CDN saves a
          DNS + TLS round trip before the first image request — on mobile
          RTTs that's a few hundred ms off every art-heavy page. */}
      <link rel="preconnect" href="https://cdn.spire-codex.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://cdn.spire-codex.com" />
      {/* NitroPay: the queue stub must exist before any createAd call, and
          the loader wants <head> placement so the auction starts early.
          beforeInteractive injects both into <head>. Production builds only —
          Nitro authorizes spire-codex.com, so dev would just log errors. */}
      {process.env.NODE_ENV === "production" && (
        <>
          <Script id="nitro-stub" strategy="beforeInteractive">
            {`window.nitroAds=window.nitroAds||{createAd:function(){return new Promise(e=>{window.nitroAds.queue.push(["createAd",arguments,e])})},addUserToken:function(){window.nitroAds.queue.push(["addUserToken",arguments])},queue:[]};`}
          </Script>
          <Script
            src="https://s.nitropay.com/ads-2467.js"
            strategy="beforeInteractive"
            data-cfasync="false"
            data-spa="auto"
            async
          />
        </>
      )}
      <body
        className={`${kreon.variable} ${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');document.documentElement.classList.remove('dark');}else{document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`,
          }}
        />
        {/* No Suspense between here and the page: a boundary above {children}
            made every dynamic page stream its whole body after the shell,
            so non-JS crawlers saw pages with no h1 and no text. The only
            component that needed it (BetaVersionProvider's useSearchParams)
            reads window.location instead now. */}
        <LanguageProvider>
            <BetaVersionProvider>
              <AuthProvider>
              <ToastProvider>
              <Navbar />
              <div className="pt-16">
                <AlertTicker />
                {/* tabIndex=-1 lets Navbar's main.focus() (PR #142) clear
                    focus-within from the dropdown after route changes. The
                    outline-none is required because the programmatic focus
                    would otherwise paint a visible browser focus ring around
                    the entire content area, which read as a stray "tab" line
                    underneath the donation banner on every navigation. */}
                <BetaChrome />
                <main tabIndex={-1} className="outline-none">{children}</main>
              </div>
              <Footer />
              <GlobalSearch />
              <FloatingFeedback />
              {process.env.NODE_ENV === "production" && <NitroAnchor />}
              <HighlightFeedback />
              </ToastProvider>
              </AuthProvider>
            </BetaVersionProvider>
        </LanguageProvider>
        {UMAMI_SRC && UMAMI_WEBSITE_ID && (
          <Script
            src={UMAMI_SRC}
            data-website-id={UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
            defer
          />
        )}
        {/* Google tag (gtag.js) */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
        </Script>
        {/* Google Tag Manager */}
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
      </body>
    </html>
  );
}
