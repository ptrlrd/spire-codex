"use client";

import { useGameLocale, useT } from "@/lib/i18n";
import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { Encounter, Monster } from "@/lib/api/types";
import { cachedFetch } from "@/lib/fetch-cache";
import SearchFilter from "@/app/components/SearchFilter";
import FightLineup from "@/app/components/FightLineup";
import { fightMonster, groupFights, type FightMonster } from "@/lib/fight";
import { imageUrl } from "@/lib/image-url";
import { useChannel, useBetaPrefix } from "@/lib/api/prefix.client";
import { useBetaAdditions } from "@/lib/use-beta-additions";
import BetaBadge from "@/app/components/BetaBadge";
import { replaceQuery } from "@/lib/replace-query";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

const ROOM_ICON: Record<string, string> = {
  Monster: "monster",
  Elite: "elite",
};

function EncountersClientInner({
  initialEncounters,
  initialMonsters,
}: {
  initialEncounters: Encounter[];
  initialMonsters: Record<string, FightMonster>;
}) {
  const bp = useBetaPrefix();
  const searchParams = useSearchParams();
  const [encounters, setEncounters] = useState<Encounter[]>(initialEncounters);
  const [monsters, setMonsters] = useState(initialMonsters);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [roomType, setRoomType] = useState(searchParams.get("roomType") || "");
  const [act, setAct] = useState(searchParams.get("act") || "");
  const lang = useGameLocale();
  const t = useT();
  const channel = useChannel();
  const betaAdditions = useBetaAdditions<Encounter>("encounters", lang);
  const initialRender = useRef(true);

  const updateUrl = useCallback((newState: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(newState)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    replaceQuery(qs);
  }, []);

  const setFilterAndUrl = useCallback(
    (key: string, value: string, setter: (v: string) => void) => {
      setter(value);
      const current: Record<string, string> = { search, roomType, act };
      current[key] = value;
      updateUrl(current);
    },
    [search, roomType, act, updateUrl],
  );

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with
    // no filters. Never skip on the beta channel: the server data is the
    // stable catalog, and cachedFetch appends channel=beta on /beta paths.
    if (initialRender.current) {
      initialRender.current = false;
      if (
        channel !== "beta" &&
        lang === "eng" &&
        !roomType &&
        !act &&
        !search &&
        initialEncounters.length > 0
      ) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (roomType && roomType !== "Weak") params.set("room_type", roomType);
    if (act) params.set("act", act);
    if (search) params.set("search", search);
    params.set("lang", lang);
    cachedFetch<Encounter[]>(`${API}/api/encounters?${params}`).then(
      setEncounters,
    );
  }, [roomType, act, search, lang, channel]);

  useEffect(() => {
    if (channel !== "beta" && Object.keys(initialMonsters).length > 0) return;
    cachedFetch<Monster[]>(`${API}/api/monsters?lang=${lang}`).then((rows) =>
      setMonsters(Object.fromEntries(rows.map((m) => [m.id, fightMonster(m)]))),
    );
  }, [channel, lang]);

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

  const filtered =
    roomType === "Weak" ? merged.filter((e) => e.is_weak) : merged;

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={(v) => setFilterAndUrl("search", v, setSearch)}
        placeholder={t("Search encounters...")}
        resultCount={filtered.length}
        filters={[
          {
            label: "Any Type",
            name: "Type",
            value: roomType,
            options: roomTypeOptions,
            onChange: (v) => setFilterAndUrl("roomType", v, setRoomType),
          },
          {
            label: "Any Act",
            name: "Act",
            value: act,
            options: actOptions,
            onChange: (v) => setFilterAndUrl("act", v, setAct),
          },
        ]}
      />

      {groupFights(filtered).map((group) => (
        <section key={group.act ?? "none"} className="mb-10">
          <h2 className="mb-4 border-b border-[var(--border-subtle)] pb-2 text-xl font-semibold text-[var(--text-primary)]">
            {group.act ?? t("Other")}
          </h2>
          {group.rooms.map(({ room, weak, rows }) => (
            <div key={`${room}-${weak}`} className="mb-6 last:mb-0">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                {ROOM_ICON[room] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl(
                      `/static/images/ui/map_rooms/${ROOM_ICON[room]}.png`,
                    )}
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5 object-contain"
                  />
                )}
                {weak ? `${t(room)} (${t("Weak")})` : t(room)}
                <span className="font-normal tabular-nums text-[var(--text-muted)]">
                  {rows.length}
                </span>
              </h3>
              <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((enc) => (
                  <li
                    key={enc.id}
                    className="border-t border-[var(--border-subtle)]"
                  >
                    <Link
                      prefetch={false}
                      href={`${bp}/encounters/${enc.id.toLowerCase()}`}
                      className="group block py-3"
                    >
                      <FightLineup
                        members={enc.monsters ?? []}
                        monsters={monsters}
                        size={room === "Boss" ? 104 : 72}
                        t={t}
                      />
                      <span className="mt-2 flex items-center gap-1.5 font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-gold)]">
                        {enc.name}
                        {betaIds.has(enc.id) && <BetaBadge />}
                      </span>
                      {!!enc.tags?.length && (
                        <span className="block text-xs text-[var(--text-muted)]">
                          {enc.tags.join(", ")}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

// useSearchParams needs a Suspense boundary above it now that the root
// layout no longer provides one (the app-wide boundary made every dynamic
// page's body invisible to non-JS crawlers). The boundary lives here so
// every page that renders this client, English and localized, gets it.
export default function EncountersClient(
  props: Parameters<typeof EncountersClientInner>[0],
) {
  return (
    <Suspense fallback={null}>
      <EncountersClientInner {...props} />
    </Suspense>
  );
}
