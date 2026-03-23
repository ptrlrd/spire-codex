import type { Metadata } from "next";
import { generateLocalizedMetadata, LocalizedDetailPage } from "../../detail-page";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ lang: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  return generateLocalizedMetadata("potions", lang, id);
}

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  return <LocalizedDetailPage entityType="potions" lang={lang} id={id} />;
}
