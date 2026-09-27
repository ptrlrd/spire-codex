import { describe, expect, it } from "vitest";
import { X9L } from "./i18n-x9l";
import { LANG_PREFIXES } from "./languages";

const BACKEND_CATEGORY_LABELS = [
  "Characters",
  "Cards",
  "Relics",
  "Monsters",
  "Potions",
  "Powers",
  "Enchantments",
  "Events",
  "Encounters",
  "Keywords",
  "Reference",
  "Mechanics",
  "Guides",
  "News",
  "Pages",
  "Images",
  "Best matches",
  "Links",
];

describe("search palette labels", () => {
  it("translates every category label the backend can emit into every locale", () => {
    for (const label of BACKEND_CATEGORY_LABELS) {
      const row = X9L[label];
      expect(row, label).toBeDefined();
      for (const locale of ["eng", ...LANG_PREFIXES]) {
        expect(row[locale], `${label}/${locale}`).toBeTruthy();
      }
    }
  });
});
