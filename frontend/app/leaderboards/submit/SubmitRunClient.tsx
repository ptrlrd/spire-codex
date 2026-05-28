"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useAuth } from "@/app/contexts/AuthContext";
import { t } from "@/lib/ui-translations";
import { IS_BETA } from "@/lib/seo";
import RunDropZone from "@/app/components/RunDropZone";
import DiscordIcon from "@/app/components/DiscordIcon";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Run {
  run_hash: string;
  character: string;
  win: boolean;
  was_abandoned: boolean;
  ascension: number;
  floors_reached: number;
  submitted_at: string;
}

const CHARACTER_COLORS: Record<string, string> = {
  IRONCLAD: "#d53b27",
  SILENT: "#23935b",
  DEFECT: "#3873a9",
  NECROBINDER: "#bf5a85",
  REGENT: "#f07c1e",
};

export default function SubmitRunClient() {
  const router = useRouter();
  const lp = useLangPrefix();
  const { lang } = useLanguage();
  const { user, loading: authLoading, loginSteam, loginDiscord } = useAuth();
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsLoading, setRunsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    total: number;
    done: number;
    dupes: number;
    errors: number;
  } | null>(null);
  const uploadInFlight = useRef(false);

  function isValidRunFile(data: any): boolean {
    return (
      data &&
      typeof data === "object" &&
      data.players &&
      data.acts &&
      data.map_point_history &&
      "win" in data
    );
  }

  function diagnoseRunFile(data: any): string {
    if (!data || typeof data !== "object") return "not a JSON object";
    const missing: string[] = [];
    if (!data.players) missing.push("players");
    if (!data.acts) missing.push("acts");
    if (!data.map_point_history) missing.push("map_point_history");
    if (!("win" in data)) missing.push("win");
    return missing.length ? `missing fields: ${missing.join(", ")}` : "unknown";
  }

  async function reportInvalidRuns(
    failures: {
      filename: string;
      reason: string;
      keys?: string[];
      schema?: number;
      build?: string;
    }[]
  ) {
    if (failures.length === 0) return;
    try {
      const summary = failures
        .slice(0, 10)
        .map((f) => {
          let line = `${f.filename}: ${f.reason}`;
          if (f.keys) line += ` [keys: ${f.keys.join(",")}]`;
          if (f.schema) line += ` [schema: ${f.schema}]`;
          if (f.build) line += ` [build: ${f.build}]`;
          return line;
        })
        .join("\n");
      const body =
        failures.length > 10
          ? `${summary}\n... and ${failures.length - 10} more`
          : summary;
      await fetch(`${API}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "Bug",
          contact: "auto-report",
          contents: `Run upload: ${failures.length} invalid out of batch\n\n${body}`,
        }),
      }).catch(() => {});
    } catch {}
  }

  const handleFileUpload = useCallback(
    async (files: FileList) => {
      const total = files.length;
      if (total === 0) return;
      if (uploadInFlight.current) return;
      uploadInFlight.current = true;
      setUploadProgress({ total, done: 0, dupes: 0, errors: 0 });
      setError("");

      let done = 0,
        dupes = 0,
        errors = 0;
      const failures: {
        filename: string;
        reason: string;
        keys?: string[];
        schema?: number;
        build?: string;
      }[] = [];
      const submitUrl = username.trim()
        ? `${API}/api/runs?username=${encodeURIComponent(username.trim())}`
        : `${API}/api/runs`;

      let lastHash: string | null = null;

      for (const file of Array.from(files)) {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (!isValidRunFile(data)) {
            errors++;
            failures.push({
              filename: file.name,
              reason: diagnoseRunFile(data),
              keys: Object.keys(data).slice(0, 15),
              schema: data?.schema_version,
              build: data?.build_id,
            });
          } else {
            const res = await fetch(submitUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: text,
            });
            const result = await res.json().catch(() => null);
            if (result?.duplicate) {
              dupes++;
              if (result?.run_hash) lastHash = result.run_hash;
            } else if (!res.ok) {
              errors++;
              failures.push({
                filename: file.name,
                reason: `backend ${res.status}: ${result?.detail || "unknown"}`,
                schema: data?.schema_version,
                build: data?.build_id,
              });
            } else if (result?.run_hash) {
              lastHash = result.run_hash;
            }
          }
        } catch (e) {
          errors++;
          failures.push({
            filename: file.name,
            reason: `exception: ${e instanceof Error ? e.message : "parse/network error"}`,
          });
        }
        done++;
        setUploadProgress({ total, done, dupes, errors });
      }

      if (failures.length > 0) {
        reportInvalidRuns(failures);
      }

      // If single file uploaded successfully, redirect to run detail
      if (total === 1 && errors === 0 && lastHash) {
        router.push(`${lp}/runs/${lastHash}`);
      }
      uploadInFlight.current = false;
    },
    [username, lp, router]
  );

  const fetchRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/runs?page=1&limit=5`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
        setRunsTotal(data.total || 0);
      }
    } catch {} finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchRuns();
  }, [user, fetchRuns]);


  // Run submissions are server-side rejected on beta (the backend returns
  // 403 with "Submit to spire-codex.com instead"). The Navbar already
  // hides this route on beta, but bookmarks / external links can still
  // land here — show an upfront notice instead of letting users drag in
  // files only to get a 403 per file. Two open bug reports (#104, #105)
  // came from exactly this flow before this gate existed.
  if (IS_BETA) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold mb-3">
          <span className="text-[var(--accent-gold)]">{t("Submit a Run", lang)}</span>
        </h1>
        <div className="rounded-xl border border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/5 p-6">
          <p className="text-base text-[var(--text-primary)] mb-4">
            Run submissions are disabled on the beta site so the leaderboards
            and community stats stay aligned with the stable game build.
          </p>
          <p className="text-sm text-[var(--text-secondary)] mb-5">
            Head to the stable site to upload your runs — they&apos;ll appear
            on the public leaderboards within a minute.
          </p>
          <a
            href="https://spire-codex.com/leaderboards/submit"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] font-medium hover:opacity-90 transition-opacity"
          >
            Submit on spire-codex.com
            <span aria-hidden>→</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">
          <span className="text-[var(--accent-gold)]">{t("Submit a Run", lang)}</span>
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          {t("submit_tagline", lang)}
        </p>
      </div>

      {/* Sign in prompt */}
      {!authLoading && !user && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 sm:p-5">
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Sign in to automatically associate runs with your account.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loginSteam}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.593c.064 0 .127.003.19.007l2.862-4.146v-.058a4.533 4.533 0 0 1 4.53-4.53 4.533 4.533 0 0 1 4.53 4.53 4.533 4.533 0 0 1-4.53 4.53h-.106l-4.08 2.91c0 .053.003.107.003.161a3.4 3.4 0 0 1-3.4 3.4 3.404 3.404 0 0 1-3.367-2.936L.256 15.21C1.542 20.2 6.218 24 11.979 24 18.627 24 24 18.627 24 11.979 24 5.373 18.627 0 11.979 0z"/></svg>
              Steam
            </button>
            <button
              onClick={loginDiscord}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <DiscordIcon className="w-4 h-4 shrink-0" />
              Discord
            </button>
          </div>
        </div>
      )}

      {/* Username input (only when not signed in) */}
      {!user && (
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.slice(0, 32))}
          placeholder={t("Username (optional)", lang)}
          maxLength={32}
          className="px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-gold)] w-full sm:w-48"
        />
      )}

      <RunDropZone onFiles={handleFileUpload} uploadProgress={uploadProgress} />

      {error && (
        <p className="text-[var(--color-ironclad)] text-sm">{error}</p>
      )}

      {/* Your Runs (signed in only) */}
      {user && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Your Runs {runsTotal > 0 && <span className="text-sm font-normal text-[var(--text-tertiary)]">({runsTotal})</span>}
            </h2>
            {runsTotal > 5 && (
              <Link
                href={`${lp}/profile`}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                View all
              </Link>
            )}
          </div>

          {runsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-[var(--bg-card)] rounded animate-pulse" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] py-4">
              No runs yet. Upload .run files above to get started.
            </p>
          ) : (
            <div className="space-y-1.5">
              {runs.map((run) => (
                <Link
                  key={run.run_hash}
                  href={`${lp}/runs/${run.run_hash}`}
                  className="flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: CHARACTER_COLORS[run.character] || "#888" }}
                  />
                  <span className="font-medium text-[var(--text-primary)] w-20 sm:w-24 truncate">
                    {run.character}
                  </span>
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${
                    run.win
                      ? "bg-green-500/15 text-green-400"
                      : run.was_abandoned
                        ? "bg-yellow-500/15 text-yellow-400"
                        : "bg-red-500/15 text-red-400"
                  }`}>
                    {run.win ? "W" : run.was_abandoned ? "A" : "L"}
                  </span>
                  <span className="text-[var(--text-tertiary)] text-xs hidden sm:inline">
                    A{run.ascension}
                  </span>
                  <span className="text-[var(--text-tertiary)] text-xs hidden sm:inline">
                    F{run.floors_reached}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
