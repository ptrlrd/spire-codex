import { LANG_PREFIXES } from "./languages";

export const AD_FREE_PREFIXES = ["/admin", "/deck-lab", "/seed-lab"];

export function stripLangPrefix(pathname: string | null | undefined): string {
  if (!pathname) return "/";
  const [, first, ...rest] = pathname.split("/");
  if (first && LANG_PREFIXES.has(first)) {
    return "/" + rest.join("/");
  }
  return pathname;
}

export function isAdFree(pathname: string | null | undefined): boolean {
  const path = stripLangPrefix(pathname);
  return AD_FREE_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}
