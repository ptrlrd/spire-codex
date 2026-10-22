import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import SandboxClient from "./SandboxClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({
    locale,
    path: "/sandbox",
    title: t("Combat Sandbox"),
    description: t(
      "Explore plays from a combat position exported by Spire Codex.",
    ),
    noIndex: true,
  });
}

export default function SandboxPage() {
  return <SandboxClient />;
}
