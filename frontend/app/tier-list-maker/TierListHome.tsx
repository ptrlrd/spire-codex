"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import MyTierLists from "./MyTierLists";
import { ENTITY_TYPES } from "./types";
import type { EntityType } from "./types";

export default function TierListHome() {
  const router = useRouter();
  const { lang } = useLanguage();
  const [type, setType] = useState<EntityType>("relics");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("Tier List Maker", lang)}</h1>
      <p className="mt-1 text-[var(--text-secondary)]">
        {t("Drag and drop to rank the game's cards, relics, potions, and monsters. Sign in with Steam to save your lists and get a shareable link.", lang)}
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
        <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
          {t("Rank", lang)}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as EntityType)}
            className="rounded border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-[var(--text-primary)] outline-none focus:border-sky-500"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => router.push(`/tier-list-maker/new?type=${type}`)}
          className="rounded bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-500"
        >
          {t("Create tier list", lang)}
        </button>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("Your tier lists", lang)}</h2>
        <MyTierLists />
      </div>
    </div>
  );
}
