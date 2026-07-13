"use client";

import { useState, useEffect, useRef, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Monster, MonsterMove, MonsterMovePower, Power, AttackPattern } from "@/lib/api";
import type { EncounterStat } from "@/lib/encounter-stats";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { t } from "@/lib/ui-translations";
import RichDescription from "@/app/components/RichDescription";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import EntityProse from "@/app/components/EntityProse";
import { imageUrl } from "@/lib/image-url";
import "../../card-revamp.css";
import "../../monster-encounter-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Per-entity spine accent for the wiki page (--spine), keyed by monster type.
const SPINE_BY_TYPE: Record<string, string> = {
  Boss: "var(--color-ironclad)",
  Elite: "var(--accent-gold)",
  Normal: "var(--color-silent)",
};

const typeBadge: Record<string, string> = {
  Normal: "bg-gray-800 text-gray-300",
  Elite: "bg-amber-900/50 text-amber-400",
  Boss: "bg-red-900/50 text-red-400",
};

const intentColors: Record<string, string> = {
  Attack: "text-red-400",
  Defend: "text-blue-400",
  Buff: "text-green-400",
  Debuff: "text-purple-400",
  Status: "text-yellow-400",
  Summon: "text-cyan-400",
  Heal: "text-emerald-400",
  Escape: "text-gray-400",
  Sleep: "text-indigo-400",
  Stun: "text-orange-400",
  Special: "text-pink-400",
  Unknown: "text-[var(--text-muted)]",
};

const intentIcons: Record<string, string> = {
  Attack: "⚔️",
  Defend: "🛡️",
  Buff: "⬆️",
  Debuff: "⬇️",
  Status: "📜",
  Summon: "👥",
  Heal: "💚",
  Escape: "💨",
  Sleep: "💤",
  Stun: "⚡",
  Special: "💀",
};

function PowerPill({
  p,
  powerData,
  lp,
}: {
  p: MonsterMovePower;
  powerData: Record<string, Power>;
  lp: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const ref = useRef<HTMLAnchorElement>(null);
  const power = powerData[p.power_id];
  const displayName = power
    ? power.name
    : p.power_id.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Link
      ref={ref}
      href={`${lp}/powers/${p.power_id.toLowerCase()}`}
      className={`relative text-xs px-2 py-0.5 rounded-full border transition-colors ${
        p.target === "player"
          ? "border-red-800/50 bg-red-950/30 text-red-300 hover:bg-red-900/40"
          : "border-green-800/50 bg-green-950/30 text-green-300 hover:bg-green-900/40"
      }`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {displayName} {p.amount}
      {showTooltip && power && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-center gap-2 mb-1.5">
            {power.image_url && (
              <img
                src={imageUrl(power.image_url)}
                alt=""
                className="w-6 h-6 object-contain"
                crossOrigin="anonymous"
              />
            )}
            <span className="font-semibold text-sm text-[var(--text-primary)]">
              {power.name}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-auto ${
              power.type === "Debuff" ? "bg-red-900/50 text-red-300" : "bg-green-900/50 text-green-300"
            }`}>
              {power.type}
            </span>
          </div>
          <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
            <RichDescription text={power.description} />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}

// Title-case a raw id ("EYE_LASERS" -> "Eye Lasers").
function titleCaseId(id: string): string {
  return id.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// A plain-English, one-line summary of what a move does, built from its
// structured fields (damage / block / heal / applied powers). English only —
// non-English monster pages skip it to avoid duplicating boilerplate across
// the localized variants (same policy as EntityProse). Falls back to an
// intent-derived line for moves that carry no numbers or powers.
function describeMove(move: MonsterMove, powerData: Record<string, Power>): string | null {
  const clauses: string[] = [];
  const d = move.damage;
  if (d && d.normal != null) {
    const multi = !!(d.hit_count && d.hit_count > 1);
    const base = multi
      ? `hits ${d.hit_count} times for ${d.normal} (${d.normal * d.hit_count!} total)`
      : `hits for ${d.normal}`;
    const asc =
      d.ascension != null && d.ascension !== d.normal
        ? ` (${multi ? `${d.ascension}×${d.hit_count} = ${d.ascension * d.hit_count!}` : d.ascension} on Ascension)`
        : "";
    clauses.push(`${base} damage${asc}`);
  }
  if (move.block != null) clauses.push(`gains ${move.block} Block`);
  if (move.heal != null) clauses.push(`heals ${move.heal} HP`);
  for (const p of move.powers || []) {
    const nm = powerData[p.power_id]?.name || titleCaseId(p.power_id);
    clauses.push(`${p.target === "player" ? "applies" : "gains"} ${p.amount} ${nm}`);
  }
  if (clauses.length === 0) {
    // No numbers or powers parsed — lean on the intent so the move still reads.
    const intent = (move.intent || "").toLowerCase();
    if (intent.includes("debuff")) return "Applies a debuff to you.";
    if (intent.includes("buff")) return "Strengthens itself with a buff.";
    if (intent.includes("defend")) return "Braces behind Block.";
    if (intent.includes("status")) return "Adds a status effect.";
    if (intent.includes("escape")) return "Prepares to flee the fight.";
    return null;
  }
  const joined =
    clauses.length === 1
      ? clauses[0]
      : clauses.length === 2
        ? `${clauses[0]} and ${clauses[1]}`
        : `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1) + ".";
}

// Ordered list of move display names for an attack pattern, so it can render
// as a visible sequence of chips. Follows the state machine's `next` links for
// a cycle; for other pattern types, lists the distinct moves it can pick.
function patternSteps(pattern: AttackPattern, moves: MonsterMove[]): string[] {
  const states = pattern.states || [];
  if (states.length === 0) return [];
  const nameOf = (mid: string) => moves.find((m) => m.id === mid)?.name || titleCaseId(mid);

  if (pattern.type === "cycle") {
    const byId = new Map(states.map((s) => [s.id, s]));
    const start =
      states.find((s) => s.move_id === pattern.initial_move) || states.find((s) => s.move_id) || states[0];
    const seen = new Set<string>();
    const out: string[] = [];
    let cur: typeof start | undefined = start;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.move_id) out.push(nameOf(cur.move_id));
      cur = cur.next ? byId.get(cur.next) : undefined;
    }
    // Guard against a malformed chain that skipped most states.
    if (out.length >= 2) return out;
  }

  // random / conditional / mixed (or a broken cycle): unique moves it can use.
  const ids: string[] = [];
  for (const s of states) {
    if (s.move_id) ids.push(s.move_id);
    for (const b of s.branches || []) if (b.move_id) ids.push(b.move_id);
  }
  return [...new Set(ids)].map(nameOf);
}

function MoveCard({
  move,
  powerData,
  lp,
  isEnglish,
}: {
  move: MonsterMove;
  powerData: Record<string, Power>;
  lp: string;
  isEnglish: boolean;
}) {
  const intentParts = (move.intent || "Unknown").split(" + ");
  const effect = isEnglish ? describeMove(move, powerData) : null;

  return (
    <div className="move">
      {/* Move header */}
      <div className="move-head">
        <span className="move-name">{move.name}</span>
        <div className="intents">
          {intentParts.map((intent, i) => (
            <span
              key={i}
              className={`intent ${intentColors[intent] || intentColors.Unknown}`}
            >
              {intentIcons[intent] ? `${intentIcons[intent]} ` : ""}{intent}
            </span>
          ))}
        </div>
      </div>

      {/* Plain-English effect summary (English pages only) */}
      {effect && <p className="move-effect">{effect}</p>}

      {/* Move details */}
      <div className="mstats">
        {/* Damage */}
        {move.damage && (
          <div className="mrow">
            <span className="mk">Damage</span>
            <span className="mval text-red-400">
              {move.damage.normal}
              {move.damage.hit_count && move.damage.hit_count > 1
                ? ` × ${move.damage.hit_count} = ${move.damage.normal * move.damage.hit_count}`
                : ""}
            </span>
            {move.damage.ascension != null && (
              <span className="masc">
                (A: {move.damage.ascension}
                {move.damage.hit_count && move.damage.hit_count > 1
                  ? ` × ${move.damage.hit_count} = ${move.damage.ascension * move.damage.hit_count}`
                  : ""})
              </span>
            )}
          </div>
        )}

        {/* Block */}
        {move.block != null && (
          <div className="mrow">
            <span className="mk">Block</span>
            <span className="mval text-blue-400">{move.block}</span>
          </div>
        )}

        {/* Heal */}
        {move.heal != null && (
          <div className="mrow">
            <span className="mk">Heal</span>
            <span className="mval text-emerald-400">{move.heal}</span>
          </div>
        )}

        {/* Powers applied */}
        {move.powers && move.powers.length > 0 && (
          <div className="mrow eff">
            <span className="mk">Effects</span>
            <div className="pills">
              {move.powers.map((p, i) => (
                <PowerPill key={i} p={p} powerData={powerData} lp={lp} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MonsterDetail({
  initialMonster,
  encounterStats,
}: { initialMonster?: Monster | null; encounterStats?: EncounterStat[] } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [monster, setMonster] = useState<Monster | null>(initialMonster ?? null);
  const [powerData, setPowerData] = useState<Record<string, Power>>({});
  const [loading, setLoading] = useState(!initialMonster);
  const [notFound, setNotFound] = useState(false);
  const [betaArt, setBetaArt] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("stats");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Monster>(`${API}/api/monsters/${id}?lang=${lang}`)
      .then((data) => setMonster(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  // Fetch powers for tooltips
  useEffect(() => {
    if (!monster) return;
    const powerIds = new Set<string>();
    if (monster.moves) {
      for (const move of monster.moves) {
        if (move.powers) {
          for (const p of move.powers) {
            powerIds.add(p.power_id);
          }
        }
      }
    }
    if (monster.innate_powers) {
      for (const p of monster.innate_powers) {
        powerIds.add(p.power_id);
      }
    }
    if (powerIds.size === 0) return;
    // Fetch all powers once and filter client-side (cached)
    cachedFetch<Power[]>(`${API}/api/powers?lang=${lang}`).then((powers) => {
      const map: Record<string, Power> = {};
      for (const pw of powers) {
        if (powerIds.has(pw.id)) {
          map[pw.id] = pw;
        }
      }
      setPowerData(map);
    });
  }, [monster, lang]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!monster) return;
    const secs = Array.from(
      document.querySelectorAll<HTMLElement>(".card-rvmp section[id]"),
    );
    if (secs.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveSection((e.target as HTMLElement).id);
        });
      },
      { rootMargin: "-130px 0px -70% 0px" },
    );
    secs.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [monster]);

  const handleTocClick = (e: ReactMouseEvent, secId: string) => {
    e.preventDefault();
    const el = document.getElementById(secId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(secId);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12 text-[var(--text-muted)]">
          Loading...
        </div>
      </div>
    );
  }

  if (notFound || !monster) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href={`${lp}/monsters`}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6 inline-block"
        >
          &larr; Back to Monsters
        </Link>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Monster Not Found
          </h1>
          <p className="text-[var(--text-muted)]">
            No monster with id &quot;{id}&quot; exists.
          </p>
        </div>
      </div>
    );
  }

  const isEnglish = lang === "eng";

  // Derive acts from encounters
  const acts = monster.encounters
    ? [...new Set(monster.encounters.filter(e => e.act).map(e => e.act!))]
    : [];

  // The single deadliest encounter this monster shows up in (highest kill
  // rate), fed to the overview prose as our own unique community data.
  const deadliest = (() => {
    if (!encounterStats?.length || !monster.encounters?.length) return null;
    let best: { name: string; killRate: number } | null = null;
    for (const enc of monster.encounters) {
      const s = encounterStats.find((x) => x.encounter_id === enc.encounter_id);
      if (!s || !s.total) continue;
      const killRate = (s.fatal / s.total) * 100;
      if (!best || killRate > best.killRate) best = { name: enc.encounter_name, killRate };
    }
    return best;
  })();

  const spineColor = SPINE_BY_TYPE[monster.type] ?? "var(--color-silent)";
  const heroSrc = betaArt && monster.beta_image_url ? monster.beta_image_url : monster.image_url;

  const hpNormal = monster.min_hp
    ? `${monster.min_hp}${monster.max_hp && monster.max_hp !== monster.min_hp ? `–${monster.max_hp}` : ""}`
    : null;
  const hpAscension = monster.min_hp_ascension
    ? `${monster.min_hp_ascension}${monster.max_hp_ascension && monster.max_hp_ascension !== monster.min_hp_ascension ? `–${monster.max_hp_ascension}` : ""}`
    : null;

  const hasStats = !!(hpNormal || hpAscension || (monster.innate_powers && monster.innate_powers.length > 0) || monster.attack_pattern);
  const hasMoves = !!(monster.moves && monster.moves.length > 0);
  const hasEncounters = !!(monster.encounters && monster.encounters.length > 0);

  const tocItems: { id: string; label: string }[] = [
    ...(hasStats ? [{ id: "stats", label: t("Stats", lang) }] : []),
    ...(hasMoves ? [{ id: "moves", label: t("Moves", lang) }] : []),
    ...(hasEncounters ? [{ id: "encounters", label: t("Encounters", lang) }] : []),
    { id: "history", label: t("Version history", lang) },
  ];

  return (
    <div
      className="card-rvmp"
      style={{
        "--spine": spineColor,
        ...(heroSrc ? { "--entity-bg": `url("${imageUrl(heroSrc)}?bg")` } : {}),
      } as CSSProperties}
    >
      <div className="cd-top">
        <button type="button" onClick={() => router.back()} className="cd-back">
          &larr; Back to Monsters
        </button>
      </div>

      <div className="wrap">
        {/* ===== MAIN column: unrolled sections ===== */}
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              {acts.length > 0 && (
                <>
                  <span>{acts.join(", ")}</span>
                  <span>&middot;</span>
                </>
              )}
              <span>{monster.type}</span>
            </p>
            <h1>{monster.name}</h1>
          </div>

          {/* Overview prose (unique, data-derived intro under the H1) */}
          <EntityProse kind="monster" monster={monster} deadliest={deadliest} />

          {/* Sticky ToC */}
          <nav className="toc" aria-label={t("On this page", lang)}>
            {tocItems.map((it) => (
              <a
                key={it.id}
                href={`#${it.id}`}
                className={activeSection === it.id ? "on" : undefined}
                onClick={(e) => handleTocClick(e, it.id)}
              >
                {it.label}
              </a>
            ))}
          </nav>

          {/* Stats */}
          {hasStats && (
            <section id="stats">
              <h2>{t("Stats", lang)}</h2>

              {(hpNormal || hpAscension || hasMoves) && (
                <div className="tiles">
                  {hpNormal && (
                    <div className="tile">
                      <div className="k">Hit Points</div>
                      <div className="v" style={{ color: "var(--warn)" }}>{hpNormal}</div>
                    </div>
                  )}
                  {hpAscension && (
                    <div className="tile">
                      <div className="k">HP · Ascension</div>
                      <div className="v" style={{ color: "var(--warn)" }}>{hpAscension}</div>
                    </div>
                  )}
                  {hasMoves && (
                    <div className="tile">
                      <div className="k">{t("Moves", lang)}</div>
                      <div className="v">{monster.moves!.length}</div>
                    </div>
                  )}
                  <div className="tile">
                    <div className="k">Type</div>
                    <div className="v" style={{ color: "var(--spine)", fontSize: 20 }}>{monster.type}</div>
                  </div>
                </div>
              )}

              {/* Innate Powers */}
              {monster.innate_powers && monster.innate_powers.length > 0 && (
                <>
                  <h3 className="subh">Innate Powers</h3>
                  <p className="h-note">Applied at the start of combat</p>
                  <div className="pills">
                    {monster.innate_powers.map((p, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <PowerPill
                          p={{ power_id: p.power_id, target: "self", amount: p.amount }}
                          powerData={powerData}
                          lp={lp}
                        />
                        {p.amount_ascension != null && p.amount_ascension !== p.amount && (
                          <span className="text-xs text-orange-400">(A: {p.amount_ascension})</span>
                        )}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {/* Attack Pattern — the localized move-name sequence (chips with
                  arrows). Falls back to the text description only when there
                  aren't enough steps to form a chip sequence, so the two never
                  duplicate each other. */}
              {monster.attack_pattern && (() => {
                const steps = patternSteps(monster.attack_pattern!, monster.moves || []);
                const desc = monster.attack_pattern!.description;
                const isCycle = monster.attack_pattern!.type === "cycle";
                return (
                  <>
                    <h3 className="subh">Attack Pattern</h3>
                    {steps.length > 1 ? (
                      <div className="atk-seq">
                        {steps.map((s, i) => (
                          <span key={i} className="atk-step-wrap">
                            <span className="atk-step">{s}</span>
                            {i < steps.length - 1 && <span className="atk-arrow">→</span>}
                          </span>
                        ))}
                        {isCycle && (
                          <span className="atk-repeat" title={t("Repeats", lang)}>↻</span>
                        )}
                      </div>
                    ) : (
                      desc && <p className="desc-body">{desc}</p>
                    )}
                  </>
                );
              })()}
            </section>
          )}

          {/* Moves */}
          {hasMoves && (
            <section id="moves">
              <h2>{t("Moves", lang)} ({monster.moves!.length})</h2>
              <div className="moves">
                {monster.moves!.map((move) => (
                  <MoveCard key={move.id} move={move} powerData={powerData} lp={lp} isEnglish={isEnglish} />
                ))}
              </div>
            </section>
          )}

          {/* Encounters */}
          {hasEncounters && (
            <section id="encounters">
              <h2>{t("Encounters", lang)}</h2>
              <p className="h-note">Where {monster.name} shows up.</p>
              {encounterStats && encounterStats.length > 0 && (
                <div className="enc-deadliness">
                  {monster.encounters!.map((enc) => {
                    const s = encounterStats.find(
                      (x) => x.encounter_id === enc.encounter_id,
                    );
                    if (!s || !s.total) return null;
                    const killRate = (s.fatal / s.total) * 100;
                    return (
                      <p key={enc.encounter_id} className="stat-note">
                        In {s.total.toLocaleString()} community runs, the{" "}
                        <b>{enc.encounter_name}</b> fight was fatal to{" "}
                        <b>{killRate.toFixed(1)}%</b> of runs ({s.fatal.toLocaleString()}),
                        dealing an average of <b>{s.avg_damage}</b> damage over{" "}
                        <b>{s.avg_turns}</b> turns.
                      </p>
                    );
                  })}
                </div>
              )}
              <div className="enc-list">
                {monster.encounters!.map((enc) => (
                  <Link
                    key={enc.encounter_id}
                    href={`${lp}/encounters/${enc.encounter_id.toLowerCase()}`}
                    className="enc-row"
                  >
                    <span className="enc-name">{enc.encounter_name}</span>
                    <div className="enc-meta">
                      {enc.act && <span className="badge">{enc.act}</span>}
                      <span className={`badge ${typeBadge[enc.room_type] || ""}`}>
                        {enc.room_type}
                      </span>
                      {enc.is_weak && (
                        <span className="badge bg-green-900/30 text-green-400">Weak</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Version history + localized names */}
          <section id="history">
            <h2>{t("Version history", lang)}</h2>
            <LocalizedNames entityType="monsters" entityId={id} />
            <EntityHistory entityType="monsters" entityId={id} />
          </section>
        </main>

        {/* ===== INFOBOX column (sticky) ===== */}
        <aside className="aside">
          <div className="box">
            {heroSrc && (
              <img
                className="sprite"
                src={imageUrl(heroSrc)}
                alt={`${monster.name} - Slay the Spire 2 Monster`}
                crossOrigin="anonymous"
              />
            )}

            {/* Beta / concept art toggle */}
            {monster.beta_image_url && (
              <div className="variant">
                <button
                  type="button"
                  className={`betabtn${betaArt ? " on" : ""}`}
                  aria-pressed={betaArt}
                  onClick={() => setBetaArt(!betaArt)}
                  title={betaArt ? "Show current art" : "Show concept art"}
                >
                  {betaArt ? "Current art" : "Concept art"}
                </button>
              </div>
            )}

            {/* Facts table */}
            <div className="facts">
              <div className="fh">{t("At a glance", lang)}</div>
              <dl>
                {hpNormal && (
                  <div className="frow">
                    <dt>Hit Points</dt>
                    <dd>{hpNormal}</dd>
                  </div>
                )}
                {hpAscension && (
                  <div className="frow">
                    <dt>HP · Ascension</dt>
                    <dd style={{ color: "var(--warn)" }}>{hpAscension}</dd>
                  </div>
                )}
                <div className="frow">
                  <dt>{t("Type", lang)}</dt>
                  <dd style={{ color: "var(--spine)" }}>{monster.type}</dd>
                </div>
                {acts.length > 0 && (
                  <div className="frow">
                    <dt>Act</dt>
                    <dd>{acts.join(", ")}</dd>
                  </div>
                )}
                {hasMoves && (
                  <div className="frow">
                    <dt>{t("Moves", lang)}</dt>
                    <dd>{monster.moves!.length}</dd>
                  </div>
                )}
                {hasEncounters && (
                  <div className="frow">
                    <dt>{t("Encounters", lang)}</dt>
                    <dd>{monster.encounters!.length}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
