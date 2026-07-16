"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Encounter } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import SearchFilter from "../components/SearchFilter";
import RichDescription from "../components/RichDescription";
import { useLanguage } from "../contexts/LanguageContext";
import { useChannel, useLangPrefix } from "@/lib/use-lang-prefix";
import { useBetaAdditions } from "@/lib/use-beta-additions";
import BetaBadge from "../components/BetaBadge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const roomTypeColors: Record<string, string> = {
  Monster: "border-gray-600/40",
  Elite: "border-amber-600/40",
  Boss: "border-red-600/40",
};

const roomTypeBadge: Record<string, string> = {
  Monster: "bg-gray-800 text-gray-300 border-gray-700",
  Elite: "bg-amber-950/50 text-amber-300 border-amber-900/30",
  Boss: "bg-red-950/50 text-red-300 border-red-900/30",
};

const roomTypeOptions = [
  { label: "Monster", value: "Monster" },
  { label: "Elite", value: "Elite" },
  { label: "Boss", value: "Boss" },
  { label: "Weak", value: "Weak" },
];

const actOptions = [
  { label: "Act 1 - Overgrowth", value: "overgrowth" },
  { label: "Act 1 - Underdocks", value: "underdocks" },
  { label: "Act 2 - Hive", value: "hive" },
  { label: "Act 3 - Glory", value: "glory" },
];

function EncountersClientInner({ initialEncounters }: { initialEncounters: Encounter[] }) {
  const lp = useLangPrefix();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [encounters, setEncounters] = useState<Encounter[]>(initialEncounters);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [roomType, setRoomType] = useState(searchParams.get("roomType") || "");
  const [act, setAct] = useState(searchParams.get("act") || "");
  const { lang } = useLanguage();
  const channel = useChannel();
  const betaAdditions = useBetaAdditions<Encounter>("encounters", lang);
  const initialRender = useRef(true);

  const updateUrl = useCallback((newState: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(newState)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.replace(`${lp}/encounters${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, lp]);

  const setFilterAndUrl = useCallback((key: string, value: string, setter: (v: string) => void) => {
    setter(value);
    const current: Record<string, string> = { search, roomType, act };
    current[key] = value;
    updateUrl(current);
  }, [search, roomType, act, updateUrl]);

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with
    // no filters. Never skip on the beta channel: the server data is the
    // stable catalog, and cachedFetch appends channel=beta on /beta paths.
    if (initialRender.current) {
      initialRender.current = false;
      if (channel !== "beta" && lang === "eng" && !roomType && !act && !search && initialEncounters.length > 0) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (roomType && roomType !== "Weak") params.set("room_type", roomType);
    if (act) params.set("act", act);
    if (search) params.set("search", search);
    params.set("lang", lang);
    cachedFetch<Encounter[]>(`${API}/api/encounters?${params}`)
      .then(setEncounters);
  }, [roomType, act, search, lang, channel]);

  // Beta-only encounters join the stable list (the regular filters run
  // server-side, so apply them locally to the additions).
  const betaIds = new Set(betaAdditions.map((e) => e.id));
  const merged = [
    ...encounters.filter((e) => !betaIds.has(e.id)),
    ...betaAdditions.filter(
      (e) =>
        (!roomType || roomType === "Weak" || e.room_type === roomType) &&
        (!act || (e.act ?? "").toLowerCase().includes(act)) &&
        (!search || e.name.toLowerCase().includes(search.toLowerCase())),
    ),
  ];

  const filtered = roomType === "Weak"
    ? merged.filter((e) => e.is_weak)
    : merged;

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={(v) => setFilterAndUrl("search", v, setSearch)}
        placeholder="Search encounters..."
        resultCount={filtered.length}
        filters={[
          {
            label: "All Types",
            value: roomType,
            options: roomTypeOptions,
            onChange: (v) => setFilterAndUrl("roomType", v, setRoomType),
          },
          {
            label: "All Acts",
            value: act,
            options: actOptions,
            onChange: (v) => setFilterAndUrl("act", v, setAct),
          },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {filtered.map((enc) => (
          <Link
            key={enc.id}
            href={
              betaIds.has(enc.id)
                ? `${lp}/beta/encounters/${enc.id.toLowerCase()}`
                : `${lp}/encounters/${enc.id.toLowerCase()}`
            }
            className={`bg-[var(--bg-card)] rounded-lg border ${
              roomTypeColors[enc.room_type] || "border-[var(--border-subtle)]"
            } p-4 hover:bg-[var(--bg-card-hover)] transition-all block`}
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                {enc.name}
                {betaIds.has(enc.id) && <BetaBadge />}
              </h3>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ml-2 ${
                  roomTypeBadge[enc.room_type] || "bg-gray-800 text-gray-300 border-gray-700"
                }`}
              >
                {enc.room_type}
                {enc.is_weak && " (Weak)"}
              </span>
            </div>

            {enc.act && (
              <p className="text-xs text-[var(--text-muted)] mb-2">
                {enc.act}
              </p>
            )}

            {enc.monsters && enc.monsters.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {enc.monsters.map((m) => (
                  <span
                    key={m.id}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                  >
                    {m.name}
                  </span>
                ))}
              </div>
            )}

            {enc.tags && enc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {enc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950/40 text-rose-300 border border-rose-900/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {enc.loss_text && (
              <p className="text-xs text-[var(--text-muted)] italic leading-relaxed">
                <RichDescription text={enc.loss_text} />
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
export default function EncountersClient(props: Parameters<typeof EncountersClientInner>[0]) {
  return (
    <Suspense fallback={null}>
      <EncountersClientInner {...props} />
    </Suspense>
  );
}
