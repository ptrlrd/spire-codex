import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import LivePlayerClient from "./LivePlayerClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getT(localeOf((await params).locale));
  return { title: t("Live"), robots: { index: false, follow: false } };
}

export default function LivePlayerPage() {
  return <LivePlayerClient />;
}
