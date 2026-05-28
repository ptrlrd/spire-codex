"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/app/contexts/AuthContext";
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
  const { toast } = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [runsLoading, setRunsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Claim Runs</h2>
        <RunDropZone onFiles={(files) => handleUpload(files)} uploading={uploading} />

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
    </div>
  );
}
