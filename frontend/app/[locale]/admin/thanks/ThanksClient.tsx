"use client";

import { useEffect, useState } from "react";
import { AdminShell, adminFetch } from "../shared";
import { fmtDateTimePacific } from "@/lib/pacific";

interface SpecialItem {
  id?: string;
  name: string;
  note?: string | null;
  url?: string | null;
}

interface Supporter {
  id: string;
  name: string;
  type: string;
  tier_name?: string | null;
  amount?: number | null;
  currency?: string | null;
  timestamp?: string | null;
  is_public: boolean;
  hidden: boolean;
  source?: string | null;
}

interface PreviewRow {
  name: string;
  type: string;
  tier_name?: string | null;
  amount: number;
  currency: string;
  timestamp?: string | null;
  is_public: boolean;
  transaction_id?: string | null;
  problem?: string | null;
}

const input =
  "w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 text-sm text-[var(--text-primary)]";
const btn =
  "rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50";
const gold =
  "rounded-md border border-[var(--accent-gold)] bg-[var(--accent-gold)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent-gold)] disabled:opacity-50";

export default function ThanksClient() {
  const [special, setSpecial] = useState<SpecialItem[]>([]);
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function load() {
    adminFetch<{ items: SpecialItem[] }>("/api/admin/thanks/special")
      .then((d) => setSpecial(d.items ?? []))
      .catch((e) => setNote(String((e as Error)?.message || e)));
    adminFetch<{ items: Supporter[] }>("/api/admin/thanks/supporters")
      .then((d) => setSupporters(d.items ?? []))
      .catch((e) => setNote(String((e as Error)?.message || e)));
  }
  useEffect(load, []);

  function patch(i: number, changes: Partial<SpecialItem>) {
    setSpecial((rows) =>
      rows.map((r, j) => (j === i ? { ...r, ...changes } : r)),
    );
  }
  function move(i: number, dir: -1 | 1) {
    setSpecial((rows) => {
      const j = i + dir;
      if (j < 0 || j >= rows.length) return rows;
      const next = rows.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function saveSpecial() {
    setBusy(true);
    setNote(null);
    try {
      const d = await adminFetch<{ items: SpecialItem[] }>(
        "/api/admin/thanks/special",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: special
              .filter((r) => r.name.trim())
              .map((r) => ({
                id: r.id,
                name: r.name.trim(),
                note: r.note?.trim() || null,
                url: r.url?.trim() || null,
              })),
          }),
        },
      );
      setSpecial(d.items ?? []);
      setNote("Special thanks saved. The page refreshes within 5 minutes.");
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function setHidden(id: string, hidden: boolean) {
    await adminFetch(`/api/admin/thanks/supporters/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden }),
    }).catch((e) => setNote(String((e as Error)?.message || e)));
    load();
  }

  async function runPreview() {
    if (!importText.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const d = await adminFetch<{ rows: PreviewRow[] }>(
        "/api/admin/thanks/supporters/preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: importText }),
        },
      );
      setPreview(d.rows ?? []);
      if (!d.rows?.length) setNote("Nothing parsed. Check the header row.");
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!importText.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const d = await adminFetch<{
        parsed: number;
        created: number;
        skipped: number;
        rejected: number;
      }>("/api/admin/thanks/supporters/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: importText }),
      });
      setNote(
        `Import: ${d.parsed} rows read, ${d.created} added, ${d.skipped} already present, ${d.rejected} skipped as unusable.`,
      );
      setImportText("");
      setPreview(null);
      load();
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function refreshGithub() {
    setBusy(true);
    setNote(null);
    try {
      const d = await adminFetch<{ contributors: number }>(
        "/api/admin/thanks/github/refresh",
        { method: "POST" },
      );
      setNote(`GitHub refreshed: ${d.contributors} contributors.`);
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  function onFile(file: File | null) {
    if (!file) return;
    file.text().then((text) => {
      setImportText(text);
      setPreview(null);
    });
  }

  return (
    <AdminShell
      title="Thank You page"
      subtitle="Special thanks list, Ko-fi supporters and the GitHub contributor cache behind /thank-you."
    >
      {note && (
        <p className="mb-4 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          {note}
        </p>
      )}

      <section className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
            GitHub contributors
          </h2>
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={refreshGithub}
          >
            Refresh from GitHub
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Pulled from the configured repos once a day; use the button after a
          contributor PR merges to show them right away.
        </p>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
            Special thanks
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              className={btn}
              onClick={() =>
                setSpecial((rows) => [...rows, { name: "", note: "", url: "" }])
              }
            >
              Add row
            </button>
            <button
              type="button"
              className={gold}
              disabled={busy}
              onClick={saveSpecial}
            >
              Save list
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {special.map((row, i) => (
            <div
              key={row.id ?? `new-${i}`}
              className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center"
            >
              <input
                className={input}
                placeholder="Name"
                value={row.name}
                onChange={(e) => patch(i, { name: e.target.value })}
              />
              <input
                className={input}
                placeholder="Note (optional)"
                value={row.note ?? ""}
                onChange={(e) => patch(i, { note: e.target.value })}
              />
              <input
                className={input}
                placeholder="https://link (optional)"
                value={row.url ?? ""}
                onChange={(e) => patch(i, { url: e.target.value })}
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  className={btn}
                  onClick={() => move(i, -1)}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={() =>
                    setSpecial((rows) => rows.filter((_, j) => j !== i))
                  }
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {special.length === 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              No entries yet. Add a row and save.
            </p>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)] mb-2">
          Import Ko-fi supporters
        </h2>
        <p className="text-xs text-[var(--text-muted)] mb-2">
          Upload or paste the supporter CSV straight from the Ko-fi dashboard
          (or a JSON list). Name, date, amount, currency and what they did
          (donation, monthly subscription, shop order) are kept; messages are
          dropped. Preview first, then import; rows already stored are skipped.
        </p>
        <textarea
          className={`${input} h-28 font-mono text-xs`}
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value);
            setPreview(null);
          }}
          placeholder="DateTime,From,Message,Item,Amount (USD),Tier,Transaction Id,Is Public"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="text-xs text-[var(--text-muted)]"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className={btn}
            disabled={busy || !importText.trim()}
            onClick={runPreview}
          >
            Preview
          </button>
          <button
            type="button"
            className={gold}
            disabled={busy || !preview || preview.length === 0}
            onClick={runImport}
          >
            Import {preview?.length ? `${preview.length} rows` : ""}
          </button>
        </div>
        {preview && preview.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-md border border-[var(--border-subtle)]">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-1.5">Name</th>
                  <th className="px-2 py-1.5">Amount</th>
                  <th className="px-2 py-1.5">Type</th>
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5">Public</th>
                  <th className="px-2 py-1.5">Note</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr
                    key={`${r.transaction_id ?? i}`}
                    className="border-t border-[var(--border-subtle)]"
                  >
                    <td className="px-2 py-1.5 text-[var(--text-primary)]">
                      {r.name}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.amount} {r.currency}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.type}
                      {r.tier_name ? ` (${r.tier_name})` : ""}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {r.timestamp ? fmtDateTimePacific(r.timestamp) : ""}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.is_public ? "yes" : "no"}
                    </td>
                    <td className="px-2 py-1.5 text-[var(--text-muted)]">
                      {r.problem ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)] mb-1">
          Ko-fi supporters ({supporters.length})
        </h2>
        <p className="text-xs text-[var(--text-muted)] mb-2">
          Same order as the public page: biggest total first, each row under its
          supporter.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <th className="py-1.5 pr-4">Name</th>
                <th className="py-1.5 pr-4">Type</th>
                <th className="py-1.5 pr-4">Amount</th>
                <th className="py-1.5 pr-4">When</th>
                <th className="py-1.5 pr-4">Public</th>
                <th className="py-1.5 pr-4">Source</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {supporters.map((s) => (
                <tr
                  key={s.id}
                  className={`border-t border-[var(--border-subtle)] ${s.hidden ? "opacity-50" : ""}`}
                >
                  <td className="py-1.5 pr-4 text-[var(--text-primary)]">
                    {s.name}
                    {s.tier_name && (
                      <span className="ml-1 text-xs text-[var(--text-muted)]">
                        {s.tier_name}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-4">{s.type}</td>
                  <td className="py-1.5 pr-4">
                    {s.amount != null ? `${s.amount} ${s.currency ?? ""}` : ""}
                  </td>
                  <td className="py-1.5 pr-4 whitespace-nowrap">
                    {s.timestamp ? fmtDateTimePacific(s.timestamp) : ""}
                  </td>
                  <td className="py-1.5 pr-4">{s.is_public ? "yes" : "no"}</td>
                  <td className="py-1.5 pr-4">{s.source ?? ""}</td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      className={btn}
                      onClick={() => setHidden(s.id, !s.hidden)}
                    >
                      {s.hidden ? "Unhide" : "Hide"}
                    </button>
                  </td>
                </tr>
              ))}
              {supporters.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-3 text-xs text-[var(--text-muted)]"
                  >
                    No supporters stored yet. Configure the Ko-fi webhook or
                    import the CSV above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
