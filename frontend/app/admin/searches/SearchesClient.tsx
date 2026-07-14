"use client";

// What people type into the global search bar, straight from the search_log
// collection. The zero-result table is the one to watch: those are the things
// visitors looked for and didn't find.

import { useCallback, useEffect, useState } from "react";
import { AdminShell, Card, adminFetch } from "../shared";

interface Summary {
  total: number;
  distinct: number;
  zero: number;
  zero_rate: number;
  ctr: number;
  clients: number;
  days: number;
}
interface TopRow {
  query: string;
  count: number;
  clients: number;
  zero_rate: number;
  last_at: string | null;
}
interface VolRow {
  day: string;
  count: number;
  zero: number;
}
interface RecentRow {
  query: string;
  lang: string;
  results: number;
  at: string | null;
}
interface Overview {
  summary: Summary;
  top: TopRow[];
  zero: TopRow[];
  volume: VolRow[];
  recent: RecentRow[];
}

const RANGES = [7, 30, 90];

function pct(x: number): string {
  return `${Math.round((x ?? 0) * 100)}%`;
}

function ago(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function QueryTable({
  title,
  rows,
  note,
  showZeroRate,
}: {
  title: string;
  rows: TopRow[];
  note: string;
  showZeroRate?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{note}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--text-muted)]">Nothing yet.</p>
      ) : (
        <div className="max-h-[26rem] overflow-y-auto">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.query + i}
                  className="border-b border-[var(--border-subtle)] last:border-0"
                >
                  <td className="pl-4 pr-2 py-2 text-[var(--text-muted)] tabular-nums w-8">
                    {i + 1}
                  </td>
                  <td className="px-2 py-2 text-[var(--text-primary)] break-all">
                    {r.query}
                  </td>
                  <td className="px-2 py-2 text-right text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                    {r.clients} {r.clients === 1 ? "visitor" : "visitors"}
                  </td>
                  {showZeroRate && (
                    <td
                      className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${
                        r.zero_rate > 0 ? "text-red-400" : "text-[var(--text-muted)]"
                      }`}
                    >
                      {pct(r.zero_rate)} empty
                    </td>
                  )}
                  <td className="pl-2 pr-4 py-2 text-right font-semibold text-[var(--accent-gold)] tabular-nums w-16">
                    {r.count.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VolumeChart({ volume }: { volume: VolRow[] }) {
  if (volume.length === 0) return null;
  const max = Math.max(1, ...volume.map((v) => v.count));
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 mb-6">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
        Searches per day
        <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
          gold = found, red = zero results
        </span>
      </h3>
      <div className="flex items-end gap-[2px] h-28">
        {volume.map((v) => {
          const hits = v.count - v.zero;
          return (
            <div
              key={v.day}
              title={`${v.day}: ${v.count.toLocaleString()} searches, ${v.zero.toLocaleString()} with no results`}
              className="flex-1 min-w-[2px] flex flex-col justify-end"
            >
              <div
                className="bg-red-500/70 rounded-t-sm"
                style={{ height: `${(v.zero / max) * 100}%` }}
              />
              <div
                className="bg-[var(--accent-gold)]/70"
                style={{ height: `${(hits / max) * 100}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1.5">
        <span>{volume[0]?.day}</span>
        <span>{volume[volume.length - 1]?.day}</span>
      </div>
    </div>
  );
}

export default function SearchesClient() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Overview | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback((d: number) => {
    return adminFetch<Overview>(`/api/admin/searches?days=${d}&limit=100`)
      .then((o) => {
        setData(o);
        setNote(null);
      })
      .catch((e) => setNote(String((e as Error)?.message || e)));
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  const s = data?.summary;

  return (
    <AdminShell title="Searches" subtitle="global search bar">
      <div className="flex items-center gap-1.5 mb-6">
        {RANGES.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              days === d
                ? "bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border-[var(--accent-gold)]/30"
                : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {note && <p className="text-sm text-red-400 mb-4">{note}</p>}

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <Card label="Searches" value={s.total.toLocaleString()} sub={`last ${s.days}d`} />
          <Card label="Distinct queries" value={s.distinct.toLocaleString()} />
          <Card label="Click-through" value={pct(s.ctr)} sub="picked a result" />
          <Card
            label="Zero-result rate"
            value={pct(s.zero_rate)}
            sub={`${s.zero.toLocaleString()} searches`}
          />
          <Card label="Visitors" value={s.clients.toLocaleString()} />
        </div>
      )}

      {data && <VolumeChart volume={data.volume} />}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <QueryTable
            title="Top searches"
            note="What people settle on — the query when they pick a result or leave."
            rows={data.top}
            showZeroRate
          />
          <QueryTable
            title="Came up empty"
            note="Searched for, found nothing — the gaps worth filling."
            rows={data.zero}
          />
        </div>
      )}

      {data && data.recent.length > 0 && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Live feed</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Newest searches first.</p>
          </div>
          <div className="max-h-[24rem] overflow-y-auto divide-y divide-[var(--border-subtle)]">
            {data.recent.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="flex-1 text-[var(--text-primary)] break-all">{r.query}</span>
                <span className="text-xs text-[var(--text-muted)] uppercase">{r.lang}</span>
                <span
                  className={`text-xs tabular-nums whitespace-nowrap ${
                    r.results === 0 ? "text-red-400" : "text-[var(--text-secondary)]"
                  }`}
                >
                  {r.results} hit{r.results === 1 ? "" : "s"}
                </span>
                <span className="text-xs text-[var(--text-muted)] w-12 text-right">
                  {ago(r.at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
