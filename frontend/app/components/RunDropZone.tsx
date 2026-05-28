"use client";

import { useState, useRef, useCallback } from "react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import RunFileHelp from "./RunFileHelp";

interface UploadProgress {
  total: number;
  done: number;
  dupes: number;
  errors: number;
}

interface RunDropZoneProps {
  onFiles: (files: FileList) => void;
  uploading?: boolean;
  uploadProgress?: UploadProgress | null;
}

export default function RunDropZone({ onFiles, uploading, uploadProgress }: RunDropZoneProps) {
  const { lang } = useLanguage();
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
  }, [onFiles]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-6 sm:p-8 text-center cursor-pointer transition-colors ${
        isDragging
          ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/5"
          : "border-[var(--border-subtle)] hover:border-[var(--border-accent)]"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".run,.json"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {uploading ? (
        <p className="text-[var(--text-secondary)]">Uploading...</p>
      ) : isDragging ? (
        <p className="text-[var(--text-primary)] font-medium">
          {t("Drop files here...", lang)}
        </p>
      ) : (
        <p className="text-[var(--text-primary)] font-medium mb-3">
          Drop .run files here or click to browse
        </p>
      )}

      {!isDragging && !uploading && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-2 sm:gap-3" onClick={(e) => e.stopPropagation()}>
          <a
            href="https://www.overwolf.com/app/ptrlrd-spire_codex"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-full sm:w-auto px-5 py-2.5 sm:py-2 rounded-lg text-sm font-medium bg-[var(--accent-gold)] text-white hover:opacity-90 transition-opacity"
          >
            Download Overwolf Companion App
          </a>
          <label className="inline-flex items-center justify-center w-full sm:w-auto px-5 py-2.5 sm:py-2 rounded-lg text-sm font-medium bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-accent)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer">
            {t("Choose Files", lang)}
            <input
              type="file"
              multiple
              accept=".run,.json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}

      {uploadProgress && (
        <div className="mt-4">
          <div className="w-full bg-[var(--bg-primary)] rounded-full h-2 mb-2">
            <div
              className="h-2 rounded-full bg-[var(--accent-gold)] transition-all"
              style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {uploadProgress.done === uploadProgress.total ? (
              <>
                {t("Done!", lang)}{" "}
                {uploadProgress.total - uploadProgress.dupes - uploadProgress.errors}{" "}
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

      <hr className="border-[var(--border-subtle)] my-4" />
      <RunFileHelp />
    </div>
  );
}
