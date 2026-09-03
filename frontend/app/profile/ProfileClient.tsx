"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/app/contexts/AuthContext";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { useToast } from "@/app/components/Toast";
import RunDropZone from "@/app/components/RunDropZone";
import ProfileStats from "@/app/components/ProfileStats";

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
  const { lang } = useLanguage();
  const { toast } = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [runsLoading, setRunsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    total: number;
    done: number;
    dupes: number;
    errors: number;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [profilePrivate, setProfilePrivate] = useState<boolean | null>(null);

  useEffect(() => {
    if (user) setProfilePrivate(Boolean(user.profile_private));
  }, [user]);

  const togglePrivacy = async (next: boolean) => {
    const prev = profilePrivate;
    setProfilePrivate(next);
    try {
      const res = await fetch(`${API_BASE}/api/auth/profile-privacy`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ private: next }),
      });
      if (!res.ok) throw new Error();
      toast(
        next
          ? t("Your profile is now private.", lang)
          : t("Your profile is now public.", lang),
        "success"
      );
    } catch {
      setProfilePrivate(prev);
      toast(t("Network error", lang), "error");
    }
  };

  const fetchRuns = useCallback(async (p: number) => {
    setRunsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/runs?page=${p}&limit=20`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
        setTotal(data.total || 0);
      }
    } catch {
      toast(t("Failed to load runs", lang), "error");
    } finally {
      setRunsLoading(false);
    }
  }, [toast, lang]);

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
            ? t("Too many files or file too large", lang)
            : err?.detail || (res ? t("Upload failed", lang) : t("Network error during upload", lang));
        chunk.forEach((f) =>
          results.push({ filename: f.name, status: "error", detail })
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
      toast(t("Please sign in to upload runs", lang), "error");
    } else {
      toast(
        `${summary.claimed} ${t("claimed", lang)}, ${summary.duplicates} ${t("duplicates", lang)}, ${summary.errors} ${t("errors", lang)}`,
        summary.errors > 0 ? "error" : "success"
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
        toast(t("Run removed from your profile", lang), "success");
        setRuns((prev) => prev.filter((r) => r.run_hash !== runHash));
        setTotal((prev) => prev - 1);
      } else if (res.status === 403) {
        toast(t("You do not own this run", lang), "error");
      } else if (res.status === 404) {
        toast(t("Run not found", lang), "error");
      } else {
        toast(t("Failed to delete run", lang), "error");
      }
    } catch {
      toast(t("Network error", lang), "error");
    } finally {
      setDeleteConfirm(null);
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
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">{t("Sign in to view your profile", lang)}</h1>
        <p className="text-[var(--text-secondary)]">{t("Connect your Steam or Discord account to see your runs and stats.", lang)}</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        {user.username ? `${user.username}'s ${t("Profile", lang)}` : t("Your Profile", lang)}
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
        />
      </section>

      {/* Claim Runs */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">{t("Claim Runs", lang)}</h2>
        <RunDropZone onFiles={(files) => handleUpload(files)} uploading={uploading} uploadProgress={uploadProgress} />

        {uploadResults && uploadResults.length > 0 && (
          <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
            {uploadResults.map((r, i) => (
              <div
                key={i}
                className={`text-xs px-3 py-1.5 rounded flex items-center justify-between ${
                  r.status === "claimed"
                    ? "bg-green-500/10 text-green-300"
                    : r.status === "duplicate"
                      ? "bg-yellow-500/10 text-yellow-300"
                      : "bg-red-500/10 text-red-300"
                }`}
              >
                <span className="truncate">{r.filename}</span>
                <span className="shrink-0 ml-2">{r.status === "error" ? r.detail : r.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Public profile */}
      {user.username && profilePrivate !== null && (
        <section className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("Public profile", lang)}</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {profilePrivate
                  ? t("Your profile page is private. Your runs still appear on leaderboards.", lang)
                  : t("Anyone can view your stats and insights at your player page.", lang)}
              </p>
              {!profilePrivate && (
                <Link
                  href={`/players/${encodeURIComponent(user.username)}`}
                  className="inline-block mt-1 text-xs text-[var(--accent-gold)] hover:underline"
                >
                  {t("View public profile", lang)}
                </Link>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={profilePrivate}
                onChange={(e) => togglePrivacy(e.target.checked)}
                className="accent-[var(--accent-gold)] w-4 h-4"
              />
              <span className="text-sm text-[var(--text-secondary)]">{t("Private profile", lang)}</span>
            </label>
          </div>
        </section>
      )}

    </div>
  );
}
