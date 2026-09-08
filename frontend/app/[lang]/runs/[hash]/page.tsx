// Run-share pages are inherently English game data; localized requests
// render the canonical page (see app/runs/[hash]/page.tsx) rather than
// force-redirecting to it. buildPageMetadata's supressLanguageAlternates
// keeps the canonical pointed at the English URL and noindexes every
// non-English request automatically.
export const dynamic = "force-dynamic";
export { generateMetadata, default } from "@/app/runs/[hash]/page";
