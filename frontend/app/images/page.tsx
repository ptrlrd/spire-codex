"use client";

import { useState, useEffect, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ImageEntry {
  filename: string;
  url: string;
}

interface Category {
  id: string;
  name: string;
  count: number;
  images: ImageEntry[];
  formats?: string[];
}

const FORMAT_LABELS: Record<string, string> = {
  png: "PNG",
  webp: "WebP",
  gif: "GIF",
  jpg: "JPG",
  jpeg: "JPEG",
};

function DownloadSplitButton({ categoryId, formats }: { categoryId: string; formats: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [open]);

  const hasMultipleFormats = formats.length > 1;
  const downloadUrl = `${API}/api/images/${categoryId}/download`;

  return (
    <div ref={ref} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <a
        href={downloadUrl}
        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity ${
          hasMultipleFormats ? "rounded-l-full" : "rounded-full"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
        </svg>
        Download ZIP
      </a>
      {hasMultipleFormats && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setOpen((v) => !v);
            }}
            aria-haspopup="true"
            aria-expanded={open}
            aria-label="Choose download format"
            className="inline-flex items-center px-2 py-1 rounded-r-full text-xs font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity border-l border-[var(--bg-primary)]/20"
          >
            <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 z-10 min-w-[140px] rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-lg py-1">
              {formats.map((ext) => (
                <a
                  key={ext}
                  href={`${downloadUrl}?format=${ext}`}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  {FORMAT_LABELS[ext] ?? ext.toUpperCase()} only
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ImagesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/images`)
      .then((r) => r.json())
      .then((data: Category[]) => setCategories(data))
      .finally(() => setLoading(false));
  }, []);

  function toggleCategory(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Images</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        Browse and download game assets. Click a category to view, or download as a zip pack.
      </p>

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const isOpen = expanded.has(cat.id);
            return (
              <div
                key={cat.id}
                className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] overflow-hidden"
              >
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
                  onClick={() => toggleCategory(cat.id)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block transition-transform text-[var(--text-muted)] text-xs ${isOpen ? "rotate-90" : ""}`}
                    >
                      &gt;
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {cat.name}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {cat.count} images
                    </span>
                  </div>

                  <DownloadSplitButton
                    categoryId={cat.id}
                    formats={
                      cat.formats ??
                      Array.from(
                        new Set(
                          cat.images
                            .map((img) => img.filename.split(".").pop()?.toLowerCase())
                            .filter((ext): ext is string => Boolean(ext))
                        )
                      ).sort()
                    }
                  />
                </div>

                {isOpen && (
                  <div className="border-t border-[var(--border-subtle)] px-4 pb-4 pt-3">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                      {cat.images.map((img) => (
                        <div
                          key={img.filename}
                          className="group rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-accent)] transition-all overflow-hidden"
                        >
                          <div className="flex items-center justify-center p-2">
                            <img
                              src={`${API}${img.url}`}
                              alt={img.filename.replace(/\.(png|webp|gif|jpe?g)$/i, "").replace(/_/g, " ")}
                              crossOrigin="anonymous"
                              loading="lazy"
                              className="max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                          <div className="px-1.5 pb-1.5 text-center">
                            <span className="text-[10px] text-[var(--text-muted)] truncate block" title={img.filename}>
                              {img.filename.replace(/\.(png|webp|gif|jpe?g)$/i, "").replace(/_/g, " ")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
