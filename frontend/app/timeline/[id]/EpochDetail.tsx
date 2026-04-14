"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Epoch, Card, Relic, Potion } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const storyAccent: Record<string, string> = {
  ironclad: "text-red-400",
  silent: "text-emerald-400",
  defect: "text-blue-400",
  necrobinder: "text-pink-400",
  regent: "text-orange-400",
  magnumopus: "text-purple-400",
  talesfromthespire: "text-cyan-400",
  reopening: "text-amber-400",
};

const storyBorder: Record<string, string> = {
  ironclad: "border-red-600",
  silent: "border-emerald-600",
  defect: "border-blue-600",
  necrobinder: "border-pink-600",
  regent: "border-orange-600",
  magnumopus: "border-purple-600",
  talesfromthespire: "border-cyan-600",
  reopening: "border-amber-600",
};

function storyKey(id: string): string {
  return id.toLowerCase().replace(/_/g, "");
}

function cleanDescription(desc: string): string {
  return desc.replace(/\{[^}]+\}/g, "X");
}

export default function EpochDetail({ initialEpoch }: { initialEpoch?: Epoch | null } = {}) {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { lang } = useLanguage();

  const [epoch, setEpoch] = useState<Epoch | null>(initialEpoch ?? null);
  const [loading, setLoading] = useState(!initialEpoch);
  const [notFound, setNotFound] = useState(false);
  const [cardMap, setCardMap] = useState<Record<string, Card>>({});
  const [relicMap, setRelicMap] = useState<Record<string, Relic>>({});
  const [potionMap, setPotionMap] = useState<Record<string, Potion>>({});
  const [epochTitleMap, setEpochTitleMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    cachedFetch<Epoch>(`${API}/api/epochs/${id}?lang=${lang}`)
      .then(setEpoch)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  useEffect(() => {
    Promise.all([
      cachedFetch<Card[]>(`${API}/api/cards?lang=${lang}`),
      cachedFetch<Relic[]>(`${API}/api/relics?lang=${lang}`),
      cachedFetch<Potion[]>(`${API}/api/potions?lang=${lang}`),
      cachedFetch<Epoch[]>(`${API}/api/epochs?lang=${lang}`),
    ]).then(([cards, relics, potions, epochs]) => {
      const cm: Record<string, Card> = {};
      for (const c of cards) cm[c.id] = c;
      setCardMap(cm);
      const rm: Record<string, Relic> = {};
      for (const r of relics) rm[r.id] = r;
      setRelicMap(rm);
      const pm: Record<string, Potion> = {};
      for (const p of potions) pm[p.id] = p;
      setPotionMap(pm);
      const em: Record<string, string> = {};
      for (const e of epochs) em[e.id] = e.title;
      setEpochTitleMap(em);
    });
  }, [lang]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>
      </div>
    );
  }

  if (notFound || !epoch) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/timeline" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          &larr; Back to Timeline
        </Link>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Epoch Not Found</h1>
        </div>
      </div>
    );
  }

  const sk = storyKey(epoch.story_id || "");
  const accent = storyAccent[sk] || "text-[var(--accent-gold)]";
  const border = storyBorder[sk] || "border-[var(--border-subtle)]";

  const hasUnlocks = epoch.unlocks_cards?.length || epoch.unlocks_relics?.length || epoch.unlocks_potions?.length;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6">
        &larr; Back to Timeline
      </button>

      <div className={`bg-[var(--bg-card)] rounded-2xl border-2 ${border} shadow-2xl shadow-black/50 p-6 sm:p-8`}>
        {/* Story + Era */}
        <div className="flex items-center gap-2 mb-3 text-sm">
          <span className={accent}>
            {(epoch.story_id || "").replace(/_/g, " ")}
          </span>
          <span className="text-[var(--text-muted)]">&middot;</span>
          <span className="text-[var(--text-muted)]">
            {epoch.era_name}{epoch.era_year && epoch.era_year !== "???" && epoch.era_year !== "0" ? ` · ${epoch.era_year}` : ""}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-4">
          {epoch.title}
        </h1>

        {/* Unlock info */}
        {epoch.unlock_info && (
          <p className="text-xs text-[var(--text-muted)] mb-4">
            <RichDescription text={epoch.unlock_info} />
          </p>
        )}

        {/* Description */}
        {epoch.description && (
          <div className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6 whitespace-pre-line">
            <RichDescription text={epoch.description} />
          </div>
        )}

        {/* Unlock text */}
        {epoch.unlock_text && (
          <p className="text-xs text-[var(--text-muted)] italic mb-6">
            <RichDescription text={epoch.unlock_text} />
          </p>
        )}

        {/* Unlocks */}
        {hasUnlocks && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Unlocks
            </h2>
            {epoch.unlocks_cards && epoch.unlocks_cards.length > 0 && (
              <div className="mb-3">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Cards</span>
                <div className="flex flex-wrap gap-1.5">
                  {epoch.unlocks_cards.map((cid) => {
                    const card = cardMap[cid];
                    return (
                      <Link key={cid} href={`/cards/${cid.toLowerCase()}`} className="text-xs px-2 py-1 rounded border bg-blue-950/40 text-blue-300 border-blue-900/20 hover:border-blue-700/50 transition-colors">
                        {card?.name || cid.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
            {epoch.unlocks_relics && epoch.unlocks_relics.length > 0 && (
              <div className="mb-3">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Relics</span>
                <div className="flex flex-wrap gap-1.5">
                  {epoch.unlocks_relics.map((rid) => {
                    const relic = relicMap[rid];
                    return (
                      <Link key={rid} href={`/relics/${rid.toLowerCase()}`} className="text-xs px-2 py-1 rounded border bg-amber-950/40 text-amber-300 border-amber-900/20 hover:border-amber-700/50 transition-colors">
                        {relic?.name || rid.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
            {epoch.unlocks_potions && epoch.unlocks_potions.length > 0 && (
              <div className="mb-3">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">Potions</span>
                <div className="flex flex-wrap gap-1.5">
                  {epoch.unlocks_potions.map((pid) => {
                    const potion = potionMap[pid];
                    return (
                      <Link key={pid} href={`/potions/${pid.toLowerCase()}`} className="text-xs px-2 py-1 rounded border bg-emerald-950/40 text-emerald-300 border-emerald-900/20 hover:border-emerald-700/50 transition-colors">
                        {potion?.name || pid.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expands timeline */}
        {epoch.expands_timeline && epoch.expands_timeline.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Expands Timeline
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {epoch.expands_timeline.map((eid) => (
                <Link key={eid} href={`/timeline/${eid.toLowerCase()}`} className="text-xs px-2 py-1 rounded border bg-purple-950/40 text-purple-300 border-purple-900/20 hover:border-purple-700/50 transition-colors">
                  {epochTitleMap[eid] || eid.replace(/_EPOCH$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
