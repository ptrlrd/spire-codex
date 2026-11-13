import type { CharacterPronounGuess } from "@/lib/api/types";

export interface PronounGroup {
  guess: string;
  subject: string;
  speakers: CharacterPronounGuess[];
}

const GUESS_ORDER = ["feminine", "masculine", "it", "neutral"];

export function groupPronounGuesses(
  guesses: CharacterPronounGuess[] | null | undefined,
): PronounGroup[] {
  const groups = new Map<string, PronounGroup>();
  for (const guess of guesses ?? []) {
    if (!guess.subject) continue;
    const group = groups.get(guess.guess) ?? {
      guess: guess.guess,
      subject: guess.subject,
      speakers: [],
    };
    group.speakers.push(guess);
    groups.set(guess.guess, group);
  }
  const rank = (g: string) => {
    const at = GUESS_ORDER.indexOf(g);
    return at < 0 ? GUESS_ORDER.length : at;
  };
  return [...groups.values()].sort((a, b) => rank(a.guess) - rank(b.guess));
}
