import { Locale } from "@/i18n/routing";
import { cleanId, displayName } from "@/lib/display-name";
import { getT, getTryGameTranslations } from "@/lib/i18n-server";

export async function getCleanLocalize(args?: {
  locale?: Locale;
  namespace?: string;
  beta?: boolean;
}): Promise<(keyFn: (id: string) => string, id?: string) => string> {
  const t = await getT();
  const gT = await getTryGameTranslations(args);
  return (keyFn: (id: string) => string, id?: string) =>
    id ? (gT(keyFn(cleanId(id))) ?? displayName(id)) : t("Unknown");
}
