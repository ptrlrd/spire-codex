import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bbcodeToHtml,
  betaOnlyTags,
  changelogPath,
  entityPath,
  fetchChangelog,
  fetchGamePatches,
  fetchLatestPatch,
  fieldLabel,
  plainValue,
  shownChanges,
  versionLabel,
  versionTag,
  type ChangelogSummary,
} from "./changelog";

const patch = (
  tag: string,
  title: string,
  version = tag,
): ChangelogSummary => ({
  app_id: 2868840,
  game_version: version,
  build_id: "",
  tag,
  date: "2026-08-13",
  title,
  summary: { added: 0, removed: 0, changed: 0 },
});

const PATCHES = [
  patch("0.111.0", "Beta Patch Notes - v0.111.0"),
  patch("0.109.1", "Beta Hotfix Patch Notes - v0.109.1"),
  patch("0.107.1", "Major Update #2 - v0.107.1"),
  patch("0.107.0", "Beta Patch Notes - v0.107.0"),
  patch("may-bug-fixes", "May Bug Fixes", "May Bug Fixes"),
  patch("0.98.3", "Hotfix Patch notes - v0.98.3"),
];

function stubApi(handler: (url: string) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => handler(String(input))),
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("betaOnlyTags", () => {
  it("marks only the beta patches newer than the newest main release", () => {
    expect([...betaOnlyTags(PATCHES)].sort()).toEqual(["0.109.1", "0.111.0"]);
  });

  it("clears the badge once a main release passes those patches", () => {
    const later = [patch("0.112.0", "Major Update #3 - v0.112.0"), ...PATCHES];
    expect(betaOnlyTags(later).size).toBe(0);
  });

  it("compares versions by number, not by text", () => {
    const tags = betaOnlyTags([
      patch("0.100.0", "Beta Patch Notes - v0.100.0"),
      patch("0.99.1", "Hotfix Patch Notes - v0.99.1"),
    ]);
    expect([...tags]).toEqual(["0.100.0"]);
  });
});

describe("version helpers", () => {
  it("labels versions and leaves named patches alone", () => {
    expect(versionLabel("0.111.0")).toBe("v0.111.0");
    expect(versionLabel("May Bug Fixes")).toBe("May Bug Fixes");
  });

  it("reads the tag out of history version strings", () => {
    expect(versionTag("V0.111.0")).toBe("0.111.0");
    expect(versionTag("1.0.13")).toBe("1.0.13");
    expect(versionTag("0.99.0-beta")).toBe("0.99.0-beta");
    expect(versionTag("May Bug Fixes")).toBeNull();
    expect(versionTag(null)).toBeNull();
  });

  it("builds version page and entity paths", () => {
    expect(changelogPath("0.111.0")).toBe("/changelog/0.111.0");
    expect(entityPath("cards", "ALIGNMENT")).toBe("/cards/alignment");
    expect(entityPath("stories", "X")).toBeNull();
  });
});

describe("diff formatting", () => {
  it("hides ordering and raw template rows unless nothing else changed", () => {
    const order = { field: "compendium_order", old: "1", new: "2" };
    const raw = { field: "description_raw", old: "a", new: "b" };
    const cost = { field: "cost", old: "1", new: "2" };
    expect(shownChanges([order, raw, cost])).toEqual([cost]);
    expect(shownChanges([order])).toEqual([order]);
  });

  it("strips game markup from values and names empty ones", () => {
    expect(plainValue("Gain [gold]Block[/gold] and [energy:2].")).toBe(
      "Gain Block and 2 Energy.",
    );
    expect(plainValue("Gains Block for each [g...")).toBe(
      "Gains Block for each ...",
    );
    expect(plainValue("")).toBe("none");
    expect(plainValue(3)).toBe("3");
  });

  it("makes field paths readable", () => {
    expect(fieldLabel("damage_values.OneTwo.normal")).toBe(
      "Damage values · OneTwo · normal",
    );
  });

  it("escapes markup in official notes before converting BBCode", () => {
    const html = bbcodeToHtml(
      "[b]Fix[/b] <script>x</script>\n[url=javascript:alert(1)]bad[/url] [url=https://a.test]ok[/url]",
    );
    expect(html).toContain("<strong>Fix</strong>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://a.test"');
  });
});

describe("changelog fetches", () => {
  it("finds a site release on the main channel", async () => {
    stubApi((url) =>
      url.endsWith("/api/changelogs/1.3.1")
        ? json({ ...patch("1.3.1", "Site"), categories: [] })
        : json({}, 404),
    );
    expect((await fetchChangelog("1.3.1"))?.kind).toBe("site");
  });

  it("falls back to the game archive for a game patch", async () => {
    stubApi((url) =>
      url.endsWith("/api/changelogs/0.111.0?channel=beta")
        ? json({ ...patch("0.111.0", "Beta Patch Notes") })
        : json({ detail: "not found" }, 404),
    );
    const found = await fetchChangelog("0.111.0");
    expect(found?.kind).toBe("game");
    expect(found?.log.categories).toEqual([]);
  });

  it("returns null only when both channels answer 404", async () => {
    stubApi(() => json({ detail: "not found" }, 404));
    expect(await fetchChangelog("9.9.9")).toBeNull();
  });

  it("throws on an API error instead of reading it as a missing version", async () => {
    stubApi(() => new Response("", { status: 503 }));
    await expect(fetchChangelog("0.111.0")).rejects.toThrow("503");
    stubApi((url) =>
      url.includes("channel=beta")
        ? new Response("", { status: 429 })
        : json({}, 404),
    );
    await expect(fetchChangelog("0.111.0")).rejects.toThrow("429");
  });

  it("throws when the patch list fails or is malformed", async () => {
    stubApi(() => new Response("", { status: 500 }));
    await expect(fetchGamePatches()).rejects.toThrow("500");
    stubApi(() => json([{ id: "ALPHA" }]));
    await expect(fetchGamePatches()).rejects.toThrow("malformed");
  });

  it("gives the news page no link when the patch list fails", async () => {
    stubApi(() => new Response("", { status: 500 }));
    expect(await fetchLatestPatch()).toBeNull();
    stubApi(() => json(PATCHES));
    expect((await fetchLatestPatch())?.tag).toBe("0.111.0");
  });
});
