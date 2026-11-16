"use client";

import { useGameLocale, useT } from "@/lib/i18n";
import { useState, useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import type { Power } from "@/lib/api/types";
import { cachedFetch } from "@/lib/fetch-cache";
import SearchFilter from "@/app/components/SearchFilter";
import RichDescription from "@/app/components/RichDescription";
import { useChannel, useBetaPrefix } from "@/lib/api/prefix.client";
import { useBetaAdditions } from "@/lib/use-beta-additions";
import BetaBadge from "@/app/components/BetaBadge";
import { imageUrl } from "@/lib/image-url";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TYPE_ORDER = ["Buff", "Debuff"];
const STACK_ORDER = ["Counter", "Single"];

const typeText: Record<string, string> = {
  Buff: "text-success",
  Debuff: "text-danger",
};

interface PowerRow {
  key: string;
  first: Power;
  variants: Power[];
}

function orderIndex(order: string[], value: string) {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
}

function variantLabel(power: Power) {
  const words = power.id.toLowerCase().split("_");
  const nameWords = power.name.toLowerCase().split(/\s+/);
  let rest = nameWords.every((w, i) => words[i] === w)
    ? words.slice(nameWords.length)
    : words;
  let shared = 0;
  while (
    shared < rest.length - 1 &&
    shared < nameWords.length &&
    rest[rest.length - 1 - shared] === nameWords[nameWords.length - 1 - shared]
  ) {
    shared += 1;
  }
  if (shared) rest = rest.slice(0, rest.length - shared);
  return (rest.length ? rest : words)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function groupRows(powers: Power[]): PowerRow[] {
  const rows = new Map<string, PowerRow>();
  for (const power of powers) {
    const key = `${power.name}|${power.description ?? ""}`;
    const row = rows.get(key);
    if (row) row.variants.push(power);
    else rows.set(key, { key, first: power, variants: [power] });
  }
  return [...rows.values()].sort((x, y) =>
    x.first.name.localeCompare(y.first.name),
  );
}

function PowerIcon({ power, size }: { power: Power; size: number }) {
  if (!power.image_url) {
    return (
      <span
        aria-hidden
        className="flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <img
      src={imageUrl(power.image_url)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="object-contain flex-shrink-0"
      style={{ width: size, height: size }}
      crossOrigin="anonymous"
    />
  );
}

const typeOptions = [
  { label: "Buff", value: "Buff" },
  { label: "Debuff", value: "Debuff" },
];

const stackOptions = [
  { label: "Counter", value: "Counter" },
  { label: "Single", value: "Single" },
];

export default function PowersClient({
  initialPowers,
}: {
  initialPowers: Power[];
}) {
  const bp = useBetaPrefix();
  const [powers, setPowers] = useState<Power[]>(initialPowers);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [stackType, setStackType] = useState("");
  const lang = useGameLocale();
  const t = useT();
  const channel = useChannel();
  const betaAdditions = useBetaAdditions<Power>("powers", lang);
  const initialRender = useRef(true);

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with
    // no filters. Never skip on the beta channel: the server data is the
    // stable catalog, and cachedFetch appends channel=beta on /beta paths.
    if (initialRender.current) {
      initialRender.current = false;
      if (
        channel !== "beta" &&
        lang === "eng" &&
        !type &&
        !stackType &&
        !search &&
        initialPowers.length > 0
      ) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (stackType) params.set("stack_type", stackType);
    if (search) params.set("search", search);
    params.set("lang", lang);
    cachedFetch<Power[]>(`${API}/api/powers?${params}`).then(setPowers);
  }, [type, search, stackType, lang, channel]);

  // Beta-only powers join the stable list (the regular filters run
  // server-side, so apply them locally to the additions).
  const betaIds = new Set(betaAdditions.map((p) => p.id));
  const merged = [
    ...powers.filter((p) => !betaIds.has(p.id)),
    ...betaAdditions.filter(
      (p) =>
        (!type || p.type === type) &&
        (!stackType || p.stack_type === stackType) &&
        (!search || p.name.toLowerCase().includes(search.toLowerCase())),
    ),
  ];

  const types = [...new Set(merged.map((p) => p.type))].sort(
    (x, y) => orderIndex(TYPE_ORDER, x) - orderIndex(TYPE_ORDER, y),
  );
  const sections = types.map((sectionType) => {
    const inType = merged.filter((p) => p.type === sectionType);
    const stacks = [...new Set(inType.map((p) => p.stack_type))]
      .sort((x, y) => orderIndex(STACK_ORDER, x) - orderIndex(STACK_ORDER, y))
      .map((sectionStack) => {
        const inStack = inType.filter((p) => p.stack_type === sectionStack);
        return {
          stackType: sectionStack,
          count: inStack.length,
          rows: groupRows(inStack),
        };
      });
    return { type: sectionType, count: inType.length, stacks };
  });

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        placeholder={t("Search powers...")}
        resultCount={merged.length}
        filters={[
          {
            label: "Any Type",
            name: "Type",
            value: type,
            options: typeOptions,
            onChange: setType,
          },
          {
            label: "Any Stack Type",
            name: "Stack Type",
            value: stackType,
            options: stackOptions,
            onChange: setStackType,
          },
        ]}
      />

      {sections.length > 1 && (
        <nav
          aria-label={t("On this page")}
          className="flex flex-wrap gap-2 mb-6"
        >
          {sections.map((section) => (
            <a
              key={section.type}
              href={`#powers-${section.type.toLowerCase()}`}
              onClick={() => {
                const target = document.getElementById(
                  `powers-${section.type.toLowerCase()}`,
                );
                if (target instanceof HTMLDetailsElement) target.open = true;
              }}
              className="inline-flex items-center gap-2 min-h-11 px-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <span
                className={`font-semibold ${typeText[section.type] ?? "text-[var(--text-primary)]"}`}
              >
                {t(section.type)}
              </span>
              <span className="text-[var(--text-muted)]">{section.count}</span>
            </a>
          ))}
        </nav>
      )}

      {sections.map((section) => (
        <details
          key={section.type}
          id={`powers-${section.type.toLowerCase()}`}
          open
          className="group mb-10 scroll-mt-20"
        >
          <summary className="flex items-center gap-3 min-h-11 cursor-pointer list-none border-b border-[var(--border-subtle)] pb-2 [&::-webkit-details-marker]:hidden">
            <h2
              className={`text-xl font-semibold ${typeText[section.type] ?? "text-[var(--text-primary)]"}`}
            >
              {t(section.type)}
            </h2>
            <span className="text-sm text-[var(--text-muted)]">
              {section.count}
            </span>
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              className="ml-auto w-5 h-5 text-[var(--text-muted)] transition-transform group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 8l5 5 5-5" strokeLinecap="round" />
            </svg>
          </summary>

          {section.stacks.map((stack) => (
            <div key={stack.stackType} className="mt-5">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-1">
                {t("Stack Type")}: {t(stack.stackType)}
                <span className="ml-2 font-normal text-[var(--text-muted)]">
                  {stack.count}
                </span>
              </h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
                {stack.rows.map((row) => {
                  const power = row.first;
                  const rowClass =
                    "flex items-start gap-3 py-2.5 border-b border-[var(--border-subtle)] h-full";
                  const text = (
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)] leading-snug">
                        {power.name}
                        {row.variants.length === 1 && betaIds.has(power.id) && (
                          <BetaBadge />
                        )}
                      </span>
                      {power.description && (
                        <span className="block text-sm text-[var(--text-secondary)] leading-relaxed">
                          <RichDescription text={power.description} />
                        </span>
                      )}
                    </span>
                  );
                  if (row.variants.length === 1) {
                    return (
                      <li key={row.key}>
                        <Link
                          prefetch={false}
                          href={`${bp}/powers/${power.id.toLowerCase()}`}
                          className={`${rowClass} hover:bg-[var(--bg-card-hover)] transition-colors`}
                        >
                          <PowerIcon power={power} size={32} />
                          {text}
                        </Link>
                      </li>
                    );
                  }
                  return (
                    <li key={row.key}>
                      <div className={rowClass}>
                        <PowerIcon power={power} size={32} />
                        <div className="min-w-0 flex-1">
                          {text}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {row.variants.map((variant) => (
                              <Link
                                prefetch={false}
                                key={variant.id}
                                href={`${bp}/powers/${variant.id.toLowerCase()}`}
                                className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-8 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] transition-colors"
                              >
                                <PowerIcon power={variant} size={20} />
                                {variantLabel(variant)}
                                {betaIds.has(variant.id) && <BetaBadge />}
                              </Link>
                            ))}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </details>
      ))}
    </>
  );
}
