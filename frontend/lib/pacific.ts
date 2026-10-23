// Site policy for displayed dates and times: show the VIEWER's local time
// when we know it (client-side rendering), and Pacific (America/Los_Angeles,
// the site's home timezone) when we don't (server-rendered content). Never
// raw UTC. Backend timestamps are UTC but usually naive ("2026-08-18
// 18:06:44" or ISO without Z), so they get stamped UTC before converting —
// rendering a naive UTC string as wall-clock time was the original bug.
// Date-only strings ("2026-08-13", week labels, changelog dates) are ALREADY
// Pacific calendar dates and format as-is — a zone conversion would shift
// them back a day.

const TZ = "America/Los_Angeles";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_ZONE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

export function utcDate(ts: string | number | Date): Date {
  if (ts instanceof Date) return ts;
  if (typeof ts === "number") return new Date(ts);
  let s = ts.trim();
  if (DATE_ONLY.test(s)) return new Date(`${s}T00:00:00`);
  if (!HAS_ZONE.test(s)) s = `${s.replace(" ", "T")}Z`;
  return new Date(s);
}

function fmt(
  ts: string | number | Date,
  base: Intl.DateTimeFormatOptions,
  opts: Intl.DateTimeFormatOptions,
  locale: string | undefined,
  forcePacific: boolean,
): string {
  const dateOnly = typeof ts === "string" && DATE_ONLY.test(ts.trim());
  const d = utcDate(ts);
  if (isNaN(d.getTime())) return String(ts);
  // Explicit options replace the defaults wholesale, so a call site keeps
  // its exact format; the zone handling is the only thing always applied.
  const style = Object.keys(opts).length ? opts : base;
  // Calendar-date strings render as plain dates, no zone math. Otherwise:
  // the viewer's own zone in the browser, Pacific on the server.
  const zone = dateOnly
    ? {}
    : forcePacific || typeof window === "undefined"
      ? { timeZone: TZ }
      : {};
  return d.toLocaleString(locale, { ...style, ...zone });
}

const DATE_BASE: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
};
const TIME_BASE: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
};
const DATETIME_BASE: Intl.DateTimeFormatOptions = {
  ...DATE_BASE,
  ...TIME_BASE,
};

export function fmtDate(
  ts: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {},
  locale?: string,
): string {
  return fmt(ts, DATE_BASE, opts, locale, false);
}

export function fmtTime(
  ts: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {},
  locale?: string,
): string {
  return fmt(ts, TIME_BASE, opts, locale, false);
}

export function fmtDateTime(
  ts: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {},
  locale?: string,
): string {
  return fmt(ts, DATETIME_BASE, opts, locale, false);
}

// Pacific-pinned variants for content that must render identically on the
// server and every client (SSR'd text where a per-viewer zone would cause a
// hydration mismatch, or anything meant to read the same for everyone).
export function fmtDatePacific(
  ts: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {},
  locale?: string,
): string {
  return fmt(ts, DATE_BASE, opts, locale, true);
}

export function fmtDateTimePacific(
  ts: string | number | Date,
  opts: Intl.DateTimeFormatOptions = {},
  locale?: string,
): string {
  return fmt(ts, DATETIME_BASE, opts, locale, true);
}
