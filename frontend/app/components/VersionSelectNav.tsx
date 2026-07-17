"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { splitBracket } from "@/lib/content-brackets";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * The Version row of BracketFilter. Client half of a server component: it
 * self-populates from /api/runs/versions (stat_versions = the versions the
 * snapshot keeps per-version slices for) and navigates the same way the
 * bracket pills do. The version is a third axis that COMPOSES with the
 * current bracket selection: picking one keeps `base` (the player/skill
 * selection, e.g. "solo:wr50") and emits ?bracket=solo:wr50:v0.107.1;
 * "All versions" drops back to the base alone. Renders nothing while the
 * version list is loading or empty.
 */
export default function VersionSelectNav({
  basePath,
  current,
  extraParams,
  base = "",
}: {
  basePath: string;
  current: string;
  extraParams?: Record<string, string | undefined>;
  base?: string;
}) {
  const router = useRouter();
  const [versions, setVersions] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${API}/api/runs/versions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setVersions(d?.stat_versions || []))
      .catch(() => {});
  }, []);

  if (versions.length === 0) return null;

  // Keep a URL-supplied version selectable even if it fell out of the
  // snapshot's list (stale link), so the select reflects the page state.
  const value = splitBracket(current).version;
  const options = value && !versions.includes(value) ? [value, ...versions] : versions;

  const onChange = (v: string) => {
    const bracket = v ? (base ? `${base}:${v}` : v) : base;
    const params = new URLSearchParams();
    for (const [k, val] of Object.entries(extraParams ?? {})) {
      if (val) params.set(k, val);
    }
    if (bracket && bracket !== "all") params.set("bracket", bracket);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 text-xs text-[var(--text-muted)]">Version</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Game version"
        className="text-xs px-2 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-gold)]"
      >
        <option value="">All versions</option>
        {options.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}
