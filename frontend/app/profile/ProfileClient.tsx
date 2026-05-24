"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/app/contexts/AuthContext";
import { useToast } from "@/app/components/Toast";

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

const CHARACTER_COLORS: Record<string, string> = {
  IRONCLAD: "#d53b27",
  SILENT: "#23935b",
  DEFECT: "#3873a9",
  NECROBINDER: "#bf5a85",
  REGENT: "#f07c1e",
};

export default function ProfileClient() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [runsLoading, setRunsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
      toast("Failed to load runs", "error");
    } finally {
      setRunsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) fetchRuns(page);
  }, [user, page, fetchRuns]);

  const handleUpload = async (files: FileList | File[]) => {
    if (!files.length) return;
    setUploading(true);
    setUploadResults(null);

    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));

    try {
      const res = await fetch(`${API_BASE}/api/auth/runs/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setUploadResults(data.results);
        const s = data.summary;
        toast(
          `${s.claimed} claimed, ${s.duplicates} duplicates, ${s.errors} errors`,
          s.errors > 0 ? "error" : "success"
        );
        fetchRuns(1);
        setPage(1);
      } else if (res.status === 401) {
        toast("Please sign in to upload runs", "error");
      } else if (res.status === 413) {
        toast("Too many files or file too large", "error");
      } else {
        const err = await res.json().catch(() => null);
        toast(err?.detail || "Upload failed", "error");
      }
    } catch {
      toast("Network error during upload", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (runHash: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/runs/${runHash}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast("Run removed from your profile", "success");
        setRuns((prev) => prev.filter((r) => r.run_hash !== runHash));
        setTotal((prev) => prev - 1);
      } else if (res.status === 403) {
        toast("You do not own this run", "error");
      } else if (res.status === 404) {
        toast("Run not found", "error");
      } else {
        toast("Failed to delete run", "error");
      }
    } catch {
      toast("Network error", "error");
    } finally {
      setDeleteConfirm(null);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files);
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
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-4">Sign in to view your profile</h1>
        <p className="text-[var(--text-secondary)]">Connect your Steam or Discord account to see your runs and stats.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        {user.username ? `${user.username}'s Profile` : "Your Profile"}
      </h1>

      {/* Upload section */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Claim Runs</h2>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 sm:p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-[var(--border-accent)] bg-[var(--border-accent)]/5"
              : "border-[var(--border-subtle)] hover:border-[var(--border-accent)]"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".run,.json"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleUpload(e.target.files);
              e.target.value = "";
            }}
          />
          {uploading ? (
            <p className="text-[var(--text-secondary)]">Uploading...</p>
          ) : (
            <>
              <p className="text-[var(--text-primary)] font-medium mb-1">
                Drop .run files here or click to browse
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">
                Windows: %APPDATA%/SlayTheSpire2/runs/ &middot; Mac: ~/Library/Application Support/SlayTheSpire2/runs/
              </p>
            </>
          )}
        </div>

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

      {/* Runs list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            My Runs {total > 0 && <span className="text-sm font-normal text-[var(--text-tertiary)]">({total})</span>}
          </h2>
        </div>

        {runsLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-[var(--bg-card)] rounded animate-pulse" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-secondary)]">
            <p>No runs yet. Submit runs from the Spire Compendium app or upload .run files above.</p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {runs.map((run) => (
                <div
                  key={run.run_hash}
                  className="flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm"
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
                  <span className="flex-1" />
                  <Link
                    href={`/runs/${run.run_hash}`}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                  >
                    View
                  </Link>
                  {deleteConfirm === run.run_hash ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleDelete(run.run_hash)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="text-xs text-[var(--text-tertiary)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(run.run_hash)}
                      className="text-xs text-[var(--text-tertiary)] hover:text-red-400 transition-colors shrink-0"
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm rounded border border-[var(--border-subtle)] disabled:opacity-30"
                >
                  Prev
                </button>
                <span className="text-sm text-[var(--text-tertiary)]">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm rounded border border-[var(--border-subtle)] disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
