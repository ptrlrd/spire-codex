export interface EventOptionText {
  id: string;
  title?: string | null;
  description?: string | null;
}

export interface EventPageText {
  id: string;
  description?: string | null;
  options?: EventOptionText[] | null;
}

export interface EventText {
  id: string;
  options?: EventOptionText[] | null;
  pages?: EventPageText[] | null;
}

export interface RecordedOptionText {
  label?: string;
  desc?: string;
}

export interface ResolvedOption {
  label: string;
  desc?: string;
}

const GENERIC: Record<string, string> = {
  PROCEED: "Proceed",
  CONTINUE: "Continue",
  LEAVE: "Leave",
  IGNORE: "Ignore",
};

export function parseOptionId(optionId: string): {
  event?: string;
  page?: string;
  option: string;
} {
  const parts = optionId.split(".");
  const pagesAt = parts.indexOf("pages");
  const optionsAt = parts.lastIndexOf("options");
  if (optionsAt > 0 && optionsAt < parts.length - 1) {
    return {
      event: parts[0],
      page:
        pagesAt >= 0 && pagesAt + 1 < optionsAt
          ? parts[pagesAt + 1]
          : undefined,
      option: parts.slice(optionsAt + 1).join("."),
    };
  }
  return { option: optionId };
}

function pick(
  title: string,
  description: string | null | undefined,
  recorded?: RecordedOptionText,
): ResolvedOption {
  const sameLanguage = recorded?.label === title;
  const desc = (sameLanguage && recorded?.desc) || description || undefined;
  return { label: title, desc };
}

export function resolveEventOption(
  optionId: string | undefined,
  events: Record<string, EventText>,
  relic?: (
    id: string,
  ) => { name: string; description?: string | null } | undefined,
  t: (key: string) => string = (k) => k,
  recorded?: RecordedOptionText,
): ResolvedOption | null {
  if (!optionId) return null;
  const { event, page, option } = parseOptionId(optionId);
  if (event) {
    const ev = events[event];
    if (ev) {
      const fromPage = page
        ? ev.pages
            ?.find((p) => p.id === page)
            ?.options?.find((o) => o.id === option)
        : undefined;
      const hit = fromPage ?? ev.options?.find((o) => o.id === option);
      if (hit?.title) return pick(hit.title, hit.description, recorded);
    }
    const r = relic?.(option);
    if (r?.name) return pick(r.name, r.description, recorded);
  }
  const generic = GENERIC[option.toUpperCase()];
  if (generic) return { label: t(generic), desc: undefined };
  return null;
}
