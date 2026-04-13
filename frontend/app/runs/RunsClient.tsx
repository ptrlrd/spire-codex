"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { cachedFetch } from "@/lib/fetch-cache";
import RichDescription from "../components/RichDescription";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface CardInfo {
  id: string;
  name: string;
  description: string;
  type: string;
  rarity: string;
  cost: number;
  image_url: string | null;
}

interface RelicInfo {
  id: string;
  name: string;
  description: string;
  rarity: string;
  image_url: string | null;
}

function CardPill({
  cardId,
  upgraded,
  enchantment,
  cardData,
  lp,
  className,
  children,
}: {
  cardId: string;
  upgraded?: boolean;
  enchantment?: string;
  cardData: Record<string, CardInfo>;
  lp: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const info = cardData[cardId];

  return (
    <Link
      href={`${lp}/cards/${cardId.toLowerCase()}`}
      className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children || displayName(`CARD.${cardId}`)}
      {upgraded && "+"}
      {enchantment && <span className="text-[var(--color-necrobinder)] ml-1">[{displayName(`ENCHANTMENT.${enchantment}`)}]</span>}
      {show && info && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && (
              <img src={`${API}${info.image_url}`} alt="" className="w-10 h-10 object-cover rounded" crossOrigin="anonymous" />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{info.name}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{info.type} · {info.rarity} · {info.cost}</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
            <RichDescription text={info.description} />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}

function RelicPill({
  relicId,
  relicData,
  lp,
  className,
  children,
}: {
  relicId: string;
  relicData: Record<string, RelicInfo>;
  lp: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const info = relicData[relicId];

  return (
    <Link
      href={`${lp}/relics/${relicId.toLowerCase()}`}
      className={`relative ${className || ""}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children || displayName(`RELIC.${relicId}`)}
      {show && info && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-start gap-2 mb-1.5">
            {info.image_url && (
              <img src={`${API}${info.image_url}`} alt="" className="w-8 h-8 object-contain" crossOrigin="anonymous" />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--text-primary)] truncate">{info.name}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{info.rarity}</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
            <RichDescription text={info.description} />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}

interface RunCard {
  id: string;
  floor_added_to_deck?: number;
  current_upgrade_level?: number;
  enchantment?: { id: string; amount: number };
}

interface RunRelic {
  id: string;
  floor_added_to_deck?: number;
}

interface RunPlayer {
  character: string;
  deck: RunCard[];
  relics: RunRelic[];
  potions: string[];
  id: number;
}

interface CardChoice {
  card: { id: string };
  was_picked: boolean;
}

interface FloorPlayerStats {
  card_choices?: CardChoice[];
  cards_gained?: { id: string }[];
  current_hp: number;
  max_hp: number;
  current_gold: number;
  damage_taken: number;
  gold_gained: number;
  hp_healed: number;
  max_hp_gained: number;
  max_hp_lost: number;
  player_id: number;
}

interface FloorRoom {
  model_id: string;
  monster_ids?: string[];
  room_type: string;
  turns_taken?: number;
}

interface MapPoint {
  map_point_type: string;
  player_stats: FloorPlayerStats[];
  rooms?: FloorRoom[];
}

interface RunData {
  win: boolean;
  ascension: number;
  seed: string;
  run_time: number;
  game_mode: string;
  players: RunPlayer[];
  acts: string[];
  map_point_history: MapPoint[][];
  killed_by_encounter?: string;
  killed_by_event?: string;
  was_abandoned?: boolean;
  build_id?: string;
}

function cleanId(id: string): string {
  return id.replace(/^(CARD|RELIC|ENCHANTMENT|MONSTER|ENCOUNTER|CHARACTER|ACT|POTION)\./, "");
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function displayName(id: string): string {
  return cleanId(id).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function RunOverview({ run, cardData, relicData }: { run: RunData; cardData: Record<string, CardInfo>; relicData: Record<string, RelicInfo> }) {
  const lp = useLangPrefix();
  const player = run.players[0];
  const charId = cleanId(player.character);
  const charName = displayName(player.character);

  // Count non-starter cards
  const starterCards = player.deck.filter((c) => c.floor_added_to_deck === 1);
  const addedCards = player.deck.filter((c) => (c.floor_added_to_deck ?? 1) > 1);
  const upgradedCards = player.deck.filter((c) => c.current_upgrade_level);
  const enchantedCards = player.deck.filter((c) => c.enchantment);
  const totalFloors = run.map_point_history.reduce((sum, act) => sum + act.length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`rounded-xl border p-5 ${run.win ? "bg-[var(--color-silent)]/10 border-[var(--color-silent)]/30" : "bg-[var(--color-ironclad)]/10 border-[var(--color-ironclad)]/30"}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold ${run.win ? "text-[var(--color-silent)]" : "text-[var(--color-ironclad)]"}`}>
              {run.win ? "Victory" : run.was_abandoned ? "Abandoned" : "Defeat"}
            </span>
            <Link href={`${lp}/characters/${charId.toLowerCase()}`} className="text-lg text-[var(--accent-gold)] hover:underline">
              {charName}
            </Link>
          </div>
          <div className="text-right text-sm text-[var(--text-muted)]">
            <div>Ascension {run.ascension}</div>
            <div>{formatTime(run.run_time)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-[var(--bg-primary)] rounded-lg p-2">
            <div className="text-lg font-bold text-[var(--text-primary)]">{player.deck.length}</div>
            <div className="text-xs text-[var(--text-muted)]">Cards</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-2">
            <div className="text-lg font-bold text-[var(--text-primary)]">{player.relics.length}</div>
            <div className="text-xs text-[var(--text-muted)]">Relics</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-2">
            <div className="text-lg font-bold text-[var(--text-primary)]">{totalFloors}</div>
            <div className="text-xs text-[var(--text-muted)]">Floors</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-2">
            <div className="text-lg font-bold text-[var(--text-primary)]">{run.acts.length}</div>
            <div className="text-xs text-[var(--text-muted)]">Acts</div>
          </div>
        </div>

        {!run.win && !run.was_abandoned && run.killed_by_encounter && run.killed_by_encounter !== "NONE.NONE" && (
          <div className="mt-3 text-sm text-[var(--color-ironclad)]">
            Killed by{" "}
            <Link href={`${lp}/encounters/${cleanId(run.killed_by_encounter).toLowerCase()}`} className="hover:underline font-medium">
              {displayName(run.killed_by_encounter)}
            </Link>
          </div>
        )}

        <div className="mt-2 text-xs text-[var(--text-muted)]">
          Seed: {run.seed} · {run.game_mode}
        </div>
      </div>

      {/* Final Deck */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
          Final Deck ({player.deck.length})
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {player.deck
            .sort((a, b) => cleanId(a.id).localeCompare(cleanId(b.id)))
            .map((card, i) => {
              const cid = cleanId(card.id);
              return (
                <CardPill
                  key={`${cid}-${i}`}
                  cardId={cid}
                  upgraded={!!card.current_upgrade_level}
                  enchantment={card.enchantment ? cleanId(card.enchantment.id) : undefined}
                  cardData={cardData}
                  lp={lp}
                  className={`text-xs px-2 py-1 rounded border transition-colors hover:bg-[var(--bg-card-hover)] ${
                    card.current_upgrade_level
                      ? "bg-[var(--color-silent)]/10 border-[var(--color-silent)]/30 text-[var(--color-silent)]"
                      : "bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
                  }`}
                />
              );
            })}
        </div>
      </div>

      {/* Relics */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
          Relics ({player.relics.length})
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {player.relics.map((relic, i) => {
            const rid = cleanId(relic.id);
            return (
              <RelicPill
                key={`${rid}-${i}`}
                relicId={rid}
                relicData={relicData}
                lp={lp}
                className="text-xs px-2 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--accent-gold)] hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                {displayName(relic.id)}
                <span className="text-[var(--text-muted)] ml-1">F{relic.floor_added_to_deck}</span>
              </RelicPill>
            );
          })}
        </div>
      </div>

      {/* Floor-by-floor */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
          Floor History
        </h2>
        <div className="space-y-1">
          {run.map_point_history.map((actFloors, actIdx) => (
            <div key={actIdx}>
              <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mt-3 mb-1.5">
                {displayName(run.acts[actIdx] || `Act ${actIdx + 1}`)}
              </h3>
              {actFloors.map((floor, floorIdx) => {
                const ps = floor.player_stats?.[0];
                const room = floor.rooms?.[0];
                const encounter = room?.model_id ? displayName(room.model_id) : floor.map_point_type;

                const roomTypeColors: Record<string, string> = {
                  monster: "text-gray-300",
                  elite: "text-amber-400",
                  boss: "text-[var(--color-ironclad)]",
                  rest: "text-[var(--color-silent)]",
                  shop: "text-cyan-400",
                  event: "text-[var(--color-necrobinder)]",
                  treasure: "text-yellow-400",
                };

                const picked = ps?.card_choices?.filter((c) => c.was_picked).map((c) => displayName(c.card.id)) || [];
                const skipped = ps?.card_choices?.filter((c) => !c.was_picked).map((c) => displayName(c.card.id)) || [];

                return (
                  <div key={floorIdx} className="flex items-start gap-3 py-1.5 border-b border-[var(--border-subtle)] last:border-0 text-xs">
                    <span className="text-[var(--text-muted)] w-6 text-right flex-shrink-0">
                      {floorIdx + 1}
                    </span>
                    <span className={`w-14 flex-shrink-0 font-medium ${roomTypeColors[floor.map_point_type] || "text-[var(--text-secondary)]"}`}>
                      {floor.map_point_type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[var(--text-secondary)]">{encounter}</span>
                      {room?.turns_taken != null && (
                        <span className="text-[var(--text-muted)] ml-1">({room.turns_taken}T)</span>
                      )}
                      {picked.length > 0 && (
                        <span className="text-[var(--color-silent)] ml-2">+{picked.join(", ")}</span>
                      )}
                      {skipped.length > 0 && (
                        <span className="text-[var(--text-muted)] ml-1 line-through">{skipped.join(", ")}</span>
                      )}
                    </div>
                    {ps && (
                      <div className="flex items-center gap-2 flex-shrink-0 text-[var(--text-muted)]">
                        {ps.damage_taken > 0 && <span className="text-[var(--color-ironclad)]">-{ps.damage_taken}</span>}
                        {ps.hp_healed > 0 && <span className="text-[var(--color-silent)]">+{ps.hp_healed}</span>}
                        <span>{ps.current_hp}/{ps.max_hp}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RunsClient() {
  const [jsonInput, setJsonInput] = useState("");
  const [run, setRun] = useState<RunData | null>(null);
  const [error, setError] = useState("");
  const [cardData, setCardData] = useState<Record<string, CardInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, RelicInfo>>({});
  const [runHash, setRunHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ total: number; done: number; dupes: number; errors: number } | null>(null);
  const [tab, setTab] = useState<"submit" | "browse">("submit");
  const [runList, setRunList] = useState<any[]>([]);
  const [browseChar, setBrowseChar] = useState("");
  const [browseWin, setBrowseWin] = useState("");
  const [browseUser, setBrowseUser] = useState("");
  const [browsePage, setBrowsePage] = useState(1);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseTotalPages, setBrowseTotalPages] = useState(0);

  // Load card/relic data for tooltips
  useEffect(() => {
    cachedFetch<CardInfo[]>(`${API}/api/cards`).then((cards) => {
      const map: Record<string, CardInfo> = {};
      for (const c of cards) map[c.id] = c;
      setCardData(map);
    });
    cachedFetch<RelicInfo[]>(`${API}/api/relics`).then((relics) => {
      const map: Record<string, RelicInfo> = {};
      for (const r of relics) map[r.id] = r;
      setRelicData(map);
    });
  }, []);

  // Reset page when filters change
  useEffect(() => { setBrowsePage(1); }, [browseChar, browseWin, browseUser]);

  // Load run list for browse tab
  useEffect(() => {
    if (tab !== "browse") return;
    const params = new URLSearchParams();
    if (browseChar) params.set("character", browseChar);
    if (browseWin) params.set("win", browseWin);
    if (browseUser) params.set("username", browseUser);
    params.set("page", String(browsePage));
    fetch(`${API}/api/runs/list?${params}&_t=${Date.now()}`)
      .then((r) => r.ok ? r.json() : { runs: [], total: 0, total_pages: 0 })
      .then((data) => {
        setRunList(data.runs || []);
        setBrowseTotal(data.total || 0);
        setBrowseTotalPages(data.total_pages || 0);
      })
      .catch(() => {});
  }, [tab, browseChar, browseWin, browseUser, browsePage]);

  function isValidRunFile(data: any): boolean {
    return data && typeof data === "object" && data.players && data.acts && data.map_point_history && "win" in data && "schema_version" in data;
  }

  async function handleFileUpload(files: FileList) {
    const total = files.length;
    if (total === 0) return;
    setUploadProgress({ total, done: 0, dupes: 0, errors: 0 });

    let done = 0, dupes = 0, errors = 0;
    const submitUrl = username.trim() ? `${API}/api/runs?username=${encodeURIComponent(username.trim())}` : `${API}/api/runs`;

    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!isValidRunFile(data)) {
          errors++;
        } else {
          const res = await fetch(submitUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: text,
          });
          const result = await res.json().catch(() => null);
          if (result?.duplicate) dupes++;
        }
      } catch {
        errors++;
      }
      done++;
      setUploadProgress({ total, done, dupes, errors });
    }

    // If only one file, also show the run detail
    if (total === 1 && errors === 0) {
      try {
        const text = await files[0].text();
        const data = JSON.parse(text);
        if (isValidRunFile(data)) {
          setRun(data);
          // Get the hash for sharing
          const res = await fetch(submitUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: text,
          });
          const result = await res.json().catch(() => null);
          if (result?.run_hash) {
            setRunHash(result.run_hash);
            window.history.replaceState(null, "", `/runs/${result.run_hash}`);
          }
        }
      } catch {}
    }
  }

  function parseRun() {
    setError("");
    setRun(null);
    try {
      const data = JSON.parse(jsonInput);
      if (!data.players || !data.map_point_history || !Array.isArray(data.acts)) {
        setError("This doesn't look like a valid run file. Expected players, map_point_history, and acts fields.");
        return;
      }
      setRun(data);
      // Auto-submit to community stats and get share hash
      const submitUrl = username.trim() ? `${API}/api/runs?username=${encodeURIComponent(username.trim())}` : `${API}/api/runs`;
      fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonInput,
      }).then((r) => r.json().catch(() => null))
        .then((d) => {
          if (d?.run_hash) {
            setRunHash(d.run_hash);
            window.history.replaceState(null, "", `/runs/${d.run_hash}`);
          }
        })
        .catch(() => {});
    } catch {
      setError("Invalid JSON. Make sure you pasted the full contents of the .run file.");
    }
  }

  const lp = useLangPrefix();

  function formatTimeShort(s: number) {
    const m = Math.floor(s / 60);
    return `${m}m`;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Runs</h1>
      <p className="text-[var(--text-secondary)] mb-4">
        Submit your run data or browse community-submitted runs.
      </p>

      {/* Tabs */}
      {!run && (
        <div className="flex gap-1 mb-6 border-b border-[var(--border-subtle)]">
          <button onClick={() => setTab("submit")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === "submit" ? "border-[var(--accent-gold)] text-[var(--accent-gold)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
            Submit a Run
          </button>
          <button onClick={() => setTab("browse")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === "browse" ? "border-[var(--accent-gold)] text-[var(--accent-gold)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
            Browse Runs
            {runList.length > 0 && <span className="ml-1.5 text-xs text-[var(--text-muted)]">({runList.length})</span>}
          </button>
        </div>
      )}

      {/* Submit Tab */}
      {tab === "submit" && !run && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-muted)]">
            Submit your run data or browse community-submitted runs.
          </p>

          {/* Username */}
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.slice(0, 25))}
            placeholder="Username (optional)"
            maxLength={25}
            className="px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-gold)] w-48"
          />

          {/* File Upload */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-dashed border-[var(--border-accent)] p-6 text-center">
            <p className="text-sm text-[var(--text-secondary)] mb-1">
              Upload .run files — select one or multiple
            </p>
            <details className="text-left mb-3">
              <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)]">
                Where are my .run files?
              </summary>
              <div className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                <p><strong className="text-[var(--text-secondary)]">Windows:</strong> <code className="bg-[var(--bg-primary)] px-1 rounded">%AppData%\SlayTheSpire2\runs</code></p>
                <p><strong className="text-[var(--text-secondary)]">macOS:</strong> <code className="bg-[var(--bg-primary)] px-1 rounded">~/Library/Application Support/SlayTheSpire2/runs</code></p>
                <p><strong className="text-[var(--text-secondary)]">Linux / Steam Deck:</strong> <code className="bg-[var(--bg-primary)] px-1 rounded">~/.local/share/SlayTheSpire2/runs</code></p>
              </div>
            </details>
            <label className="inline-block px-5 py-2 rounded-lg text-sm font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity cursor-pointer">
              Choose Files
              <input
                type="file"
                multiple
                accept=".run,.json"
                className="hidden"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              />
            </label>
            {uploadProgress && (
              <div className="mt-4">
                <div className="w-full bg-[var(--bg-primary)] rounded-full h-2 mb-2">
                  <div className="h-2 rounded-full bg-[var(--accent-gold)] transition-all" style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }} />
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {uploadProgress.done === uploadProgress.total ? (
                    <>
                      Done! {uploadProgress.total - uploadProgress.dupes - uploadProgress.errors} submitted
                      {uploadProgress.dupes > 0 && <>, {uploadProgress.dupes} duplicates skipped</>}
                      {uploadProgress.errors > 0 && <>, {uploadProgress.errors} invalid</>}
                    </>
                  ) : (
                    <>Processing {uploadProgress.done} of {uploadProgress.total}...</>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Or paste JSON */}
          <div className="relative">
            <div className="absolute inset-x-0 top-0 flex items-center justify-center -mt-2">
              <span className="bg-[var(--bg-primary)] px-3 text-xs text-[var(--text-muted)]">or paste JSON</span>
            </div>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder='{"acts":["ACT.OVERGROWTH"...],"ascension":0,...}'
              rows={6}
              className="w-full px-4 py-3 pt-5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:border-[var(--accent-gold)] resize-none"
            />
            <button
              onClick={parseRun}
              disabled={!jsonInput.trim()}
              className="mt-2 px-5 py-2 rounded-lg text-sm font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Analyze Run
            </button>
          </div>

          {error && <p className="text-[var(--color-ironclad)] text-sm">{error}</p>}
        </div>
      )}

      {/* Browse Tab */}
      {tab === "browse" && !run && (
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            <select value={browseChar} onChange={(e) => setBrowseChar(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]">
              <option value="">All Characters</option>
              <option value="IRONCLAD">Ironclad</option>
              <option value="SILENT">Silent</option>
              <option value="DEFECT">Defect</option>
              <option value="NECROBINDER">Necrobinder</option>
              <option value="REGENT">Regent</option>
            </select>
            <select value={browseWin} onChange={(e) => setBrowseWin(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]">
              <option value="">All Runs</option>
              <option value="true">Wins</option>
              <option value="false">Losses</option>
            </select>
            <input
              type="text"
              value={browseUser}
              onChange={(e) => setBrowseUser(e.target.value)}
              placeholder="Search username..."
              className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)] w-44"
            />
          </div>

          {/* Total count */}
          <p className="text-xs text-[var(--text-muted)] mb-3">{browseTotal} runs total</p>

          {runList.length === 0 ? (
            <p className="text-center py-8 text-[var(--text-muted)]">No runs found.</p>
          ) : (
            <>
              <div className="space-y-2">
                {runList.map((r) => (
                  <Link key={r.run_hash} href={`${lp}/runs/${r.run_hash}`}
                    className="flex items-center justify-between bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-medium ${r.win ? "text-[var(--color-silent)]" : "text-[var(--color-ironclad)]"}`}>
                        {r.win ? "W" : r.was_abandoned ? "A" : "L"}
                      </span>
                      <span className="text-sm text-[var(--text-primary)]">{displayName(`CHARACTER.${r.character}`)}</span>
                      <span className="text-xs text-[var(--text-muted)]">A{r.ascension}</span>
                      {r.username && <span className="text-xs text-[var(--accent-gold)]">{r.username}</span>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                      <span>{r.deck_size} cards</span>
                      <span>{r.relic_count} relics</span>
                      <span>{r.floors_reached} floors</span>
                      <span>{formatTimeShort(r.run_time)}</span>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {browseTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => setBrowsePage(browsePage - 1)}
                    disabled={browsePage <= 1}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    &larr; Prev
                  </button>
                  <span className="text-xs text-[var(--text-muted)]">
                    Page {browsePage} of {browseTotalPages}
                  </span>
                  <button
                    onClick={() => setBrowsePage(browsePage + 1)}
                    disabled={browsePage >= browseTotalPages}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Next &rarr;
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Run Detail View */}
      {run && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => { setRun(null); setJsonInput(""); setRunHash(null); setCopied(false); window.history.replaceState(null, "", "/runs"); }}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              &larr; Back to browsing runs
            </button>
            {runHash && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/runs/${runHash}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
              >
                {copied ? "Copied!" : "Share Run"}
              </button>
            )}
          </div>
          <RunOverview run={run} cardData={cardData} relicData={relicData} />
        </div>
      )}
    </div>
  );
}
