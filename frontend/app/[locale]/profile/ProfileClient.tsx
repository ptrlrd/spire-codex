"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { useToast } from "@/app/components/Toast";
import RunDropZone from "@/app/components/RunDropZone";
import ProfileStats, { type StatsTab } from "@/app/components/ProfileStats";
import MyChartsSection from "@/app/components/MyChartsSection";
import {
  EMPTY_INSIGHT_FILTERS,
  InsightsFilterBar,
  type InsightFilters,
} from "@/app/components/ProfileInsights";
import YourStats from "@/app/[locale]/players/[username]/YourStats";
import { parseQuery, queryParams } from "@/lib/run-query";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Run {
  run_hash: string;
  character: string;
  win: boolean;
  was_abandoned: boolean;
  ascension: number;
  game_mode: string;
  player_count: number;
  floors_reached: number;
  killed_by: string | null;
  username: string | null;
  submitted_at: string;
}

interface UploadResult {
  filename: string;
  status: "claimed" | "duplicate" | "error";
  detail?: string;
  run_hash?: string;
}

export default function ProfileClient() {
  const { user, loading } = useAuth();
  const lang = useGameLocale();
  const t = useT();
  const { toast } = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [runsQuery, setRunsQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [versions, setVersions] = useState<string[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(
    null,
  );
  const [uploadProgress, setUploadProgress] = useState<{
    total: number;
    done: number;
    dupes: number;
    errors: number;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setAppliedQuery(runsQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [runsQuery]);

  useEffect(() => {
    if (!parseQuery(appliedQuery).filters.version || versions.length) return;
    fetch(`${API_BASE}/api/runs/versions`)
      .then((r) => (r.ok ? r.json() : { versions: [] }))
      .then((d) =>
        setVersions(
          (d.versions || [])
            .filter((v: string) => !v.toLowerCase().includes("nonreleased"))
            .sort((a: string, b: string) =>
              b.localeCompare(a, undefined, { numeric: true }),
            ),
        ),
      )
      .catch(() => {});
  }, [appliedQuery, versions.length]);

  const fetchRuns = useCallback(
    async (p: number) => {
      setRunsLoading(true);
      try {
        const params = queryParams(parseQuery(appliedQuery).filters, versions);
        params.set("page", String(p));
        params.set("limit", "20");
        const res = await fetch(`${API_BASE}/api/auth/runs?${params}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setRuns(data.runs || []);
          setTotal(data.total || 0);
        }
      } catch {
        toast(t("Failed to load runs"), "error");
      } finally {
        setRunsLoading(false);
      }
    },
    [toast, lang, appliedQuery, versions],
  );

  useEffect(() => {
    if (user) fetchRuns(page);
  }, [user, page, fetchRuns]);

  // Batches go up in chunks of 10, sequentially: one request for 100
  // files was a single point of failure (a proxy body cap or a dropped
  // connection lost the whole batch), and 10 chunks a minute is exactly
  // the endpoint's rate limit. A failed chunk is retried twice before its
  // files are reported as errors and the rest keep going.
  const UPLOAD_CHUNK = 10;

  const handleUpload = async (files: FileList | File[]) => {
    const all = Array.from(files);
    if (!all.length) return;
    setUploading(true);
    setUploadResults(null);
    const progress = { total: all.length, done: 0, dupes: 0, errors: 0 };
    setUploadProgress({ ...progress });
    const results: UploadResult[] = [];
    const summary = { claimed: 0, duplicates: 0, errors: 0 };
    let signedOut = false;

    const send = async (chunk: File[]): Promise<Response> => {
      const formData = new FormData();
      chunk.forEach((f) => formData.append("files", f));
      return fetch(`${API_BASE}/api/auth/runs/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
    };

    for (let i = 0; i < all.length && !signedOut; i += UPLOAD_CHUNK) {
      const chunk = all.slice(i, i + UPLOAD_CHUNK);
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          res = await send(chunk);
        } catch {
          res = null;
        }
        // Retry only what a retry can fix: network drops and 5xx.
        if (res && (res.ok || res.status < 500)) break;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
      if (res?.ok) {
        const data = await res.json();
        results.push(...(data.results || []));
        summary.claimed += data.summary?.claimed || 0;
        summary.duplicates += data.summary?.duplicates || 0;
        summary.errors += data.summary?.errors || 0;
      } else if (res?.status === 401) {
        signedOut = true;
      } else {
        const err = res ? await res.json().catch(() => null) : null;
        const detail =
          res?.status === 413
            ? t("Too many files or file too large")
            : err?.detail ||
              (res ? t("Upload failed") : t("Network error during upload"));
        chunk.forEach((f) =>
          results.push({ filename: f.name, status: "error", detail }),
        );
        summary.errors += chunk.length;
      }
      progress.done = Math.min(all.length, i + chunk.length);
      progress.dupes = summary.duplicates;
      progress.errors = summary.errors;
      setUploadProgress({ ...progress });
      setUploadResults([...results]);
    }

    if (signedOut) {
      toast(t("Please sign in to upload runs"), "error");
    } else {
      toast(
        `${summary.claimed} ${t("claimed")}, ${summary.duplicates} ${t("duplicates")}, ${summary.errors} ${t("errors")}`,
        summary.errors > 0 ? "error" : "success",
      );
      if (summary.claimed > 0) {
        fetchRuns(1);
        setPage(1);
      }
    }
    setUploadProgress(null);
    setUploading(false);
  };

  const handleDelete = async (runHash: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/runs/${runHash}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast(t("Run removed from your profile"), "success");
        setRuns((prev) => prev.filter((r) => r.run_hash !== runHash));
        setTotal((prev) => prev - 1);
      } else if (res.status === 403) {
        toast(t("You do not own this run"), "error");
      } else if (res.status === 404) {
        toast(t("Run not found"), "error");
      } else {
        toast(t("Failed to delete run"), "error");
      }
    } catch {
      toast(t("Network error"), "error");
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleDeleteMany = async (hashes: string[]) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/runs/bulk-delete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_hashes: hashes }),
      });
      if (!res.ok) {
        toast(t("Failed to delete run"), "error");
        return;
      }
      const body = (await res.json()) as {
        deleted: string[];
        failed: Record<string, string>;
      };
      const removed = new Set(body.deleted);
      if (removed.size > 0) {
        // Count what this update actually drops rather than what the server
        // reported, so a row a single delete already removed is not subtracted
        // from the total twice.
        setRuns((prev) => {
          const next = prev.filter((r) => !removed.has(r.run_hash));
          const dropped = prev.length - next.length;
          if (dropped > 0)
            setTotal((current) => Math.max(0, current - dropped));
          return next;
        });
      }
      const failedCount = Object.keys(body.failed ?? {}).length;
      if (failedCount > 0) {
        toast(
          t("Removed {n} runs, {failed} could not be removed", {
            n: removed.size,
            failed: failedCount,
          }),
          "error",
        );
      } else {
        toast(
          t("Removed {n} runs from your profile", { n: removed.size }),
          "success",
        );
      }
    } catch {
      toast(t("Network error"), "error");
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="h-8 w-48 bg-[var(--bg-card)] rounded animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">
          {t("Sign in to view your profile")}
        </h1>
        <p className="text-[var(--text-secondary)]">
          {t(
            "Connect your Steam or Discord account to see your runs and stats.",
          )}
        </p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        {user.username
          ? `${user.username}'s ${t("Profile")}`
          : t("Your Profile")}
      </h1>

      {/* Stats (includes My Runs as a tab) */}
      <section>
        <ProfileStats
          runs={runs}
          runsTotal={total}
          runsLoading={runsLoading}
          runsPage={page}
          runsTotalPages={totalPages}
          onPageChange={setPage}
          onDeleteRun={handleDelete}
          deleteConfirm={deleteConfirm}
          onDeleteConfirm={setDeleteConfirm}
          onDeleteRuns={handleDeleteMany}
          runsQuery={runsQuery}
          onRunsQueryChange={setRunsQuery}
          overviewExtra={
            user.username ? (
              <OwnStats key={user.user_id} username={user.username} />
            ) : null
          }
          statsTab={(tab) =>
            user.username ? (
              <OwnStats
                key={`${user.user_id}-${tab}`}
                username={user.username}
                tab={tab}
              />
            ) : null
          }
          chartsTab={<MyChartsSection />}
        />
      </section>

      {/* Claim Runs */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
          {t("Claim Runs")}
        </h2>
        <RunDropZone
          onFiles={(files) => handleUpload(files)}
          uploading={uploading}
          uploadProgress={uploadProgress}
        />

        {uploadResults && uploadResults.length > 0 && (
          <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
            {uploadResults.map((r, i) => (
              <div
                key={i}
                className={`text-xs px-3 py-1.5 rounded flex items-center justify-between ${
                  r.status === "claimed"
                    ? "bg-success/10 text-success"
                    : r.status === "duplicate"
                      ? "bg-warning/10 text-warning"
                      : "bg-danger/10 text-danger"
                }`}
              >
                <span className="truncate">{r.filename}</span>
                <span className="shrink-0 ml-2">
                  {r.status === "error" ? r.detail : r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function OwnStats({ username, tab }: { username: string; tab?: StatsTab }) {
  const lang = useGameLocale();
  const [filters, setFilters] = useState<InsightFilters>(EMPTY_INSIGHT_FILTERS);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <InsightsFilterBar value={filters} onChange={setFilters} lang={lang} />
      </div>
      <YourStats username={username} filters={filters} own tab={tab} />
    </div>
  );
}
