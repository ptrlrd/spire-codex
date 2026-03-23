"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Monster } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const typeBadge: Record<string, string> = {
  Normal: "bg-gray-800 text-gray-300",
  Elite: "bg-amber-900/50 text-amber-400",
  Boss: "bg-red-900/50 text-red-400",
};

export default function MonsterDetail() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLanguage();
  const [monster, setMonster] = useState<Monster | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    cachedFetch<Monster>(`${API}/api/monsters/${id}?lang=${lang}`)
      .then((data) => setMonster(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12 text-[var(--text-muted)]">
          Loading...
        </div>
      </div>
    );
  }

  if (notFound || !monster) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/monsters"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6 inline-block"
        >
          &larr; Back to Monsters
        </Link>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Monster Not Found
          </h1>
          <p className="text-[var(--text-muted)]">
            No monster with id &quot;{id}&quot; exists.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/monsters"
        className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6 inline-block"
      >
        &larr; Back to Monsters
      </Link>

      {/* Image */}
      {monster.image_url && (
        <div className="mb-6">
          <img
            src={`${API}${monster.image_url}`}
            alt={`${monster.name} - Slay the Spire 2 Monster`}
            className="mx-auto max-h-80 object-contain"
            crossOrigin="anonymous"
          />
        </div>
      )}

      {/* Name + Type Badge */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">
          {monster.name}
        </h1>
        <span
          className={`text-xs px-3 py-1 rounded-full font-medium ${
            typeBadge[monster.type] || ""
          }`}
        >
          {monster.type}
        </span>
      </div>

      {/* HP Section */}
      {(monster.min_hp || monster.min_hp_ascension) && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Hit Points
          </h2>
          <div className="flex gap-8">
            {monster.min_hp && (
              <div>
                <span className="text-xs text-[var(--text-muted)] block mb-1">
                  Normal
                </span>
                <span className="text-xl font-bold text-red-400">
                  {monster.min_hp}
                  {monster.max_hp && monster.max_hp !== monster.min_hp
                    ? `\u2013${monster.max_hp}`
                    : ""}
                </span>
              </div>
            )}
            {monster.min_hp_ascension && (
              <div>
                <span className="text-xs text-[var(--text-muted)] block mb-1">
                  Ascension
                </span>
                <span className="text-xl font-bold text-orange-400">
                  {monster.min_hp_ascension}
                  {monster.max_hp_ascension &&
                  monster.max_hp_ascension !== monster.min_hp_ascension
                    ? `\u2013${monster.max_hp_ascension}`
                    : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Moves Section */}
      {monster.moves && monster.moves.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Moves
          </h2>
          <div className="flex flex-wrap gap-2">
            {monster.moves.map((move) => (
              <span
                key={move.id}
                className="text-sm px-3 py-1 rounded-full bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
              >
                {move.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Damage Values Section */}
      {monster.damage_values &&
        Object.keys(monster.damage_values).length > 0 && (
          <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 mb-4">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
              Damage Values
            </h2>
            <div className="space-y-2">
              {Object.entries(monster.damage_values).map(([name, val]) => (
                <div
                  key={name}
                  className="flex items-center justify-between py-1 border-b border-[var(--border-subtle)] last:border-0"
                >
                  <span className="text-sm text-[var(--text-secondary)]">
                    {name}
                  </span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-medium text-red-400">
                      {val.normal}
                      {val.hit_count ? ` × ${val.hit_count}` : ""}
                      {val.hit_count ? <span className="text-xs text-[var(--text-muted)] font-normal ml-1">= {val.normal * val.hit_count}</span> : null}
                    </span>
                    {val.ascension !== undefined && (
                      <>
                        <span className="text-[var(--text-muted)]">|</span>
                        <span className="font-medium text-orange-400">
                          A: {val.ascension}
                          {val.hit_count ? ` × ${val.hit_count}` : ""}
                          {val.hit_count ? <span className="text-xs text-[var(--text-muted)] font-normal ml-1">= {val.ascension * val.hit_count}</span> : null}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Block Values Section */}
      {monster.block_values &&
        Object.keys(monster.block_values).length > 0 && (
          <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 mb-4">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
              Block Values
            </h2>
            <div className="space-y-2">
              {Object.entries(monster.block_values).map(([name, val]) => (
                <div
                  key={name}
                  className="flex items-center justify-between py-1 border-b border-[var(--border-subtle)] last:border-0"
                >
                  <span className="text-sm text-[var(--text-secondary)]">
                    {name}
                  </span>
                  <span className="text-sm font-medium text-blue-400">
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      <LocalizedNames entityType="monsters" entityId={id} />
      <EntityHistory entityType="monsters" entityId={id} />
    </div>
  );
}
