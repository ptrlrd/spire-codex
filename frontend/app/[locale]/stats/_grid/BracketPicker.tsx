"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useT } from "@/lib/i18n";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import {
  CHARACTERS,
  MODE_AXIS,
  PLAYER_AXIS,
  SKILL_AXIS,
  combineBracket,
  parseBracket,
} from "./bracket";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function pillCls(active: boolean): string {
  return `rounded-full border px-3 py-1 text-xs transition-colors ${
    active
      ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]"
      : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
  }`;
}

export default function BracketPicker({
  basePath,
  bracket,
  character,
  showCharacter,
}: {
  basePath: string;
  bracket: string;
  character: string;
  showCharacter: boolean;
}) {
  const t = useT();
  const bp = useBetaPrefix();
  const router = useRouter();
  const sel = parseBracket(bracket);
  const [versions, setVersions] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${API}/api/runs/versions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setVersions(d?.stat_versions || []))
      .catch(() => {});
  }, []);

  const nav = (key: string, char: string) => {
    const params = new URLSearchParams();
    params.set("bracket", key);
    if (char) params.set("character", char);
    const qs = params.toString();
    router.push(qs ? `${bp}${basePath}?${qs}` : `${bp}${basePath}`);
  };

  const axis = (
    label: string,
    options: { key: string; label: string }[],
    current: string,
    pick: (k: string) => string,
  ) => (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-14 text-xs text-[var(--text-muted)]">
        {t(label)}
      </span>
      {options.map((o) => (
        <button
          key={o.key || "all"}
          type="button"
          onClick={() => nav(pick(o.key), character)}
          className={pillCls(current === o.key)}
        >
          {t(o.label)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mb-3">
      {axis("Players", PLAYER_AXIS, sel.player, (k) =>
        combineBracket(k, sel.skill, sel.mode, sel.version),
      )}
      {axis("Skill", SKILL_AXIS, sel.skill, (k) =>
        combineBracket(sel.player, k, sel.mode, sel.version),
      )}
      {axis("Mode", MODE_AXIS, sel.mode, (k) =>
        combineBracket(sel.player, sel.skill, k, sel.version),
      )}
      {versions.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 w-14 text-xs text-[var(--text-muted)]">
            {t("Version")}
          </span>
          <select
            value={sel.version}
            onChange={(e) =>
              nav(
                combineBracket(sel.player, sel.skill, sel.mode, e.target.value),
                character,
              )
            }
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-gold)]"
          >
            <option value="">{t("All versions")}</option>
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      )}
      {showCharacter && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 w-14 text-xs text-[var(--text-muted)]">
            {t("Played by")}
          </span>
          <button
            type="button"
            onClick={() => nav(bracket, "")}
            className={pillCls(character === "")}
          >
            {t("All")}
          </button>
          {CHARACTERS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => nav(bracket, c)}
              className={pillCls(character === c)}
            >
              {t(c.charAt(0) + c.slice(1).toLowerCase())}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
