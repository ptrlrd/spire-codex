"use client";

import { useGameLocale, useT } from "@/lib/i18n";
import { useState, useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import type {
  Keyword,
  Intent,
  Orb,
  Affliction,
  Modifier,
  Achievement,
  Act,
  Ascension,
} from "@/lib/api/types";
import { cachedFetch } from "@/lib/fetch-cache";
import RichDescription from "@/app/components/RichDescription";
import { useChannel, useBetaPrefix } from "@/lib/api/prefix.client";
import { imageUrl } from "@/lib/image-url";
import CharacterTag from "@/app/components/CharacterTag";

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
  id: string;
  title: string;
  endpoint: string;
  accent: string;
  initialData?: T[];
  lang: string;
  linkPrefix?: string;
  tiles?: boolean;
  render: (item: T) => React.ReactNode;
}

const SECTIONS = [
  { id: "acts", title: "Acts" },
  { id: "ascensions", title: "Ascension Levels" },
  { id: "keywords", title: "Keywords" },
  { id: "orbs", title: "Orbs" },
  { id: "afflictions", title: "Afflictions" },
  { id: "intents", title: "Intents" },
  { id: "modifiers", title: "Modifiers" },
  { id: "achievements", title: "Achievements" },
] as const;

function Entry({
  art,
  name,
  children,
}: {
  art?: React.ReactNode;
  name: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {art}
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-[var(--text-primary)] leading-snug">
          {name}
        </h3>
        {children}
      </div>
    </div>
  );
}

function EntryArt({ src }: { src: string }) {
  return (
    <img
      src={imageUrl(src)}
      alt=""
      width={36}
      height={36}
      loading="lazy"
      className="w-9 h-9 object-contain flex-shrink-0"
      crossOrigin="anonymous"
    />
  );
}

const descClass = "text-sm text-[var(--text-secondary)] leading-relaxed";

function ReferenceSection<T extends { id: string }>({
  id,
  title,
  endpoint,
  accent,
  initialData,
  lang,
  linkPrefix,
  tiles,
  render,
}: Section<T>) {
  const t = useT();
  const [data, setData] = useState<T[]>(initialData ?? []);
  const channel = useChannel();
  const initialRender = useRef(true);

  useEffect(() => {
    // Never skip on the beta channel: the server data is the stable
    // catalog, and cachedFetch appends channel=beta on /beta paths.
    if (initialRender.current) {
      initialRender.current = false;
      if (
        channel !== "beta" &&
        lang === "eng" &&
        initialData &&
        initialData.length > 0
      ) {
        return;
      }
    }
    cachedFetch<T[]>(`${API}/api/${endpoint}?lang=${lang}`).then(setData);
  }, [endpoint, lang, channel]);

  const filtered = data.filter(
    (item) => !item.id.startsWith("MOCK_") && item.id !== "PERIOD",
  );

  if (filtered.length === 0) return null;

  const itemClass = tiles
    ? "block h-full bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4"
    : "block h-full min-h-11 py-3 border-b border-[var(--border-subtle)]";

  return (
    <section id={id} className="mb-12 scroll-mt-20">
      <h2 className={`text-xl font-semibold ${accent} mb-3`}>
        {t(title)}{" "}
        <span className="text-sm text-[var(--text-muted)] font-normal">
          {filtered.length}
        </span>
      </h2>
      <ul
        className={
          tiles
            ? "grid grid-cols-2 lg:grid-cols-4 gap-3"
            : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 border-t border-[var(--border-subtle)]"
        }
      >
        {filtered.map((item) => (
          <li key={item.id}>
            {linkPrefix ? (
              <Link
                prefetch={false}
                href={`${linkPrefix}/${item.id.toLowerCase()}`}
                className={`${itemClass} hover:bg-[var(--bg-card-hover)] transition-colors`}
              >
                {render(item)}
              </Link>
            ) : (
              <div className={itemClass}>{render(item)}</div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ReferenceClient({
  initialData,
}: {
  initialData: ReferenceData;
}) {
  const lang = useGameLocale();
  const t = useT();
  const bp = useBetaPrefix();

  return (
    <>
      <nav aria-label={t("On this page")} className="flex flex-wrap gap-2 mb-8">
        {SECTIONS.filter((section) => initialData[section.id].length > 0).map(
          (section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="inline-flex items-center min-h-11 px-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              {t(section.title)}
            </a>
          ),
        )}
      </nav>

      <ReferenceSection<Act>
        id="acts"
        title="Acts"
        endpoint="acts"
        accent="text-success"
        initialData={initialData.acts}
        lang={lang}
        linkPrefix={`${bp}/acts`}
        tiles
        render={(act) => (
          <>
            <h3 className="font-semibold text-[var(--text-primary)] mb-2">
              {act.name}
            </h3>
            <div className="flex gap-1.5 sm:gap-2 mb-3">
              {act.bosses.map((boss) => (
                <img
                  key={boss}
                  src={imageUrl(
                    `/static/images/misc/bosses/${boss.toLowerCase()}.png`,
                  )}
                  alt=""
                  width={48}
                  height={48}
                  loading="lazy"
                  className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
                  crossOrigin="anonymous"
                />
              ))}
            </div>
            <div className="text-sm text-[var(--text-secondary)] space-y-0.5">
              {act.num_rooms && (
                <div>{t("{n} rooms", { n: act.num_rooms })}</div>
              )}
              <div>
                {t("{bosses} bosses · {encounters} encounters", {
                  bosses: act.bosses.length,
                  encounters: act.encounters.length,
                })}
              </div>
              <div>
                {t("{events} events · {ancients} ancients", {
                  events: act.events.length,
                  ancients: act.ancients.length,
                })}
              </div>
            </div>
          </>
        )}
      />

      <ReferenceSection<Ascension>
        id="ascensions"
        title="Ascension Levels"
        endpoint="ascensions"
        accent="text-danger"
        initialData={initialData.ascensions}
        lang={lang}
        linkPrefix={`${bp}/ascensions`}
        render={(asc) => (
          <Entry
            art={
              <span className="w-9 flex-shrink-0 text-center text-2xl font-bold leading-none text-danger">
                {asc.level}
              </span>
            }
            name={asc.name}
          >
            <p className={descClass}>
              <RichDescription text={asc.description} />
            </p>
          </Entry>
        )}
      />

      <ReferenceSection<Keyword>
        id="keywords"
        title="Keywords"
        endpoint="keywords"
        accent="text-info"
        initialData={initialData.keywords}
        lang={lang}
        linkPrefix={`${bp}/keywords`}
        render={(kw) => (
          <Entry name={kw.name}>
            <p className={descClass}>
              <RichDescription text={kw.description} />
            </p>
          </Entry>
        )}
      />

      <ReferenceSection<Orb>
        id="orbs"
        title="Orbs"
        endpoint="orbs"
        accent="text-info"
        initialData={initialData.orbs}
        lang={lang}
        linkPrefix={`${bp}/orbs`}
        render={(orb) => (
          <Entry
            art={orb.image_url && <EntryArt src={orb.image_url} />}
            name={orb.name}
          >
            <p className={descClass}>
              <RichDescription text={orb.description} />
            </p>
          </Entry>
        )}
      />

      <ReferenceSection<Affliction>
        id="afflictions"
        title="Afflictions"
        endpoint="afflictions"
        accent="text-danger"
        initialData={initialData.afflictions}
        lang={lang}
        linkPrefix={`${bp}/afflictions`}
        render={(aff) => (
          <Entry
            name={
              <span className="flex items-baseline justify-between gap-2">
                {aff.name}
                {aff.is_stackable && (
                  <span className="text-xs font-normal text-[var(--text-muted)]">
                    {t("Stackable")}
                  </span>
                )}
              </span>
            }
          >
            <p className={descClass}>
              <RichDescription text={aff.description} />
            </p>
            {aff.extra_card_text && (
              <p className="text-sm text-[var(--text-muted)] mt-1 italic">
                <RichDescription text={aff.extra_card_text} />
              </p>
            )}
          </Entry>
        )}
      />

      <ReferenceSection<Intent>
        id="intents"
        title="Intents"
        endpoint="intents"
        accent="text-warning"
        initialData={initialData.intents}
        lang={lang}
        linkPrefix={`${bp}/intents`}
        render={(intent) => (
          <Entry
            art={intent.image_url && <EntryArt src={intent.image_url} />}
            name={intent.name}
          >
            <p className={descClass}>
              <RichDescription text={intent.description} />
            </p>
          </Entry>
        )}
      />

      <ReferenceSection<Modifier>
        id="modifiers"
        title="Modifiers"
        endpoint="modifiers"
        accent="text-special"
        initialData={initialData.modifiers}
        lang={lang}
        linkPrefix={`${bp}/modifiers`}
        render={(mod) => (
          <Entry
            name={
              <span className="flex items-center gap-2">
                {mod.character && (
                  <CharacterTag id={mod.character} showName={false} size={20} />
                )}
                {mod.name}
              </span>
            }
          >
            <p className={descClass}>
              <RichDescription text={mod.description} />
            </p>
          </Entry>
        )}
      />

      <ReferenceSection<Achievement>
        id="achievements"
        title="Achievements"
        endpoint="achievements"
        accent="text-warning"
        initialData={initialData.achievements}
        lang={lang}
        linkPrefix={`${bp}/achievements`}
        render={(ach) => (
          <Entry
            name={
              <span className="flex items-center gap-2">
                {ach.character && (
                  <CharacterTag id={ach.character} showName={false} size={20} />
                )}
                {ach.name}
              </span>
            }
          >
            <p className={descClass}>
              <RichDescription text={ach.description} />
            </p>
          </Entry>
        )}
      />
    </>
  );
}
