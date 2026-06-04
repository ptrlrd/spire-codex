"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TierEntity } from "./types";

/** Presentational chip: the entity art, or its name if there's no image.
 * Used inside sortable items, the drag overlay, and the read-only view.
 * When `commentText` is set the chip shows a styled hover tooltip with the
 * note (rendered outside the clipped art box so it isn't cut off). */
export function Chip({
  entity,
  size = 56,
  dragging = false,
  hasComment = false,
  commentText,
}: {
  entity: TierEntity;
  size?: number;
  dragging?: boolean;
  hasComment?: boolean;
  commentText?: string;
}) {
  return (
    <div
      className="group relative shrink-0"
      style={{ width: size, height: size }}
    >
      <div
        // Native title for the name only when there's no rich note tooltip,
        // so a commented chip doesn't show two overlapping tooltips.
        title={commentText ? undefined : entity.name}
        className={`relative h-full w-full overflow-hidden rounded bg-neutral-800 ring-1 ring-black/40 ${
          dragging ? "shadow-lg" : ""
        }`}
      >
        {entity.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entity.image}
            alt={entity.name}
            draggable={false}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center p-1 text-center text-[9px] leading-tight text-neutral-200">
            {entity.name}
          </span>
        )}
        {hasComment && (
          <span
            aria-label="Has a note"
            className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-sky-400 ring-1 ring-black/60"
          />
        )}
      </div>

      {commentText && !dragging && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden w-max max-w-[220px] -translate-x-1/2 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-left shadow-xl group-hover:block"
        >
          <div className="text-xs font-semibold text-white">{entity.name}</div>
          <div className="mt-0.5 whitespace-normal break-words text-xs leading-snug text-neutral-300">
            {commentText}
          </div>
          {/* little arrow */}
          <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-neutral-700 bg-neutral-900" />
        </div>
      )}
    </div>
  );
}

/** Draggable + sortable wrapper around a Chip. A plain click (no drag past the
 * sensor threshold) calls onClick, which the builder uses to open the note
 * editor for that item. */
export function SortableItem({
  entity,
  size = 56,
  hasComment = false,
  commentText,
  onClick,
}: {
  entity: TierEntity;
  size?: number;
  hasComment?: boolean;
  commentText?: string;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entity.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "none" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="cursor-grab active:cursor-grabbing"
    >
      <Chip
        entity={entity}
        size={size}
        hasComment={hasComment}
        commentText={commentText}
      />
    </div>
  );
}
