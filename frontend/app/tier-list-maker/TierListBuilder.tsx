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
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { toCanvas } from "html-to-image";

import { useAuth } from "../contexts/AuthContext";
import { Chip, SortableItem } from "./chip";
import { createTierList, saveTierListImage, updateTierList } from "./api";
import {
  CARD_GROUPS,
  ENTITY_LABEL,
  TIER_COLORS,
  TRAY_ID,
  defaultTiers,
  uid,
} from "./types";
import type { EntityType, Tier, TierEntity, TierList } from "./types";

type Containers = Record<string, string[]>;

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

export default function TierListBuilder({ entityType, entities, initial }: Props) {
  const router = useRouter();
  const { user, loading: authLoading, loginSteam } = useAuth();

  const entityMap = useMemo(() => {
    const m = new Map<string, TierEntity>();
    for (const e of entities) m.set(e.id, e);
    return m;
  }, [entities]);
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

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    setContainers((prev) => {
      const ac = findIn(prev, activeId);
      const oc = findIn(prev, overId);
      if (!ac || !oc || ac === oc) return prev;
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

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    setContainers((prev) => {
      const ac = findIn(prev, activeId);
      const oc = findIn(prev, overId);
      if (!ac || !oc || ac !== oc) return prev;
      const items = prev[ac];
      const oldIndex = items.indexOf(activeId);
      const newIndex = overId === oc ? items.length - 1 : items.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
      return { ...prev, [ac]: arrayMove(items, oldIndex, newIndex) };
    });
  }

  // ── Tier row controls ────────────────────────────────────────────────
  function addTier() {
    const t = { id: uid(), label: "New", color: TIER_COLORS[tierMeta.length % TIER_COLORS.length] };
    setTierMeta((m) => [...m, t]);
    setContainers((c) => ({ ...c, [t.id]: [] }));
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
      setError(e instanceof Error ? e.message : "Could not save");
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
    const canvas = await toCanvas(node, {
      pixelRatio,
      backgroundColor: "#0a0a0a",
      // cacheBust forces a fresh CORS fetch of the CDN art (cached copies
      // were loaded without an Origin header and would taint the canvas).
      cacheBust: true,
      // Drop the per-row "edit" controls / popovers from the image.
      filter: (n) => !(n instanceof HTMLElement && n.dataset.exportHide === "true"),
    });
    // webp is smaller/faster than png and is what we store on the CDN.
    return canvas.toDataURL("image/webp", 0.92);
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
      setError("Could not export the image. Try again.");
    } finally {
      setExporting(false);
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────
  function resetBoard() {
    if (!window.confirm("Reset the board? Every item goes back to the tray.")) {
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
      const g = entityMap.get(id)?.group;
      if (g) m[g] = (m[g] ?? 0) + 1;
    }
    return m;
  }, [trayItems, entityMap]);

  // The filter pills to show: every CARD_GROUPS entry that exists in this
  // pool (so we never render a Necrobinder pill for, say, relics).
  const cardGroups = useMemo(
    () => CARD_GROUPS.filter((g) => entities.some((e) => e.group === g.value)),
    [entities],
  );

  const filteredTray = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trayItems.filter((id) => {
      const e = entityMap.get(id);
      if (!e) return false;
      if (groupFilter && e.group !== groupFilter) return false;
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [trayItems, search, groupFilter, entityMap]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link
        href="/tier-list-maker"
        className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-white"
      >
        <span aria-hidden>←</span> Back to tier lists
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 min-w-[200px] rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-lg font-semibold text-white outline-none focus:border-sky-500"
          placeholder="Tier list name"
          aria-label="Tier list name"
        />
        <button
          onClick={resetBoard}
          className="rounded border border-neutral-600 px-4 py-2 font-semibold text-neutral-200 hover:border-red-500 hover:text-white"
        >
          Reset
        </button>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded border border-neutral-600 px-4 py-2 font-semibold text-neutral-200 hover:border-neutral-400 hover:text-white disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export image"}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || authLoading}
          className="rounded bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : user ? "Save" : "Sign in with Steam to save"}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {shareUrl && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-neutral-700 bg-neutral-900 p-2">
          <span className="text-sm text-neutral-400">Share:</span>
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-[200px] rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-200"
          />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className={`rounded px-3 py-1 text-sm text-white ${
              copied ? "bg-green-600" : "bg-neutral-700 hover:bg-neutral-600"
            }`}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div
          ref={captureRef}
          className="rounded-lg border border-neutral-800 bg-neutral-950 [&>*:first-child]:rounded-t-lg [&>*:last-child]:rounded-b-lg"
        >
          {/* Branding header — shown in the editor and baked into the export. */}
          <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-3 py-2">
            <span className="truncate text-base font-bold text-white">
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
                <div className="text-sm font-semibold text-white">Spire Codex</div>
                <div className="text-[10px] text-neutral-400">spire-codex.com</div>
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
          className="mt-2 rounded border border-dashed border-neutral-600 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-400 hover:text-white"
        >
          + Add tier
        </button>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              {ENTITY_LABEL[entityType]} ({filteredTray.length})
            </h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-40 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-white outline-none focus:border-sky-500"
            />
          </div>
          {cardGroups.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              <GroupPill
                label="All"
                count={trayItems.length}
                active={groupFilter === null}
                onClick={() => setGroupFilter(null)}
              />
              {cardGroups.map((g) => (
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
            className="flex min-h-[80px] flex-wrap content-start gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-2"
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
            className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              {entityMap.get(commentFor)?.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entityMap.get(commentFor)!.image}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded bg-neutral-800 object-contain"
                />
              )}
              <div>
                <div className="text-sm font-semibold text-white">
                  {entityMap.get(commentFor)?.name ?? commentFor}
                </div>
                <div className="text-xs text-neutral-400">Note / rationale</div>
              </div>
            </div>
            <textarea
              autoFocus
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Why is it ranked here?"
              className="w-full resize-none rounded border border-neutral-700 bg-neutral-950 p-2 text-sm text-white outline-none focus:border-sky-500"
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-neutral-500">{commentDraft.length}/500</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCommentFor(null)}
                  className="rounded px-3 py-1.5 text-sm text-neutral-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={saveComment}
                  className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
                >
                  {commentDraft.trim() ? "Save note" : "Remove note"}
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
          : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500 hover:text-white"
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
    <div className="flex items-stretch border-b border-neutral-900 last:border-b-0">
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
          aria-label="Tier label"
        />
        <button
          data-export-hide="true"
          onClick={() => setEditing((v) => !v)}
          className="text-[10px] underline opacity-70 hover:opacity-100"
        >
          edit
        </button>
        {editing && (
          <div
            data-export-hide="true"
            className="absolute left-0 top-full z-10 mt-1 w-44 rounded border border-neutral-700 bg-neutral-900 p-2 text-white shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Edit row
              </span>
              <button
                onClick={() => setEditing(false)}
                aria-label="Close editor"
                className="-mr-1 -mt-1 rounded px-1.5 text-sm leading-none text-neutral-400 hover:text-white"
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
                  className={`h-5 w-5 rounded ${tier.color === c ? "ring-2 ring-white" : ""}`}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            {/* Custom color — pick a swatch or type a hex if the presets
                don't fit. */}
            <div className="mb-2 flex items-center gap-1.5 border-t border-neutral-700 pt-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(tier.color) ? tier.color : "#cccccc"}
                onChange={(e) => onRecolor(tier.id, e.target.value)}
                className="h-6 w-7 shrink-0 cursor-pointer rounded border border-neutral-600 bg-transparent p-0"
                aria-label="Pick a custom color"
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
                className="w-full rounded border border-neutral-600 bg-neutral-800 px-1.5 py-0.5 text-xs text-white outline-none focus:border-sky-500"
                aria-label="Hex color"
              />
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              <button onClick={() => onMove(tier.id, -1)} disabled={isFirst} className="rounded bg-neutral-700 px-2 py-1 disabled:opacity-40">↑</button>
              <button onClick={() => onMove(tier.id, 1)} disabled={isLast} className="rounded bg-neutral-700 px-2 py-1 disabled:opacity-40">↓</button>
              <button onClick={() => onClear(tier.id)} className="rounded bg-neutral-700 px-2 py-1">Clear</button>
              <button onClick={() => onRemove(tier.id)} className="rounded bg-red-700 px-2 py-1">Delete</button>
            </div>
          </div>
        )}
      </div>
      <DropArea
        id={tier.id}
        className="flex min-h-[64px] flex-1 flex-wrap content-start gap-1 bg-neutral-950 p-1.5"
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
