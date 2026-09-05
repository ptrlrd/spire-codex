// Guides are English-language content; localized requests render the same
// canonical page (see app/guides/[slug]/page.tsx) rather than force-
// redirecting to it. buildPageMetadata's supressLanguageAlternates keeps
// the canonical pointed at the English URL and noindexes every non-English
// request automatically, based on the resolved lang param this route
// passes through.
export { generateMetadata, default } from "@/app/guides/[slug]/page";
