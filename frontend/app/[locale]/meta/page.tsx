import { permanentRedirect } from "@/i18n/navigation";
import { localeOf } from "@/lib/locale";

type Props = { params: Promise<{ locale: string }> };

// Legacy alias for the stats page; keeps the visitor's language.
export default async function MetaPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  permanentRedirect({ href: "/leaderboards/stats", locale });
}
