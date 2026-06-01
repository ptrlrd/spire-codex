import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

// /<lang>/runs is a localized chrome wrapper around the same Browse Runs
// data as /runs. Google was bucketing the 13 localized variants as
// duplicates of the canonical English page. Collapse them with a 301 so
// the canonical /runs absorbs all the equity.
export default function LangRunsRedirect() {
  permanentRedirect("/runs");
}
