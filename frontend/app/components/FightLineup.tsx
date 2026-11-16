import { Link } from "@/i18n/navigation";
import { imageUrl } from "@/lib/image-url";
import type { FightMonster } from "@/lib/fight";
import { hpRange } from "@/lib/fight";
import IntentIcons from "./IntentIcons";

type T = (key: string, values?: Record<string, string | number>) => string;

export interface LineupMember {
  id: string;
  name: string;
}

export function MonsterArt({
  monster,
  size,
}: {
  monster: FightMonster | undefined;
  size: number;
}) {
  if (!monster?.image_url) {
    return (
      <span
        aria-hidden
        className="block rounded-full border border-dashed border-[var(--border-accent)]"
        style={{ width: size * 0.6, height: size * 0.6 }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl(monster.image_url)}
      alt=""
      loading="lazy"
      className="object-contain object-bottom"
      style={{ width: size, height: size }}
    />
  );
}

export default function FightLineup({
  members,
  monsters,
  size,
  detail,
  hrefFor,
  t,
}: {
  members: LineupMember[];
  monsters: Record<string, FightMonster>;
  size: number;
  detail?: boolean;
  hrefFor?: (id: string) => string;
  t: T;
}) {
  return (
    <span className="flex flex-wrap items-start gap-x-3 gap-y-2">
      {members.map((member) => {
        const monster = monsters[member.id];
        const hp = hpRange(monster?.min_hp, monster?.max_hp);
        const width = detail ? size + 24 : size + 8;
        const inner = (
          <>
            <span
              className="flex items-end justify-center"
              style={{ height: size }}
            >
              <MonsterArt monster={monster} size={size} />
            </span>
            <span
              className={`mt-1 w-full leading-tight ${
                detail
                  ? "text-sm font-semibold text-[var(--text-primary)]"
                  : "text-xs text-[var(--text-secondary)]"
              }`}
            >
              {member.name}
            </span>
            {detail && hp && (
              <span className="text-xs tabular-nums text-[var(--text-muted)]">
                {t("{hp} HP", { hp })}
              </span>
            )}
            {detail && monster?.first_intent && (
              <span className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                {t("Opens with")}
                <IntentIcons intent={monster.first_intent} size={26} t={t} />
              </span>
            )}
          </>
        );
        const box = "flex min-w-0 flex-col items-center text-center";
        return hrefFor ? (
          <Link
            key={member.id}
            prefetch={false}
            href={hrefFor(member.id)}
            className={`${box} rounded-md transition-colors hover:text-[var(--accent-gold)]`}
            style={{ width }}
          >
            {inner}
          </Link>
        ) : (
          <span key={member.id} className={box} style={{ width }}>
            {inner}
          </span>
        );
      })}
    </span>
  );
}
