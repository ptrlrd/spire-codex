"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { cachedFetch } from "@/lib/fetch-cache";
import { splitBracket, combineBracket } from "@/lib/content-brackets";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface VersionsResponse {
  stat_versions?: string[];
  data_versions?: string[];
}

export default function EntityVersionSelect({
  entityType,
  entityId,
  bracket,
  onBracketChange,
  onEntityData,
}: {
  entityType: "cards" | "relics" | "potions";
  entityId: string;
  bracket: string;
  onBracketChange: (b: string) => void;
  onEntityData?: (data: unknown | null, version: string) => void;
}) {
  const { lang } = useLanguage();
  const [versions, setVersions] = useState<VersionsResponse | null>(null);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    cachedFetch<VersionsResponse>(`${API}/api/runs/versions`)
      .then(setVersions)
      .catch(() => {});
  }, []);

  const dataVersions = versions?.data_versions ?? [];
  if (dataVersions.length === 0) return null;
  const statVersions = new Set(versions?.stat_versions ?? []);

  async function pick(v: string) {
    setSelected(v);
    const { player, skill } = splitBracket(bracket);
    onBracketChange(combineBracket(player, skill, statVersions.has(v) ? v : ""));
    if (!onEntityData) return;
    const qs = `lang=${lang}${v ? `&version=${v}` : ""}`;
    try {
      const d = await cachedFetch<{ id?: string }>(
        `${API}/api/${entityType}/${entityId.toLowerCase()}?${qs}`,
      );
      onEntityData(d?.id ? d : null, v);
    } catch {
      onEntityData(null, v);
    }
  }

  return (
    <select
      className="ench-select"
      aria-label="Game version"
      value={selected}
      onChange={(e) => pick(e.target.value)}
      title={t("View this entity's data and stats as of a game version", lang)}
    >
      <option value="">{t("Current version", lang)}</option>
      {dataVersions.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}
