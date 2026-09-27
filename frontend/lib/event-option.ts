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
  grantsRelic?: string;
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
  if (parts.length >= 5 && parts[1] === "pages" && parts[3] === "options") {
    return {
      event: parts[0],
      page: parts[2],
      option: parts.slice(4).join("."),
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
  if (!event) {
    const generic = GENERIC[option.toUpperCase()];
    return generic ? { label: t(generic), desc: undefined } : null;
  }
  const ev = events[event];
  if (ev) {
    const fromPage = ev.pages
      ?.find((p) => p.id === page)
      ?.options?.find((o) => o.id === option);
    const hit = fromPage ?? ev.options?.find((o) => o.id === option);
    if (hit?.title) return pick(hit.title, hit.description, recorded);
  }
  if (event === "NEOW" || recorded?.grantsRelic === option) {
    const r = relic?.(option);
    if (r?.name) return pick(r.name, r.description, recorded);
  }
  return null;
}
