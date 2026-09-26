import type { Locale } from "@/lib/locale";
import { getT } from "@/lib/i18n-server";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const KOFI_URL = "https://ko-fi.com/yitsy";

export interface ThanksContributor {
  login: string;
  url: string;
  avatar_url?: string | null;
  contributions: number;
}

export interface ThanksSpecial {
  name: string;
  note?: string | null;
  url?: string | null;
}

export interface ThanksSupporter {
  name: string;
  total?: number | null;
  currency?: string | null;
  since?: string | null;
  count: number;
  tier?: string | null;
}

function fmtTotal(total: number | null | undefined, currency?: string | null) {
  if (total == null || total <= 0) return null;
  const n = Number.isInteger(total) ? String(total) : total.toFixed(2);
  const cur = (currency || "USD").toUpperCase();
  return cur === "USD" ? `$${n}` : `${n} ${cur}`;
}

export interface ThanksPayload {
  contributors: ThanksContributor[];
  special: ThanksSpecial[];
  supporters: ThanksSupporter[];
  generated_at?: string | null;
}

const EMPTY: ThanksPayload = { contributors: [], special: [], supporters: [] };

async function loadThanks(): Promise<ThanksPayload> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/thanks`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as Partial<ThanksPayload>;
    return {
      contributors: Array.isArray(data.contributors) ? data.contributors : [],
      special: Array.isArray(data.special) ? data.special : [],
      supporters: Array.isArray(data.supporters) ? data.supporters : [],
      generated_at: data.generated_at ?? null,
    };
  } catch {
    return EMPTY;
  }
}

export default async function ThankYouBody({ lang }: { lang: Locale }) {
  const [t, data] = await Promise.all([getT(lang), loadThanks()]);
  const empty =
    data.contributors.length === 0 &&
    data.special.length === 0 &&
    data.supporters.length === 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">
        <span className="text-[var(--accent-gold)]">{t("Thank")}</span>{" "}
        <span className="text-[var(--text-primary)]">{t("You")}</span>
      </h1>
      <div className="text-[var(--text-secondary)] leading-relaxed space-y-6">
        <p>
          {t(
            "Just wanted to say thank you to everyone that has supported the project. Thanks to those who've been using the site, reporting bugs, and helping make it better. This project wouldn't be where it is without the community. If you've been enjoying the project, please make sure to share it on social media!",
          )}
        </p>

        <section className="not-prose">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
              {t("Ko-fi Supporters")}
            </h2>
            <a
              href={KOFI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors"
            >
              {t("Support on Ko-fi")}
            </a>
          </div>
          <p className="text-sm text-[var(--text-muted)] mb-3">
            {t("A very special thank you to those who've donated on")}{" "}
            <a
              href={KOFI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-primary)] hover:underline"
            >
              Ko-fi
            </a>
            {t(". Your support keeps the lights on.")}
          </p>
          {data.supporters.length > 0 && (
            <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
              {data.supporters.map((s) => (
                <li
                  key={s.name}
                  title={
                    s.count > 1
                      ? t("Supported {n} times", { n: s.count })
                      : undefined
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)]"
                >
                  {s.name}
                  {fmtTotal(s.total, s.currency) && (
                    <span className="text-xs text-[var(--text-muted)]">
                      {fmtTotal(s.total, s.currency)}
                    </span>
                  )}
                  {s.tier && (
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      {s.tier}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.contributors.length > 0 && (
          <section className="not-prose">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-1">
              {t("GitHub contributors")}
            </h2>
            <p className="text-sm text-[var(--text-muted)] mb-3">
              {t("Everyone whose code, docs or data landed in the repo.")}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 list-none p-0 m-0">
              {data.contributors.map((c) => (
                <li key={c.login}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 hover:border-[var(--accent-gold)]/50 transition-colors"
                  >
                    {c.avatar_url ? (
                      <img
                        src={c.avatar_url}
                        alt=""
                        width={32}
                        height={32}
                        loading="lazy"
                        className="h-8 w-8 rounded-full bg-[var(--bg-elevated)]"
                      />
                    ) : (
                      <span className="h-8 w-8 rounded-full bg-[var(--bg-elevated)]" />
                    )}
                    <span className="flex-1 min-w-0 truncate text-sm font-medium text-[var(--text-primary)]">
                      {c.login}
                    </span>
                    <span className="shrink-0 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                      {t("{n} contributions", {
                        n: c.contributions.toLocaleString(),
                      })}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.special.length > 0 && (
          <section className="not-prose">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-1">
              {t("Special Thanks")}
            </h2>
            <p className="text-sm text-[var(--text-muted)] mb-3">
              {t("And special thanks to the following community contributors:")}
            </p>
            <ul className="space-y-1.5 list-none p-0 m-0">
              {data.special.map((s) => (
                <li key={`${s.name}-${s.url ?? ""}`} className="text-sm">
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[var(--text-primary)] hover:text-[var(--accent-gold)]"
                    >
                      {s.name}
                    </a>
                  ) : (
                    <span className="font-medium text-[var(--text-primary)]">
                      {s.name}
                    </span>
                  )}
                  {s.note && (
                    <span className="text-[var(--text-muted)]">
                      {" "}
                      · {s.note}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {empty && (
          <p className="text-sm text-[var(--text-muted)]">
            {t("Nothing to show yet. Check back soon.")}
          </p>
        )}
      </div>
    </div>
  );
}
