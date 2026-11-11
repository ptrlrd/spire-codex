"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { cachedFetch } from "@/lib/fetch-cache";
import { fullCardUrl } from "@/lib/image-url";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { useGameLocale, useT, type TFn } from "@/lib/i18n";
import RichDescription from "./RichDescription";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface TypeDiff {
  added: string[];
  changed: Record<string, string[]>;
  removed: string[];
}
interface BetaDiff {
  beta_version: string | null;
  types: Record<string, TypeDiff>;
}
type Entity = Record<string, unknown>;

const TEXT_FIELDS = new Set([
  "description",
  "upgrade_description",
  "loss_text",
  "flavor",
]);
const DUPLICATE_FIELDS = new Set([
  "description_raw",
  "rarity_key",
  "type_key",
  "keywords_key",
  "type_variants",
]);
const FIELD_LABELS: Record<string, string> = {
  description: "description",
  upgrade_description: "upgraded description",
  upgrade: "upgrade",
  vars: "numbers",
  damage: "damage",
  block: "block",
  cost: "cost",
  star_cost: "star cost",
  hit_count: "hit count",
  rarity: "rarity",
  keywords: "keywords",
  powers_applied: "applied powers",
  damage_values: "damage values",
  attack_pattern: "attack pattern",
};

function label(field: string, t: TFn): string {
  return t(FIELD_LABELS[field] ?? field.replace(/_/g, " "));
}

function isScalar(v: unknown): v is string | number | boolean | null {
  return v === null || v === undefined || typeof v !== "object";
}

function scalarText(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "-";
  return String(v);
}

function isSimple(v: unknown): boolean {
  return isScalar(v) || (Array.isArray(v) && v.every(isScalar));
}

/** On a main detail page: what the current beta changes about this entity,
 * with old and new values side by side. Renders nothing when beta matches. */
export default function BetaChanges({
  type,
  id,
}: {
  type: string;
  id: string;
}) {
  const t = useT();
  const lang = useGameLocale();
  const [diff, setDiff] = useState<BetaDiff | null>(null);
  const [pair, setPair] = useState<{ main: Entity; beta: Entity } | null>(null);
  const inBetaSection = useBetaPrefix() === "/beta";
  const key = id.toUpperCase();
  const td = diff?.beta_version ? diff.types?.[type] : undefined;
  const fields = td?.changed?.[key];
  const removed = !!td?.removed?.includes(key);

  useEffect(() => {
    cachedFetch<BetaDiff>(`${API}/api/beta/diff`)
      .then(setDiff)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!fields || inBetaSection) return;
    let active = true;
    const url = `${API}/api/${type}/${id.toLowerCase()}?lang=${lang}`;
    Promise.all([
      cachedFetch<Entity>(`${url}&channel=stable`),
      cachedFetch<Entity>(`${url}&channel=beta`),
    ])
      .then(([main, beta]) => {
        if (active) setPair({ main, beta });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [fields, type, id, lang, inBetaSection]);

  if (inBetaSection || (!fields && !removed)) return null;
  const version = diff?.beta_version ?? "";
  const shown = (fields ?? []).filter((f) => !DUPLICATE_FIELDS.has(f));
  const texts = shown.filter((f) => TEXT_FIELDS.has(f));
  const simple = shown.filter(
    (f) =>
      !TEXT_FIELDS.has(f) &&
      pair &&
      isSimple(pair.main[f]) &&
      isSimple(pair.beta[f]),
  );
  const other = shown.filter((f) => !texts.includes(f) && !simple.includes(f));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 -mb-2">
      <section
        aria-label={t("Beta changes")}
        className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-[var(--text-secondary)]"
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-semibold text-success shrink-0">
            {removed
              ? t("Removed in beta {version}", { version })
              : t("Changing in beta {version}", { version })}
          </span>
          {!removed && (
            <span className="text-[var(--text-muted)]">
              {shown.map((f) => label(f, t)).join(", ")}
            </span>
          )}
          <Link
            href="/beta"
            className="ml-auto shrink-0 text-success hover:text-success hover:underline"
          >
            {t("Everything new in beta")} →
          </Link>
        </div>
        {!removed && pair && (
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3 border-t border-success/20 pt-2">
            {type === "cards" && (
              <div className="flex gap-3">
                {(["stable", "beta"] as const).map((channel) => (
                  <figure key={channel} className="w-[112px]">
                    <img
                      src={fullCardUrl(id, false, channel, lang)}
                      alt={`${String(pair.main.name ?? id)} (${
                        channel === "beta" ? t("Beta") : t("Main")
                      })`}
                      width={112}
                      className="h-auto w-full"
                      loading="lazy"
                      onError={(e) => {
                        const fig = e.currentTarget.parentElement;
                        if (fig) fig.style.display = "none";
                      }}
                    />
                    <figcaption
                      className={`mt-0.5 text-center font-semibold ${
                        channel === "beta"
                          ? "text-success"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {channel === "beta" ? t("Beta") : t("Main")}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            <dl className="min-w-0 flex-1 basis-64 space-y-1.5">
              {simple.map((f) => (
                <div key={f} className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="w-32 shrink-0 capitalize text-[var(--text-muted)]">
                    {label(f, t)}
                  </dt>
                  <dd className="tabular-nums">
                    <span className="text-[var(--text-muted)] line-through">
                      {scalarText(pair.main[f])}
                    </span>
                    <span aria-hidden className="mx-1.5">
                      →
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {scalarText(pair.beta[f])}
                    </span>
                  </dd>
                </div>
              ))}
              {texts.map((f) => (
                <div key={f}>
                  <dt className="capitalize text-[var(--text-muted)]">
                    {label(f, t)}
                  </dt>
                  <dd className="mt-0.5 grid gap-1 sm:grid-cols-2 sm:gap-3">
                    {(["main", "beta"] as const).map((side) => (
                      <p key={side} className="text-sm leading-snug">
                        <span
                          className={`mr-1.5 text-[10px] font-semibold uppercase ${
                            side === "beta"
                              ? "text-success"
                              : "text-[var(--text-muted)]"
                          }`}
                        >
                          {side === "beta" ? t("Beta") : t("Main")}
                        </span>
                        {pair[side][f] ? (
                          <RichDescription
                            text={String(pair[side][f])}
                            nestedInLink
                          />
                        ) : (
                          "-"
                        )}
                      </p>
                    ))}
                  </dd>
                </div>
              ))}
              {other.length > 0 && (
                <div className="text-[var(--text-muted)]">
                  {other.length < shown.length &&
                    `${t("Also changed: {fields}", {
                      fields: other.map((f) => label(f, t)).join(", "),
                    })} `}
                  <Link
                    href={`/beta/${type}/${id.toLowerCase()}`}
                    className="text-success hover:underline"
                  >
                    {t("See the full beta version")} →
                  </Link>
                </div>
              )}
            </dl>
          </div>
        )}
      </section>
    </div>
  );
}
