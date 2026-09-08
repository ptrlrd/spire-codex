import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf } from "@/lib/locale";
import { entityDescription, entityFallbackDescription, entityTitle, uiText } from "@/lib/locale-server";
import AchievementDetail from "./AchievementDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  try {
    const res = await fetch(`${API_INTERNAL}/api/achievements/${id}${langQuery(locale)}`);
    if (!res.ok) return { title: "Achievement Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const achievement = await res.json();
    const desc = stripTagsFlat(achievement.description || "");
    const title = locale === "eng" ? `${achievement.name} - Slay the Spire 2 Achievement | Spire Codex` : entityTitle(locale, achievement.name, "Achievement");
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `${achievement.name} is an achievement in Slay the Spire 2 (sts2)${desc ? `: ${desc}` : "."}`,
    )
      : entityDescription(locale, achievement.name, "achievement", desc);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/achievements/${id}`)}`,
        title,
        description: metaDesc,
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/achievements/${id}`), languages: buildLanguageAlternates(`/achievements/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  let jsonLd = null;
  let achievement = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/achievements/${id}${langQuery(locale)}`);
    if (res.ok) {
      achievement = await res.json();
      const desc = stripTags(achievement.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: achievement.name,
        description: desc || entityFallbackDescription(locale, achievement.name, "achievement"),
        path: localePath(locale, `/achievements/${id}`),
        category: "Achievement",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Reference"), href: localePath(locale, "/reference") },
          { name: achievement.name, href: localePath(locale, `/achievements/${id}`) },
        ],
      });
      const faqQuestions = [
        { question: `How do you unlock the ${achievement.name} achievement in Slay the Spire 2?`, answer: desc || `${achievement.name} is an achievement in Slay the Spire 2.` },
      ];
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!achievement) redirectMissingEntity("achievements", id, locale === "eng" ? undefined : locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AchievementDetail initialAchievement={achievement} />
    </>
  );
}
