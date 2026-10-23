import { describe, expect, it } from "vitest";
import { X9F } from "./i18n-x9f";
import { SUPPORTED_LANGS } from "./languages";
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  CHANNEL_LABELS,
  FOLDER_LABELS,
  categoryDescription,
  categoryLabel,
  channelLabel,
  folderLabel,
  humanize,
  parseChannel,
} from "./image-categories";

const LANGS = ["eng", ...SUPPORTED_LANGS];

describe("image gallery translations", () => {
  it("covers every category, description, channel and folder key in every language", () => {
    const keys = [
      ...Object.values(CATEGORY_LABELS),
      ...Object.values(CATEGORY_DESCRIPTIONS),
      ...Object.values(CHANNEL_LABELS),
      ...Object.values(FOLDER_LABELS),
    ];
    for (const key of keys) {
      const entry = X9F[key];
      expect(entry, key).toBeDefined();
      for (const lang of LANGS) {
        expect(entry[lang]?.trim(), `${key} [${lang}]`).toBeTruthy();
      }
    }
  });

  it("describes every category it labels", () => {
    expect(Object.keys(CATEGORY_DESCRIPTIONS).sort()).toEqual(
      Object.keys(CATEGORY_LABELS).sort(),
    );
  });

  it("translates category names and descriptions", () => {
    expect(categoryLabel("cards", "eng")).toBe("Card Renders");
    expect(categoryLabel("cards", "deu")).toBe("Karten-Renderings");
    expect(categoryDescription("potions", "jpn")).toContain("ポーション");
    expect(categoryDescription("nope", "deu")).toBeNull();
  });

  it("humanizes unknown categories and folders", () => {
    expect(categoryLabel("new-thing", "deu")).toBe("New thing");
    expect(folderLabel("vfx_attack_slash", "fra")).toBe("Vfx attack slash");
    expect(humanize("")).toBe("");
  });

  it("names language folders in their own language", () => {
    expect(folderLabel("deu", "eng")).toBe("Deutsch");
    expect(folderLabel("zht", "deu")).toBe("繁體中文");
    expect(folderLabel("eng", "fra")).toBe("Anglais");
    expect(folderLabel("beta", "esp")).toBe("Arte beta");
    expect(folderLabel("ui", "zhs")).toBe("界面");
  });

  it("reads the channel off the API name and keeps main and beta wording", () => {
    expect(parseChannel("Card Renders (Main v0.107.1)")).toBe("main");
    expect(parseChannel("Card Renders (Beta v0.110.0)")).toBe("beta");
    expect(parseChannel("Card Renders")).toBeNull();
    expect(channelLabel("main", "v0.107.1", "deu")).toBe("Main v0.107.1");
    expect(channelLabel("beta", "v0.110.0", "jpn")).toBe("Beta v0.110.0");
    expect(channelLabel(null, "v0.110.0", "eng")).toBe("v0.110.0");
  });
});
