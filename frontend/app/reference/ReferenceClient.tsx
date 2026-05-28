"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type {
  Keyword,
  Intent,
  Orb,
  Affliction,
  Modifier,
  Achievement,
  Act,
  Ascension,
} from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import RichDescription from "../components/RichDescription";
import { useLanguage } from "../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { imageUrl } from "@/lib/image-url";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface ReferenceData {
  acts: Act[];
  ascensions: Ascension[];
  keywords: Keyword[];
  orbs: Orb[];
  afflictions: Affliction[];
  intents: Intent[];
  modifiers: Modifier[];
  achievements: Achievement[];
}

interface Section<T> {
  title: string;
  endpoint: string;
  accent: string;
  initialData?: T[];
  lang: string;
  linkPrefix?: string;
  render: (item: T) => React.ReactNode;
}

function ReferenceSection<T extends { id: string }>({
  title,
  endpoint,
  accent,
  initialData,
  lang,
  linkPrefix,
  render,
}: Section<T>) {
  const [data, setData] = useState<T[]>(initialData ?? []);
  const initialRender = useRef(true);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      if (lang === "eng" && initialData && initialData.length > 0) {
        return;
      }
    }
    cachedFetch<T[]>(`${API}/api/${endpoint}?lang=${lang}`).then(setData);
  }, [endpoint, lang]);

  const filtered = data.filter(
    (item) => !item.id.startsWith("MOCK_") && item.id !== "PERIOD"
  );

  if (filtered.length === 0) return null;

  return (
    <div className="mb-12">
      <h2
        className={`text-xl font-semibold ${accent} mb-4 border-b border-[var(--border-subtle)] pb-2`}
      >
        {title}{" "}
        <span className="text-sm text-[var(--text-muted)] font-normal">
          ({filtered.length})
        </span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((item) => {
          const content = (
            <div
              className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 hover:bg-[var(--bg-card-hover)] transition-all h-full"
            >
              {render(item)}
            </div>
          );
          return linkPrefix ? (
            <Link key={item.id} href={`${linkPrefix}/${item.id.toLowerCase()}`} className="block h-full">
              {content}
            </Link>
          ) : (
            <div key={item.id} className="h-full">{content}</div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReferenceClient({
  initialData,
}: {
  initialData: ReferenceData;
}) {
  const { lang } = useLanguage();
  const lp = useLangPrefix();

  return (
    <>
      <ReferenceSection<Act>
        title="Acts"
        endpoint="acts"
        accent="text-emerald-400"
        initialData={initialData.acts}
        lang={lang}
        linkPrefix={`${lp}/acts`}
        render={(act) => (
          <>
            <h3 className="font-semibold text-[var(--text-primary)] mb-2">
              {act.name}
            </h3>
            <div className="text-xs text-[var(--text-muted)] space-y-1">
              {act.num_rooms && <div>{act.num_rooms} rooms</div>}
              <div>
                {act.bosses.length} bosses · {act.encounters.length} encounters
              </div>
              <div>
                {act.events.length} events · {act.ancients.length} ancients
              </div>
            </div>
          </>
        )}
      />

      <ReferenceSection<Ascension>
        title="Ascension Levels"
        endpoint="ascensions"
        accent="text-rose-400"
        initialData={initialData.ascensions}
        lang={lang}
        linkPrefix={`${lp}/ascensions`}
        render={(asc) => (
          <>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-lg font-bold text-rose-400">
                {asc.level}
              </span>
              <h3 className="font-semibold text-[var(--text-primary)]">
                {asc.name}
              </h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              <RichDescription text={asc.description} />
            </p>
          </>
        )}
      />

      <ReferenceSection<Keyword>
        title="Keywords"
        endpoint="keywords"
        accent="text-cyan-400"
        initialData={initialData.keywords}
        lang={lang}
        linkPrefix={`${lp}/keywords`}
        render={(kw) => (
          <>
            <h3 className="font-semibold text-[var(--text-primary)] mb-1">
              {kw.name}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              <RichDescription text={kw.description} />
            </p>
          </>
        )}
      />

      <ReferenceSection<Orb>
        title="Orbs"
        endpoint="orbs"
        accent="text-blue-400"
        initialData={initialData.orbs}
        lang={lang}
        linkPrefix={`${lp}/orbs`}
        render={(orb) => (
          <div className="flex items-start gap-3">
            {orb.image_url && (
              <img
                src={imageUrl(orb.image_url)}
                alt={orb.name}
                className="w-10 h-10 object-contain flex-shrink-0 mt-0.5"
                crossOrigin="anonymous"
              />
            )}
            <div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">
                {orb.name}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                <RichDescription text={orb.description} />
              </p>
            </div>
          </div>
        )}
      />

      <ReferenceSection<Affliction>
        title="Afflictions"
        endpoint="afflictions"
        accent="text-red-400"
        initialData={initialData.afflictions}
        lang={lang}
        linkPrefix={`${lp}/afflictions`}
        render={(aff) => (
          <>
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-semibold text-[var(--text-primary)]">
                {aff.name}
              </h3>
              {aff.is_stackable && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-muted)]">
                  Stackable
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              <RichDescription text={aff.description} />
            </p>
            {aff.extra_card_text && (
              <p className="text-xs text-[var(--text-muted)] mt-1 italic">
                <RichDescription text={aff.extra_card_text} />
              </p>
            )}
          </>
        )}
      />

      <ReferenceSection<Intent>
        title="Intents"
        endpoint="intents"
        accent="text-amber-400"
        initialData={initialData.intents}
        lang={lang}
        linkPrefix={`${lp}/intents`}
        render={(intent) => (
          <div className="flex items-start gap-3">
            {intent.image_url && (
              <img
                src={imageUrl(intent.image_url)}
                alt={intent.name}
                className="w-10 h-10 object-contain flex-shrink-0 mt-0.5"
                crossOrigin="anonymous"
              />
            )}
            <div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">
                {intent.name}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                <RichDescription text={intent.description} />
              </p>
            </div>
          </div>
        )}
      />

      <ReferenceSection<Modifier>
        title="Modifiers"
        endpoint="modifiers"
        accent="text-purple-400"
        initialData={initialData.modifiers}
        lang={lang}
        linkPrefix={`${lp}/modifiers`}
        render={(mod) => (
          <>
            <h3 className="font-semibold text-[var(--text-primary)] mb-1">
              {mod.name}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              <RichDescription text={mod.description} />
            </p>
          </>
        )}
      />

      <ReferenceSection<Achievement>
        title="Achievements"
        endpoint="achievements"
        accent="text-yellow-400"
        initialData={initialData.achievements}
        lang={lang}
        linkPrefix={`${lp}/achievements`}
        render={(ach) => (
          <>
            <h3 className="font-semibold text-[var(--text-primary)] mb-1">
              {ach.name}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              <RichDescription text={ach.description} />
            </p>
          </>
        )}
      />
    </>
  );
}
