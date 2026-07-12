"use client";

import { useState, useEffect, useRef, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Monster, MonsterMove, MonsterMovePower, Power } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { t } from "@/lib/ui-translations";
import RichDescription from "@/app/components/RichDescription";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
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

function MoveCard({
  move,
  powerData,
  lp,
}: {
  move: MonsterMove;
  powerData: Record<string, Power>;
  lp: string;
}) {
  const intentParts = (move.intent || "Unknown").split(" + ");

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

export default function MonsterDetail({ initialMonster }: { initialMonster?: Monster | null } = {}) {
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

  // Derive acts from encounters
  const acts = monster.encounters
    ? [...new Set(monster.encounters.filter(e => e.act).map(e => e.act!))]
    : [];

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

              {/* Attack Pattern */}
              {monster.attack_pattern && (
                <>
                  <h3 className="subh">Attack Pattern</h3>
                  <p className="desc-body">{monster.attack_pattern.description}</p>
                </>
              )}
            </section>
          )}

          {/* Moves */}
          {hasMoves && (
            <section id="moves">
              <h2>{t("Moves", lang)} ({monster.moves!.length})</h2>
              <div className="moves">
                {monster.moves!.map((move) => (
                  <MoveCard key={move.id} move={move} powerData={powerData} lp={lp} />
                ))}
              </div>
            </section>
          )}

          {/* Encounters */}
          {hasEncounters && (
            <section id="encounters">
              <h2>{t("Encounters", lang)}</h2>
              <p className="h-note">Where {monster.name} shows up.</p>
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
