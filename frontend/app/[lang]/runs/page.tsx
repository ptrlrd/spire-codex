// /<lang>/runs is a localized chrome wrapper around the same Browse Runs
// data as /runs; it renders the canonical page (see app/runs/page.tsx)
// rather than force-redirecting to it. buildPageMetadata's
// supressLanguageAlternates keeps the canonical pointed at the English
// URL and noindexes every non-English request automatically.
export { generateMetadata, default } from "@/app/runs/page";
