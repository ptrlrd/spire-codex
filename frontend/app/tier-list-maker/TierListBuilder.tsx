"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { toCanvas } from "html-to-image";

import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { Chip, SortableItem } from "./chip";
import { createTierList, saveTierListImage, updateTierList } from "./api";
import { fullCardUrl, CARD_RENDER_LANGS } from "@/lib/image-url";
import { LANG_NAMES } from "@/lib/languages";
import {
  GROUPS_BY_TYPE,
  RARITY_ORDER,
  ENTITY_LABEL,
  TIER_COLORS,
  TRAY_ID,
  defaultTiers,
  uid,
} from "./types";
import type { EntityType, Tier, TierEntity, TierList } from "./types";

type Containers = Record<string, string[]>;

// html-to-image renders a blank capture when the cloned styles contain oklch()
// colors. Tailwind v4's default palette (neutral/sky/emerald/...) is all oklch,
// and the serialized SVG fails to load, leaving only the background. Before
// snapshotting, rewrite every oklch() the capture resolves to into rasterized
// sRGB rgb() as an inline override; returns a function that reverts it after.
const OKLCH_PROPS = [
  "color",
  "backgroundColor",
  "backgroundImage",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "textDecorationColor",
  "boxShadow",
  "fill",
  "stroke",
] as const;

function inlineOklchAsRgb(root: HTMLElement): () => void {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return () => {};
  const cache = new Map<string, string>();
  const toRgb = (oklch: string): string => {
    const cached = cache.get(oklch);
    if (cached !== undefined) return cached;
    ctx.fillStyle = "#000";
    ctx.fillStyle = oklch; // canvas rasterizes any CSS color, incl. oklch
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const rgb = `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
    cache.set(oklch, rgb);
    return rgb;
  };
  const undo: Array<() => void> = [];
  const els = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of els) {
    const cs = getComputedStyle(el) as unknown as Record<string, string>;
    for (const prop of OKLCH_PROPS) {
      const val = cs[prop];
      if (typeof val === "string" && val.includes("oklch")) {
        const prev = (el.style as unknown as Record<string, string>)[prop];
        (el.style as unknown as Record<string, string>)[prop] = val.replace(
          /oklch\([^)]*\)/g,
          (m) => toRgb(m),
        );
        undo.push(() => {
          (el.style as unknown as Record<string, string>)[prop] = prev;
        });
      }
    }
  }
  return () => {
    for (const f of undo) f();
  };
}

// Synthetic tray filter that matches beta-only entities by their `beta` flag
// instead of their color/pool group, so beta content has a one-click pill.
const BETA_GROUP = "__beta__";

interface Props {
  entityType: EntityType;
  entities: TierEntity[];
  initial?: TierList;
}

/** Which container holds an item id (or the id itself if it's a container). */
function findIn(map: Containers, id: string): string | undefined {
  if (id in map) return id;
  return Object.keys(map).find((k) => map[k].includes(id));
}

// Languages offered by the card maker's language filter: English plus every
// language we have full card renders for, in the site's display order.
const CARD_LANG_OPTIONS: { code: string; label: string }[] = [
  { code: "eng", label: "English" },
  ...Object.entries(LANG_NAMES)
    .filter(([code]) => CARD_RENDER_LANGS.has(code))
    .map(([code, label]) => ({ code, label })),
];

export default function TierListBuilder({ entityType, entities, initial }: Props) {
  const router = useRouter();
  const { user, loading: authLoading, loginSteam } = useAuth();
  const { lang } = useLanguage();

  // Card maker only: render the card images in the chosen language. Other
  // entity types have no localized renders, so the selector is hidden.
  const [cardLang, setCardLang] = useState("eng");
  const displayEntities = useMemo(() => {
    if (entityType !== "cards" || cardLang === "eng") return entities;
    return entities.map((e) => ({
      ...e,
      image: fullCardUrl(e.id.toLowerCase(), false, "stable", cardLang),
    }));
  }, [entities, entityType, cardLang]);

  const entityMap = useMemo(() => {
    const m = new Map<string, TierEntity>();
    for (const e of displayEntities) m.set(e.id, e);
    return m;
  }, [displayEntities]);
  const allIds = useMemo(() => entities.map((e) => e.id), [entities]);

  // Tier metadata (label/color/order). Items live in `containers`.
  const [tierMeta, setTierMeta] = useState<Omit<Tier, "items">[]>(() => {
    if (initial) return initial.tiers.map((t) => ({ id: t.id, label: t.label, color: t.color }));
    return defaultTiers().map((t) => ({ id: t.id, label: t.label, color: t.color }));
  });

  const [containers, setContainers] = useState<Containers>(() => {
    const known = new Set(allIds);
    const next: Containers = {};
    const placed = new Set<string>();
    if (initial) {
      for (const t of initial.tiers) {
        next[t.id] = t.items.filter((id) => known.has(id));
        next[t.id].forEach((id) => placed.add(id));
      }
    } else {
      for (const t of tierMeta) next[t.id] = [];
    }
    // Tray = saved unranked (kept in order) plus any entity not placed
    // anywhere (covers new game content added since the list was saved).
    const trayFromSaved = (initial?.unranked ?? []).filter(
      (id) => known.has(id) && !placed.has(id),
    );
    trayFromSaved.forEach((id) => placed.add(id));
    const leftover = allIds.filter((id) => !placed.has(id));
    next[TRAY_ID] = [...trayFromSaved, ...leftover];
    return next;
  });

  const [title, setTitle] = useState(
    initial?.title ?? `My ${ENTITY_LABEL[entityType]} Tier List`,
  );
  const [search, setSearch] = useState("");
  // Cards is a huge pool (~576), so open on the Ironclad group rather than
  // rendering every chip up front — keeps first paint snappy. Other types
  // (and the All pill) are unaffected.
  const [groupFilter, setGroupFilter] = useState<string | null>(
    entityType === "cards" ? "ironclad" : null,
  );
  // Secondary tray filter: rarity (independent of the pool/character pills).
  const [rarityFilter, setRarityFilter] = useState<string>("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedShareId, setSavedShareId] = useState<string | undefined>(initial?.share_id);
  const savedIdRef = useRef<string | undefined>(initial?.id);
  // The branded region (tier rows + Spire Codex header) captured on export.
  const captureRef = useRef<HTMLDivElement | null>(null);

  // Per-item rationale notes. `commentFor` is the entity whose note editor is
  // open (null when closed); `commentDraft` is the in-progress text.
  const [comments, setComments] = useState<Record<string, string>>(
    initial?.comments ?? {},
  );
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  function openComment(id: string) {
    setCommentFor(id);
    setCommentDraft(comments[id] ?? "");
  }
  function saveComment() {
    if (!commentFor) return;
    const text = commentDraft.trim();
    setComments((c) => {
      const next = { ...c };
      if (text) next[commentFor] = text.slice(0, 500);
      else delete next[commentFor];
      return next;
    });
    setCommentFor(null);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Pointer-based detection: the row/tray under the cursor is the drop target.
  // closestCorners can't be used here: tier rows are full-width while the tray
  // holds hundreds of small same-sized chips, so corner distances always favor a
  // nearby tray chip over a wide empty row, making most rows impossible to drop
  // into. pointerWithin sidesteps size entirely; rectIntersection is the fallback
  // for the thin border gaps between rows where the pointer is inside no droppable.
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
  }, []);

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  // All container moves happen on drop, not on hover. Moving items between
  // containers inside onDragOver re-renders the board mid-drag, which shifts the
  // layout, which fires another onDragOver, which moves again -- an oscillation
  // that trips React's "maximum update depth" (#185) once the board is large.
  // The drag overlay already shows what's being dragged, so settling on drop
  // loses nothing visible and can't loop.
  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    setContainers((prev) => {
      const ac = findIn(prev, activeId);
      const oc = findIn(prev, overId);
      if (!ac || !oc) return prev;
      if (ac === oc) {
        // Reorder within the same container.
        const items = prev[ac];
        const oldIndex = items.indexOf(activeId);
        const newIndex =
          overId === oc ? items.length - 1 : items.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
        return { ...prev, [ac]: arrayMove(items, oldIndex, newIndex) };
      }
      // Move across containers, inserting at the drop position.
      const activeItems = prev[ac];
      const overItems = prev[oc];
      const insertAt =
        overId === oc ? overItems.length : Math.max(0, overItems.indexOf(overId));
      return {
        ...prev,
        [ac]: activeItems.filter((i) => i !== activeId),
        [oc]: [...overItems.slice(0, insertAt), activeId, ...overItems.slice(insertAt)],
      };
    });
  }

  // ── Tier row controls ────────────────────────────────────────────────
  function addTier() {
    const tier = { id: uid(), label: "New", color: TIER_COLORS[tierMeta.length % TIER_COLORS.length] };
    setTierMeta((m) => [...m, tier]);
    setContainers((c) => ({ ...c, [tier.id]: [] }));
  }

  function removeTier(id: string) {
    setContainers((c) => {
      const moved = c[id] ?? [];
      const tray = [...(c[TRAY_ID] ?? []), ...moved];
      const next: Containers = { ...c, [TRAY_ID]: tray };
      delete next[id];
      return next;
    });
    setTierMeta((m) => m.filter((t) => t.id !== id));
  }

  function renameTier(id: string, label: string) {
    setTierMeta((m) => m.map((t) => (t.id === id ? { ...t, label } : t)));
  }

  function recolorTier(id: string, color: string) {
    setTierMeta((m) => m.map((t) => (t.id === id ? { ...t, color } : t)));
  }

  function moveTier(id: string, dir: -1 | 1) {
    setTierMeta((m) => {
      const i = m.findIndex((t) => t.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= m.length) return m;
      return arrayMove(m, i, j);
    });
  }

  function clearTier(id: string) {
    setContainers((c) => ({
      ...c,
      [id]: [],
      [TRAY_ID]: [...(c[TRAY_ID] ?? []), ...(c[id] ?? [])],
    }));
  }

  // ── Save / share ─────────────────────────────────────────────────────
  function buildPayload() {
    return {
      title: title.trim() || `My ${ENTITY_LABEL[entityType]} Tier List`,
      entity_type: entityType,
      tiers: tierMeta.map((t) => ({ ...t, items: containers[t.id] ?? [] })),
      unranked: containers[TRAY_ID] ?? [],
      comments,
    };
  }

  async function handleSave() {
    if (!user) {
      loginSteam();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      let result: TierList;
      if (savedIdRef.current) {
        result = await updateTierList(savedIdRef.current, payload);
      } else {
        result = await createTierList(payload);
      }
      savedIdRef.current = result.id;
      setSavedShareId(result.share_id);
      // Refresh the share/OG preview in the background — best-effort, and it
      // doesn't interrupt editing.
      if (result.id) {
        const id = result.id;
        captureDataUrl(1)
          .then((url) => (url ? saveTierListImage(id, url) : undefined))
          .catch(() => {});
      }
      // Stay in the editor; canonical edit URL so reloads and later saves work.
      // The Share box surfaces the public /shared/ link to copy.
      if (result.id) router.replace(`/tier-list-maker/${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not save", lang));
    } finally {
      setSaving(false);
    }
  }

  // ── Export ───────────────────────────────────────────────────────────
  // Render the branded capture region to a PNG data URL. Shared by the
  // download button (2x, crisp) and the share-preview saved on save (1x).
  async function captureDataUrl(pixelRatio: number): Promise<string | null> {
    const node = captureRef.current;
    if (!node) return null;
    // React drives field values via the property, not the DOM, so the clone
    // html-to-image renders would lose them. Mirror each onto the DOM first so
    // the tier labels show in the export.
    node.querySelectorAll("input").forEach((el) => {
      el.setAttribute("value", (el as HTMLInputElement).value);
    });
    node.querySelectorAll("textarea").forEach((el) => {
      el.textContent = (el as HTMLTextAreaElement).value;
    });
    // Tailwind v4 colors resolve to oklch(), which makes html-to-image render a
    // blank image; swap them for rgb() for the duration of the capture.
    const restoreColors = inlineOklchAsRgb(node);
    // Match the export backdrop to the current theme's page background so the
    // rounded capture card sits seamlessly on it (light card on a dark square
    // otherwise looked wrong in light mode).
    const pageBg =
      getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim() ||
      "#0a0a0a";
    try {
      const canvas = await toCanvas(node, {
        pixelRatio,
        backgroundColor: pageBg,
        // cacheBust forces a fresh CORS fetch of the CDN art (cached copies
        // were loaded without an Origin header and would taint the canvas).
        cacheBust: true,
        // Drop the per-row "edit" controls / popovers from the image.
        filter: (n) => !(n instanceof HTMLElement && n.dataset.exportHide === "true"),
      });
      // webp is smaller/faster than png and is what we store on the CDN.
      return canvas.toDataURL("image/webp", 0.92);
    } finally {
      restoreColors();
    }
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const dataUrl = await captureDataUrl(2);
      if (!dataUrl) return;
      const slug =
        (title.trim() || `${ENTITY_LABEL[entityType]} tier list`)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "tier-list";
      const a = document.createElement("a");
      a.download = `${slug}.webp`;
      a.href = dataUrl;
      a.click();
    } catch {
      setError(t("Could not export the image. Try again.", lang));
    } finally {
      setExporting(false);
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────
  function resetBoard() {
    if (!window.confirm(t("Reset the board? Every item goes back to the tray.", lang))) {
      return;
    }
    setContainers(() => {
      const next: Containers = {};
      for (const t of tierMeta) next[t.id] = [];
      next[TRAY_ID] = [...allIds];
      return next;
    });
  }

  const shareUrl =
    savedShareId && typeof window !== "undefined"
      ? `${window.location.origin}/tier-list-maker/shared/${savedShareId}`
      : "";

  const activeEntity = activeId ? entityMap.get(activeId) : undefined;

  const trayItems = containers[TRAY_ID] ?? [];

  // Per-character (color) counts of what's still in the tray, used for the
  // filter pills. Only meaningful for cards; other types carry no group.
  const groupCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const id of trayItems) {
      const e = entityMap.get(id);
      if (!e) continue;
      if (e.group) m[e.group] = (m[e.group] ?? 0) + 1;
      // The Beta pill matches on the beta flag, not a group key, so tally it
      // separately or its count would always read 0.
      if (e.beta) m[BETA_GROUP] = (m[BETA_GROUP] ?? 0) + 1;
    }
    return m;
  }, [trayItems, entityMap]);

  // The filter pills to show: every group defined for this entity type
  // (cards by character, relics by pool/ancient) that actually exists in
  // the loaded pool, so we never render an empty pill.
  const trayGroups = useMemo(() => {
    const defs = GROUPS_BY_TYPE[entityType] ?? [];
    const present = defs.filter((g) => entities.some((e) => e.group === g.value));
    // Lead with a Beta pill whenever the pool has beta-only entities, so the
    // new content is one click away no matter how it groups by color or pool.
    return entities.some((e) => e.beta)
      ? [{ value: BETA_GROUP, label: "Beta" }, ...present]
      : present;
  }, [entities, entityType]);

  // Rarities present in this pool, in canonical order, for the rarity
  // dropdown. Only shown when the loaded entities actually carry rarities.
  const rarityOptions = useMemo(() => {
    const present = new Set<string>();
    for (const e of entities) if (e.rarity) present.add(e.rarity);
    return [...present].sort((a, b) => {
      const ia = RARITY_ORDER.indexOf(a);
      const ib = RARITY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
  }, [entities]);

  const filteredTray = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trayItems.filter((id) => {
      const e = entityMap.get(id);
      if (!e) return false;
      if (groupFilter === BETA_GROUP) {
        if (!e.beta) return false;
      } else if (groupFilter && e.group !== groupFilter) return false;
      if (rarityFilter && e.rarity !== rarityFilter) return false;
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [trayItems, search, groupFilter, rarityFilter, entityMap]);

  return (
    <div className="mx-auto max-w-[1800px] px-4 sm:px-6 py-6">
      <Link
        href="/tier-list-maker"
        className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span aria-hidden>←</span> {t("Back to tier lists", lang)}
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 min-w-[200px] rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-lg font-semibold text-[var(--text-primary)] outline-none focus:border-sky-500"
          placeholder={t("Tier list name", lang)}
          aria-label={t("Tier list name", lang)}
        />
        <button
          onClick={resetBoard}
          className="rounded border border-[var(--border-accent)] px-4 py-2 font-semibold text-[var(--text-primary)] hover:border-red-500 hover:text-[var(--text-primary)]"
        >
          {t("Reset", lang)}
        </button>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded border border-[var(--border-accent)] px-4 py-2 font-semibold text-[var(--text-primary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {exporting ? t("Exporting…", lang) : t("Export image", lang)}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || authLoading}
          className="rounded bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {saving ? t("Saving…", lang) : user ? t("Save", lang) : t("Sign in with Steam to save", lang)}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {shareUrl && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2">
          <span className="text-sm text-[var(--text-secondary)]">{t("Share:", lang)}</span>
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-[200px] rounded bg-[var(--bg-secondary)] px-2 py-1 text-sm text-[var(--text-primary)]"
          />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className={`rounded px-3 py-1 text-sm text-[var(--text-primary)] ${
              copied ? "bg-green-600" : "bg-[var(--bg-card-hover)] hover:bg-[var(--border-accent)]"
            }`}
          >
            {copied ? t("Copied!", lang) : t("Copy", lang)}
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div
          ref={captureRef}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] [&>*:first-child]:rounded-t-lg [&>*:last-child]:rounded-b-lg"
        >
          {/* Branding header — shown in the editor and baked into the export. */}
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-3 py-2">
            <span className="truncate text-base font-bold text-[var(--text-primary)]">
              {title.trim() || `My ${ENTITY_LABEL[entityType]} Tier List`}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icon-512.png"
                alt=""
                width={22}
                height={22}
                className="h-[22px] w-[22px] rounded"
              />
              <div className="leading-tight">
                <div className="text-sm font-semibold text-[var(--text-primary)]">Spire Codex</div>
                <div className="text-[10px] text-[var(--text-secondary)]">spire-codex.com</div>
              </div>
            </div>
          </div>
          {tierMeta.map((tier, idx) => (
            <TierRow
              key={tier.id}
              tier={tier}
              itemIds={containers[tier.id] ?? []}
              entityMap={entityMap}
              isFirst={idx === 0}
              isLast={idx === tierMeta.length - 1}
              onRename={renameTier}
              onRecolor={recolorTier}
              onRemove={removeTier}
              onMove={moveTier}
              onClear={clearTier}
              comments={comments}
              onItemClick={openComment}
            />
          ))}
        </div>

        <button
          onClick={addTier}
          className="mt-2 rounded border border-dashed border-[var(--border-accent)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)]"
        >
          + {t("Add tier", lang)}
        </button>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              {ENTITY_LABEL[entityType]} ({filteredTray.length})
            </h2>
            <div className="flex items-center gap-2">
              {entityType === "cards" && (
                <select
                  value={cardLang}
                  onChange={(e) => setCardLang(e.target.value)}
                  className="rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none focus:border-sky-500"
                  aria-label={t("Card language", lang)}
                  title={t("Render the cards in this language", lang)}
                >
                  {CARD_LANG_OPTIONS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              )}
              {rarityOptions.length > 0 && (
                <select
                  value={rarityFilter}
                  onChange={(e) => setRarityFilter(e.target.value)}
                  className="rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none focus:border-sky-500"
                  aria-label={t("Filter by rarity", lang)}
                >
                  <option value="">{t("All rarities", lang)}</option>
                  {rarityOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search…", lang)}
                className="w-40 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none focus:border-sky-500"
              />
            </div>
          </div>
          {trayGroups.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              <GroupPill
                label={t("All", lang)}
                count={trayItems.length}
                active={groupFilter === null}
                onClick={() => setGroupFilter(null)}
              />
              {trayGroups.map((g) => (
                <GroupPill
                  key={g.value}
                  label={g.label}
                  count={groupCounts[g.value] ?? 0}
                  active={groupFilter === g.value}
                  onClick={() =>
                    setGroupFilter((cur) => (cur === g.value ? null : g.value))
                  }
                />
              ))}
            </div>
          )}
          <DropArea
            id={TRAY_ID}
            className="flex min-h-[80px] flex-wrap content-start gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-2"
          >
            <SortableContext items={filteredTray} strategy={rectSortingStrategy}>
              {filteredTray.map((id) => {
                const e = entityMap.get(id);
                return e ? (
                  <SortableItem
                    key={id}
                    entity={e}
                    hasComment={!!comments[id]}
                    commentText={comments[id]}
                    onClick={() => openComment(id)}
                  />
                ) : null;
              })}
            </SortableContext>
          </DropArea>
        </div>

        <DragOverlay>
          {activeEntity ? <Chip entity={activeEntity} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {commentFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setCommentFor(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              {entityMap.get(commentFor)?.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entityMap.get(commentFor)!.image}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded bg-[var(--bg-secondary)] object-contain"
                />
              )}
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {entityMap.get(commentFor)?.name ?? commentFor}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">{t("Note / rationale", lang)}</div>
              </div>
            </div>
            <textarea
              autoFocus
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder={t("Why is it ranked here?", lang)}
              className="w-full resize-none rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-sky-500"
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--text-muted)]">{commentDraft.length}/500</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCommentFor(null)}
                  className="rounded px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {t("Cancel", lang)}
                </button>
                <button
                  onClick={saveComment}
                  className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
                >
                  {commentDraft.trim() ? t("Save note", lang) : t("Remove note", lang)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One character/pool filter chip above the tray. */
function GroupPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-sky-500 bg-sky-600 text-white"
          : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label} <span className="opacity-70">({count})</span>
    </button>
  );
}

function DropArea({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className ?? ""} ${isOver ? "ring-2 ring-sky-400" : ""}`}>
      {children}
    </div>
  );
}

function TierRow({
  tier,
  itemIds,
  entityMap,
  isFirst,
  isLast,
  onRename,
  onRecolor,
  onRemove,
  onMove,
  onClear,
  comments,
  onItemClick,
}: {
  tier: Omit<Tier, "items">;
  itemIds: string[];
  entityMap: Map<string, TierEntity>;
  isFirst: boolean;
  isLast: boolean;
  onRename: (id: string, label: string) => void;
  onRecolor: (id: string, color: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onClear: (id: string) => void;
  comments: Record<string, string>;
  onItemClick: (id: string) => void;
}) {
  const { lang } = useLanguage();
  const [editing, setEditing] = useState(false);
  // Local draft for the hex field so typing a partial value (e.g. "#ff") isn't
  // fought by the controlled prop; commits to the tier only when it's valid.
  const [hexDraft, setHexDraft] = useState(tier.color);
  useEffect(() => setHexDraft(tier.color), [tier.color]);

  // Auto-grow the label so multi-line labels (Shift+Enter) show in full
  // instead of being clipped in the narrow label column.
  const labelRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = labelRef.current;
    if (el) {
      el.style.height = "0px";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [tier.label]);

  // Close the row editor on Escape (the X button covers the click path).
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  return (
    <div className="flex items-stretch border-b border-[var(--border-subtle)] last:border-b-0">
      <div
        style={{ background: tier.color }}
        className="relative flex w-20 shrink-0 flex-col items-center justify-center gap-1 p-1 text-black"
      >
        <textarea
          ref={labelRef}
          value={tier.label}
          onChange={(e) => onRename(tier.id, e.target.value)}
          onKeyDown={(e) => {
            // Enter commits (blur); Shift+Enter inserts a line break.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          rows={1}
          spellCheck={false}
          className="w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent text-center text-lg font-bold leading-tight outline-none"
          aria-label={t("Tier label", lang)}
        />
        <button
          data-export-hide="true"
          onClick={() => setEditing((v) => !v)}
          className="text-[10px] underline opacity-70 hover:opacity-100"
        >
          {t("edit", lang)}
        </button>
        {editing && (
          <div
            data-export-hide="true"
            className="absolute left-0 top-full z-10 mt-1 w-44 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2 text-[var(--text-primary)] shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                {t("Edit row", lang)}
              </span>
              <button
                onClick={() => setEditing(false)}
                aria-label={t("Close editor", lang)}
                className="-mr-1 -mt-1 rounded px-1.5 text-sm leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {TIER_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onRecolor(tier.id, c)}
                  style={{ background: c }}
                  className={`h-5 w-5 rounded ${tier.color === c ? "ring-2 ring-[var(--accent-gold)]" : ""}`}
                  aria-label={`${t("Color", lang)} ${c}`}
                />
              ))}
            </div>
            {/* Custom color — pick a swatch or type a hex if the presets
                don't fit. */}
            <div className="mb-2 flex items-center gap-1.5 border-t border-[var(--border-subtle)] pt-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(tier.color) ? tier.color : "#cccccc"}
                onChange={(e) => onRecolor(tier.id, e.target.value)}
                className="h-6 w-7 shrink-0 cursor-pointer rounded border border-[var(--border-accent)] bg-transparent p-0"
                aria-label={t("Pick a custom color", lang)}
              />
              <input
                type="text"
                value={hexDraft}
                onChange={(e) => {
                  const v = e.target.value;
                  setHexDraft(v);
                  if (/^#[0-9a-fA-F]{6}$/.test(v.trim())) onRecolor(tier.id, v.trim());
                }}
                placeholder="#rrggbb"
                spellCheck={false}
                className="w-full rounded border border-[var(--border-accent)] bg-[var(--bg-secondary)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none focus:border-sky-500"
                aria-label={t("Hex color", lang)}
              />
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              <button onClick={() => onMove(tier.id, -1)} disabled={isFirst} className="rounded bg-[var(--bg-card-hover)] px-2 py-1 disabled:opacity-40">↑</button>
              <button onClick={() => onMove(tier.id, 1)} disabled={isLast} className="rounded bg-[var(--bg-card-hover)] px-2 py-1 disabled:opacity-40">↓</button>
              <button onClick={() => onClear(tier.id)} className="rounded bg-[var(--bg-card-hover)] px-2 py-1">{t("Clear", lang)}</button>
              <button onClick={() => onRemove(tier.id)} className="rounded bg-red-700 px-2 py-1">{t("Delete", lang)}</button>
            </div>
          </div>
        )}
      </div>
      <DropArea
        id={tier.id}
        className="flex min-h-[64px] flex-1 flex-wrap content-start gap-1 bg-[var(--bg-primary)] p-1.5"
      >
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          {itemIds.map((id) => {
            const e = entityMap.get(id);
            return e ? (
              <SortableItem
                key={id}
                entity={e}
                hasComment={!!comments[id]}
                commentText={comments[id]}
                onClick={() => onItemClick(id)}
              />
            ) : null;
          })}
        </SortableContext>
      </DropArea>
    </div>
  );
}
