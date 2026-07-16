import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ lang: string; slug: string }> };

// Guides are English-language content; the localized wrappers served the
// same English body on 13 URLs per guide, which crawlers flagged as
// language mismatches and near-duplicates (same pattern as /<lang>/runs).
// Collapse them onto the canonical English guide. The viewer's language
// preference survives the redirect through the language context, so
// navigation from the guide stays in their locale.
export default async function LangGuideRedirect({ params }: Props) {
  const { slug } = await params;
  permanentRedirect(`/guides/${slug}`);
}
