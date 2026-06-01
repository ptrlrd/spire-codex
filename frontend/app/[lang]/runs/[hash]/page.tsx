import { permanentRedirect } from "next/navigation";
import { isValidLang } from "@/lib/languages";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ lang: string; hash: string }> };

// Run-share pages are inherently English game data; localized variants
// were generating thousands of duplicate URLs in GSC ("Duplicate without
// user-selected canonical" cluster). Collapse all /<lang>/runs/<hash>
// requests to the canonical /runs/<hash>.
export default async function LangSharedRunRedirect({ params }: Props) {
  const { lang, hash } = await params;
  if (!isValidLang(lang)) {
    // Unknown locale segment: still redirect to the canonical page rather
    // than 404, so any stale Googlebot crawls collapse cleanly.
    permanentRedirect(`/runs/${hash}`);
  }
  permanentRedirect(`/runs/${hash}`);
}
