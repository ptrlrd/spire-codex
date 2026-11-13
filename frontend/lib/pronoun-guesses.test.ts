import { describe, expect, it } from "vitest";
import { groupPronounGuesses } from "./pronoun-guesses";

const guess = (speaker: string, kind: string, subject: string | null) => ({
  speaker_id: speaker.toUpperCase(),
  speaker_name: speaker,
  guess: kind,
  subject,
  object: null,
  possessive: null,
});

describe("groupPronounGuesses", () => {
  it("groups speakers by the pronoun they use, in a fixed order", () => {
    const groups = groupPronounGuesses([
      guess("Neow", "it", "it"),
      guess("Darv", "feminine", "she"),
      guess("Tanx", "masculine", "he"),
      guess("Nonupeipe", "feminine", "she"),
      guess("Vakuu", "neutral", "they"),
    ]);
    expect(groups.map((g) => g.subject)).toEqual(["she", "he", "it", "they"]);
    expect(groups[0].speakers.map((s) => s.speaker_name)).toEqual([
      "Darv",
      "Nonupeipe",
    ]);
  });

  it("is empty without guesses and skips rows with no pronoun text", () => {
    expect(groupPronounGuesses(null)).toEqual([]);
    expect(groupPronounGuesses([guess("Pael", "neutral", null)])).toEqual([]);
  });
});
