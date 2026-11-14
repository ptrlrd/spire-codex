import type { Card } from "@/lib/api/types";

interface LevelStage {
  from: number;
  titleKey: string;
  fallback: string;
  art: string | null;
  atlasY: number;
}

interface LevelRule {
  stages: LevelStage[];
  vars: (level: number) => Record<string, number>;
}

const LEVELLED: Record<string, LevelRule> = {
  DINGY_DAGGER: {
    stages: [
      {
        from: 0,
        titleKey: "dingy",
        fallback: "Dingy Dagger",
        art: null,
        atlasY: 2683,
      },
      {
        from: 3,
        titleKey: "fine",
        fallback: "Fine Dagger",
        art: "/card-local/portrait_fine_dagger.webp",
        atlasY: 2683,
      },
      {
        from: 6,
        titleKey: "pristine",
        fallback: "Pristine Dagger",
        art: "/card-local/portrait_pristine_dagger.webp",
        atlasY: 2875,
      },
    ],
    vars: (level) => ({ Damage: 7 + 3 * level + (level * (level + 1)) / 2 }),
  },
};

export interface LevelledCard {
  title: string;
  description: string;
  art: string | null;
  atlasY: number;
  upgraded: boolean;
}

export function levelledCard(
  card: Card,
  level: number,
  titles?: Record<string, string>,
): LevelledCard | null {
  const rule = LEVELLED[card.id];
  if (!rule) return null;
  const stage = [...rule.stages].reverse().find((s) => level >= s.from);
  if (!stage) return null;
  const name = titles?.[stage.titleKey] ?? stage.fallback;
  const vars = rule.vars(level);
  const description = (card.description_raw ?? card.description ?? "").replace(
    /\{(\w+)(?::[^{}]*)?\}/g,
    (whole, key: string) => {
      if (vars[key] == null) return whole;
      return level > 0 ? `[green]${vars[key]}[/green]` : String(vars[key]);
    },
  );
  return {
    title: level > 0 ? `${name}+${level}` : name,
    description,
    art: stage.art,
    atlasY: stage.atlasY,
    upgraded: level > 0,
  };
}
