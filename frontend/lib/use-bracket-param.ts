import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_SOLO_BRACKET, normalizeBracket } from "./content-brackets";

export function useBracketParam(fallback = DEFAULT_SOLO_BRACKET) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("bracket");
  const bracket = raw ? normalizeBracket(raw) : fallback;
  const setBracket = useCallback(
    (b: string) => {
      const p = new URLSearchParams(searchParams.toString());
      if (b === fallback) p.delete("bracket");
      else p.set("bracket", b);
      const qs = p.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams, fallback],
  );
  return [bracket, setBracket] as const;
}
