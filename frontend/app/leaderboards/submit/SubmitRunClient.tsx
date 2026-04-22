"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { IS_BETA } from "@/lib/seo";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function SubmitRunClient() {
  const router = useRouter();
  const lp = useLangPrefix();
  const { lang } = useLanguage();
  const [jsonInput, setJsonInput] = useState("");
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{
    total: number;
    done: number;
    dupes: number;
    errors: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Belt-and-suspenders against any source of double-fire on the upload
  // path (the dropzone-vs-document race the native stopImmediatePropagation
  // kills above, plus button double-click, retry, etc.). A ref instead of
  // useState so the guard sees the latest value without waiting for a
  // re-render — back-to-back drops fire the second handler before React
  // commits any state from the first.
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

  function parseRun() {
    setError("");
    try {
      const data = JSON.parse(jsonInput);
      if (!data.players || !data.map_point_history || !Array.isArray(data.acts)) {
        setError(
          t("submit_invalid_run", lang)
        );
        return;
      }
      // Submit and redirect
      const submitUrl = username.trim()
        ? `${API}/api/runs?username=${encodeURIComponent(username.trim())}`
        : `${API}/api/runs`;
      fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonInput,
      })
        .then((r) => r.json().catch(() => null))
        .then((d) => {
          if (d?.run_hash) {
            router.push(`${lp}/runs/${d.run_hash}`);
          }
        })
        .catch(() => {});
    } catch {
      setError(
        "Invalid JSON. Make sure you pasted the full contents of the .run file."
      );
    }
  }

  // Drag-and-drop handlers for the upload area
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // The page-level `document.addEventListener("drop", …)` below also
      // calls handleFileUpload so drops anywhere on the page are captured.
      // React's `e.stopPropagation()` only stops further synthetic handlers
      // — the underlying native event still bubbles past React's root to
      // the document listener, which fires handleFileUpload a second time.
      // Each file then gets POSTed twice: the first request inserts, the
      // second comes back marked `duplicate`, and the UI shows "0 submitted,
      // 2 skipped" for what was actually a clean two-file upload.
      e.nativeEvent.stopImmediatePropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files);
      }
    },
    [handleFileUpload]
  );

  // Page-level drop handling so drops work anywhere on the page
  useEffect(() => {
    const handleDocDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleDocDrop = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files);
      }
    };
    document.addEventListener("dragover", handleDocDragOver);
    document.addEventListener("drop", handleDocDrop);
    return () => {
      document.removeEventListener("dragover", handleDocDragOver);
      document.removeEventListener("drop", handleDocDrop);
    };
  }, [handleFileUpload]);

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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t("Submit a Run", lang)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("submit_tagline", lang)}
      </p>

      <div className="space-y-4">
        {/* Username */}
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.slice(0, 25))}
          placeholder={t("Username (optional)", lang)}
          maxLength={25}
          className="px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-gold)] w-48"
        />

        {/* File Upload with drag-and-drop */}
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`bg-[var(--bg-card)] rounded-xl p-6 text-center transition-colors ${
            isDragging
              ? "border-2 border-solid border-[var(--accent-gold)] bg-[var(--accent-gold)]/5"
              : "border border-dashed border-[var(--border-accent)]"
          }`}
        >
          <p className="text-sm text-[var(--text-secondary)] mb-1">
            {isDragging
              ? t("Drop files here...", lang)
              : t("Drag & drop .run files here, or click to select", lang)}
          </p>
          <div className="text-left mb-3 space-y-1 text-xs text-[var(--text-muted)]">
            <p>
              <strong className="text-[var(--text-secondary)]">Windows:</strong>{" "}
              <code className="bg-[var(--bg-primary)] px-1 rounded">
                %AppData%/SlayTheSpire2/steam/&lt;steamid&gt;/profile1/saves/history
              </code>
            </p>
            <p>
              <strong className="text-[var(--text-secondary)]">macOS:</strong>{" "}
              <code className="bg-[var(--bg-primary)] px-1 rounded">
                ~/Library/Application
                Support/SlayTheSpire2/steam/&lt;steamid&gt;/profile1/saves/history
              </code>
            </p>
            <p>
              <strong className="text-[var(--text-secondary)]">
                Linux / Steam Deck:
              </strong>{" "}
              <code className="bg-[var(--bg-primary)] px-1 rounded">
                ~/.local/share/SlayTheSpire2/steam/&lt;steamid&gt;/profile1/saves/history
              </code>
            </p>
          </div>
          <label className="inline-block px-5 py-2 rounded-lg text-sm font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity cursor-pointer">
            {t("Choose Files", lang)}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".run,.json"
              className="hidden"
              onChange={(e) =>
                e.target.files && handleFileUpload(e.target.files)
              }
            />
          </label>
          {uploadProgress && (
            <div className="mt-4">
              <div className="w-full bg-[var(--bg-primary)] rounded-full h-2 mb-2">
                <div
                  className="h-2 rounded-full bg-[var(--accent-gold)] transition-all"
                  style={{
                    width: `${(uploadProgress.done / uploadProgress.total) * 100}%`,
                  }}
                />
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                {uploadProgress.done === uploadProgress.total ? (
                  <>
                    {t("Done!", lang)}{" "}
                    {uploadProgress.total -
                      uploadProgress.dupes -
                      uploadProgress.errors}{" "}
                    {t("submitted", lang)}
                    {uploadProgress.dupes > 0 && (
                      <>, {uploadProgress.dupes} {t("duplicates skipped", lang)}</>
                    )}
                    {uploadProgress.errors > 0 && (
                      <>, {uploadProgress.errors} {t("invalid", lang)}</>
                    )}
                  </>
                ) : (
                  <>
                    {t("Processing", lang)} {uploadProgress.done} {t("of", lang)}{" "}
                    {uploadProgress.total}...
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Or paste JSON */}
        <div className="relative">
          <div className="absolute inset-x-0 top-0 flex items-center justify-center -mt-2">
            <span className="bg-[var(--bg-primary)] px-3 text-xs text-[var(--text-muted)]">
              {t("or paste JSON", lang)}
            </span>
          </div>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder='{"acts":["ACT.OVERGROWTH"...],"ascension":0,...}'
            rows={6}
            className="w-full px-4 py-3 pt-5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:border-[var(--accent-gold)] resize-none"
          />
          <button
            onClick={parseRun}
            disabled={!jsonInput.trim()}
            className="mt-2 px-5 py-2 rounded-lg text-sm font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {t("Analyze Run", lang)}
          </button>
        </div>

        {error && (
          <p className="text-[var(--color-ironclad)] text-sm">{error}</p>
        )}
      </div>
    </div>
  );
}
