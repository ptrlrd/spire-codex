"use client";

import { useGameLocale, useT } from "@/lib/i18n";
import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { Enchantment } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import SearchFilter from "@/app/components/SearchFilter";
import RichDescription from "@/app/components/RichDescription";
import { useChannel, useBetaPrefix } from "@/lib/use-lang-prefix";
import { imageUrl } from "@/lib/image-url";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const cardTypeColors: Record<string, string> = {
  Attack: "bg-red-950/50 text-red-300 border-red-900/30",
  Skill: "bg-blue-950/50 text-blue-300 border-blue-900/30",
  Power: "bg-purple-950/50 text-purple-300 border-purple-900/30",
};

const cardTypeOptions = [
  { label: "Attack", value: "Attack" },
  { label: "Skill", value: "Skill" },
  { label: "Power", value: "Power" },
];

function EnchantmentsClientInner({ initialEnchantments }: { initialEnchantments: Enchantment[] }) {
  const bp = useBetaPrefix();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [enchantments, setEnchantments] = useState<Enchantment[]>(initialEnchantments);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [cardType, setCardType] = useState(searchParams.get("cardType") || "");
  const lang = useGameLocale();
  const t = useT();
  const channel = useChannel();
  const initialRender = useRef(true);

  const updateUrl = useCallback((newState: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(newState)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.replace(`${bp}/enchantments${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, bp]);

  const setFilterAndUrl = useCallback((key: string, value: string, setter: (v: string) => void) => {
    setter(value);
    const current: Record<string, string> = { search, cardType };
    current[key] = value;
    updateUrl(current);
  }, [search, cardType, updateUrl]);

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with no filters
    if (initialRender.current) {
      initialRender.current = false;
      if (channel !== "beta" && lang === "eng" && !cardType && !search && initialEnchantments.length > 0) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (cardType) params.set("card_type", cardType);
    params.set("lang", lang);
    cachedFetch<Enchantment[]>(`${API}/api/enchantments?${params}`)
      .then(setEnchantments);
  }, [search, cardType, lang, channel]);

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={(v) => setFilterAndUrl("search", v, setSearch)}
        placeholder={t("Search enchantments...")}
        resultCount={enchantments.length}
        filters={[
          {
            label: "Any Card Type",
            name: "Card Type",
            value: cardType,
            options: cardTypeOptions,
            onChange: (v) => setFilterAndUrl("cardType", v, setCardType),
          },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {enchantments.map((ench) => (
          <Link
            prefetch={false}
            key={ench.id}
            href={`${bp}/enchantments/${ench.id.toLowerCase()}`}
            className="bg-[var(--bg-card)] rounded-lg border border-cyan-800/40 p-4 hover:bg-[var(--bg-card-hover)] transition-all block"
          >
            <div className="flex items-start gap-3 mb-2">
              {ench.image_url && (
                <img
                  src={imageUrl(ench.image_url)}
                  alt={t("{name} enchantment icon", { name: ench.name })}
                  className="w-10 h-10 object-contain flex-shrink-0"
                  loading="lazy"
                  crossOrigin="anonymous"
                />
              )}
              <div className="flex-1 flex items-start justify-between">
              <h3 className="font-semibold text-[var(--text-primary)]">
                {ench.name}
              </h3>
              <div className="flex gap-1.5 ml-2 flex-shrink-0">
                {ench.card_type?.split(", ").map((type) => (
                  <span
                    key={type}
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      cardTypeColors[type] ||
                      "bg-gray-800 text-gray-300 border-gray-700"
                    }`}
                  >
                    {t(type)}
                  </span>
                ))}
                {ench.is_stackable && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border bg-cyan-950/50 text-cyan-300 border-cyan-900/30">
                    {t("Stackable")}
                  </span>
                )}
              </div>
              </div>
            </div>

            <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-2">
              <RichDescription text={ench.description} />
            </p>

            {ench.extra_card_text && (
              <p className="text-xs text-[var(--text-muted)] leading-relaxed italic">
                {t("Card text:")} <RichDescription text={ench.extra_card_text} />
              </p>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}

// useSearchParams needs a Suspense boundary above it now that the root
// layout no longer provides one (the app-wide boundary made every dynamic
// page's body invisible to non-JS crawlers). The boundary lives here so
// every page that renders this client, English and localized, gets it.
export default function EnchantmentsClient(props: Parameters<typeof EnchantmentsClientInner>[0]) {
  return (
    <Suspense fallback={null}>
      <EnchantmentsClientInner {...props} />
    </Suspense>
  );
}
