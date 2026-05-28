"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { Power } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import SearchFilter from "../components/SearchFilter";
import RichDescription from "../components/RichDescription";
import { useLanguage } from "../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { imageUrl } from "@/lib/image-url";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const typeColors: Record<string, string> = {
  Buff: "border-emerald-600/40 text-emerald-400",
  Debuff: "border-red-600/40 text-red-400",
  None: "border-gray-500/40 text-gray-400",
};

const typeOptions = [
  { label: "Buff", value: "Buff" },
  { label: "Debuff", value: "Debuff" },
];

const stackOptions = [
  { label: "Counter", value: "Counter" },
  { label: "Single", value: "Single" },
];

export default function PowersClient({ initialPowers }: { initialPowers: Power[] }) {
    const lp = useLangPrefix();
const [powers, setPowers] = useState<Power[]>(initialPowers);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [stackType, setStackType] = useState("");
  const { lang } = useLanguage();
  const initialRender = useRef(true);

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with no filters
    if (initialRender.current) {
      initialRender.current = false;
      if (lang === "eng" && !type && !stackType && !search && initialPowers.length > 0) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (stackType) params.set("stack_type", stackType);
    if (search) params.set("search", search);
    params.set("lang", lang);
    cachedFetch<Power[]>(`${API}/api/powers?${params}`)
      .then(setPowers);
  }, [type, search, stackType, lang]);

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        placeholder="Search powers..."
        resultCount={powers.length}
        filters={[
          {
            label: "All Types",
            value: type,
            options: typeOptions,
            onChange: setType,
          },
          {
            label: "All Stack Types",
            value: stackType,
            options: stackOptions,
            onChange: setStackType,
          },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {powers.map((power) => {
          const style =
            typeColors[power.type] ||
            "border-[var(--border-subtle)] text-gray-400";
          return (
            <Link
              key={power.id}
              href={`${lp}/powers/${power.id.toLowerCase()}`}
              className={`bg-[var(--bg-card)] rounded-lg border ${style.split(" ")[0]} p-4 hover:bg-[var(--bg-card-hover)] transition-all`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {power.image_url && (
                    <img
                      src={imageUrl(power.image_url)}
                      alt=""
                      className="w-8 h-8 object-contain flex-shrink-0"
                      crossOrigin="anonymous"
                    />
                  )}
                  <h3 className="font-semibold text-[var(--text-primary)] leading-tight">
                    {power.name}
                  </h3>
                </div>
                <div className="flex gap-1.5 flex-shrink-0 ml-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${style.split(" ").slice(1).join(" ")} bg-[var(--bg-primary)]`}
                  >
                    {power.type}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded text-[var(--text-muted)] bg-[var(--bg-primary)]">
                    {power.stack_type}
                  </span>
                </div>
              </div>
              {power.description && (
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  <RichDescription text={power.description} />
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
