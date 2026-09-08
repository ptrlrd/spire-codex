"use client";

import { useState, useEffect } from "react";
import { imageUrl } from "@/lib/image-url";
import { useT } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Folders above this ship no zip button; the backend enforces the same cap.
const ZIP_MAX_FILES = 2000;

interface ImageEntry {
  filename: string;
  url: string;
}

interface Category {
  id: string;
  name: string;
  count: number;
  images: ImageEntry[];
  // `images` is only a preview; the contents page through /browse.
  browse: { version: string; category: string };
}

interface BrowsePage {
  path: string;
  folders: string[];
  total: number;
  offset: number;
  limit: number;
  images: ImageEntry[];
}

function ImageTile({ img }: { img: ImageEntry }) {
  const label = img.filename.replace(/\.(png|webp|gif|jpe?g)$/i, "").replace(/_/g, " ");
  return (
    <div className="group rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-accent)] transition-all overflow-hidden">
      <div className="flex items-center justify-center p-2">
        <img
          src={imageUrl(img.url)}
          alt={label}
          crossOrigin="anonymous"
          loading="lazy"
          className="max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
        />
      </div>
      <div className="px-1.5 pb-1.5 text-center">
        <span className="text-[10px] text-[var(--text-muted)] truncate block" title={img.filename}>
          {label}
        </span>
      </div>
    </div>
  );
}

// Folder-aware pager for the dump categories: the contents live on the CDN
// and page through /api/images/game/<version>/<category>/browse, so even the
// six-figure card cross-product trees stay navigable. Each folder within the
// zip cap gets a download button for its own files.
function GameBrowser({ version, category }: { version: string; category: string }) {
  const t = useT();
  const [path, setPath] = useState("");
  const [page, setPage] = useState<BrowsePage | null>(null);
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setImages([]);
    fetch(
      `${API}/api/images/game/${version}/${category}/browse?path=${encodeURIComponent(path)}&offset=0&limit=200`
    )
      .then((r) => r.json())
      .then((data: BrowsePage) => {
        setPage(data);
        setImages(data.images ?? []);
      })
      .finally(() => setLoading(false));
  }, [version, category, path]);

  function loadMore() {
    if (!page) return;
    setLoading(true);
    fetch(
      `${API}/api/images/game/${version}/${category}/browse?path=${encodeURIComponent(path)}&offset=${images.length}&limit=200`
    )
      .then((r) => r.json())
      .then((data: BrowsePage) => setImages((prev) => [...prev, ...(data.images ?? [])]))
      .finally(() => setLoading(false));
  }

  const crumbs = path ? path.split("/") : [];
  const canZip = page != null && page.total > 0 && page.total <= ZIP_MAX_FILES;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
        <button
          type="button"
          onClick={() => setPath("")}
          className={`px-2 py-0.5 rounded ${path === "" ? "text-[var(--accent-gold)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
        >
          {category}
        </button>
        {crumbs.map((seg, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="text-[var(--text-muted)]">/</span>
            <button
              type="button"
              onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))}
              className={`px-1 py-0.5 rounded ${i === crumbs.length - 1 ? "text-[var(--accent-gold)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              {seg}
            </button>
          </span>
        ))}
        {page && (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-[var(--text-muted)]">
              {t("{n} files", { n: page.total })}
              {page.folders.length > 0 ? `, ${t("{n} folders", { n: page.folders.length })}` : ""}
            </span>
            {canZip && (
              <a
                href={`${API}/api/images/game/${version}/${category}/download?path=${encodeURIComponent(path)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
                </svg>
                {t("Download ZIP")}
              </a>
            )}
          </span>
        )}
      </div>

      {page && page.folders.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {page.folders.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setPath(path ? `${path}/${f}` : f)}
              className="px-2.5 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-xs text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)] transition-colors"
            >
              {f}/
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {images.map((img) => (
          <ImageTile key={img.url} img={img} />
        ))}
      </div>

      {loading && <div className="text-center py-4 text-xs text-[var(--text-muted)]">{t("Loading...")}</div>}
      {!loading && page && images.length < page.total && (
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={loadMore}
            className="px-4 py-1.5 rounded-full text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50 hover:text-[var(--text-primary)] transition-colors"
          >
            {t("Load more ({shown} of {total})", { shown: images.length, total: page.total })}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ImagesPage() {
  const t = useT();
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
        <span className="text-[var(--accent-gold)]">{t("Images")}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        {t("The game's complete asset dumps, straight from the engine: the main patch and the current Steam beta side by side. Click a category to browse its folders, or grab any folder as a zip.")}
      </p>

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">{t("Loading...")}</div>
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
                      {t("{n} images", { n: cat.count })}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    {cat.browse.version}
                  </span>
                </div>

                {isOpen && (
                  <div className="border-t border-[var(--border-subtle)] px-4 pb-4 pt-3">
                    <GameBrowser version={cat.browse.version} category={cat.browse.category} />
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
