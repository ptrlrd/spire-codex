import type { Metadata } from "next";
import BrowseRunsClient from "./BrowseRunsClient";
import { getLangOrDefault } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import { buildPageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const langCode = getLangOrDefault(lang);
  return buildPageMetadata({
    langParam: lang,
    path: "/runs",
    title: t("Browse Runs", langCode),
    description: t("runs_tagline", langCode),
    // The run list is the same English game data whatever the locale
    // chrome, and localized variants used to generate a "Duplicate
    // without user-selected canonical" cluster in GSC — this route used
    // to force-redirect /<lang>/runs to /runs to avoid that. Canonical
    // now folds back to the English page instead of a redirect, and
    // non-English requests get noindex automatically (see
    // buildPageMetadata's supressLanguageAlternates), so the page
    // renders (translated chrome, untranslated data) without being
    // counted as a competing indexable duplicate. Drop this once UI
    // translation coverage makes each locale genuinely distinct.
    supressLanguageAlternates: true,
  });
}

export default function BrowseRunsPage() {
  return <BrowseRunsClient />;
}
