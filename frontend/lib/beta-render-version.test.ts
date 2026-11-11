import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BETA_RENDER_VERSION_FALLBACK,
  getBetaRenderVersion,
  normalizeBetaRenderVersion,
  peekBetaRenderVersion,
  resetBetaRenderVersionForTests,
  seedBetaRenderVersion,
  setBetaRenderVersion,
  subscribeBetaRenderVersion,
} from "./beta-render-version";
import { fetchBetaRenderVersion } from "./beta-render-version.server";
import { cardImageChain } from "./card-fallback";
import { cardOgImages, enchantedCardUrl, fullCardUrl } from "./image-url";

beforeEach(() => resetBetaRenderVersionForTests());
afterEach(() => vi.unstubAllGlobals());

describe("normalizeBetaRenderVersion", () => {
  it("strips the v prefix and the beta suffix", () => {
    expect(normalizeBetaRenderVersion("v0.112.0")).toBe("0.112.0");
    expect(normalizeBetaRenderVersion("v0.112.0-beta")).toBe("0.112.0");
    expect(normalizeBetaRenderVersion("0.112.1")).toBe("0.112.1");
  });

  it("rejects empty and path-like values", () => {
    expect(normalizeBetaRenderVersion(null)).toBeNull();
    expect(normalizeBetaRenderVersion("")).toBeNull();
    expect(normalizeBetaRenderVersion("../x")).toBeNull();
    expect(normalizeBetaRenderVersion("0.1/2")).toBeNull();
  });
});

describe("beta render version store", () => {
  it("falls back to the literal until a version is set", () => {
    expect(peekBetaRenderVersion()).toBeNull();
    expect(getBetaRenderVersion()).toBe(BETA_RENDER_VERSION_FALLBACK);
    expect(fullCardUrl("abundance", false, "beta")).toContain(
      `/cards-full/beta/${BETA_RENDER_VERSION_FALLBACK}/abundance.webp`,
    );
  });

  it("notifies subscribers once per real change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeBetaRenderVersion(listener);
    setBetaRenderVersion("v0.112.0");
    setBetaRenderVersion("0.112.0");
    setBetaRenderVersion(null);
    setBetaRenderVersion("../x");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getBetaRenderVersion()).toBe("0.112.0");
    unsubscribe();
    setBetaRenderVersion("v0.113.0");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("seeds only when nothing fresher is set", () => {
    seedBetaRenderVersion("v0.112.0");
    expect(getBetaRenderVersion()).toBe("0.112.0");
    setBetaRenderVersion("v0.113.0");
    seedBetaRenderVersion("v0.112.0");
    expect(getBetaRenderVersion()).toBe("0.113.0");
  });
});

describe("beta render urls", () => {
  it("follow the store when no version is passed", () => {
    setBetaRenderVersion("v0.112.0");
    expect(fullCardUrl("abundance", true, "beta", "deu")).toContain(
      "/cards-full/beta/0.112.0/deu/abundance_upg.webp",
    );
    expect(enchantedCardUrl("abundance", "sharp", false, "beta")).toContain(
      "/cards-full/beta/0.112.0/ench/sharp/abundance.webp",
    );
    expect(fullCardUrl("abundance")).toContain("/cards-full/stable/");
  });

  it("use an explicit version over the store", () => {
    setBetaRenderVersion("v0.112.0");
    expect(fullCardUrl("abundance", false, "beta", "eng", "0.120.0")).toContain(
      "/cards-full/beta/0.120.0/abundance.webp",
    );
    expect(
      enchantedCardUrl("abundance", "sharp", false, "beta", "eng", "0.120.0"),
    ).toContain("/cards-full/beta/0.120.0/ench/sharp/abundance.webp");
    const og = cardOgImages(
      {
        id: "ABUNDANCE",
        name: "Abundance",
        image_url_card: "x",
        image_url_card_upg: "y",
      },
      "eng",
      "beta",
      "0.120.0",
    );
    expect(og.map((i) => i.url)).toEqual([
      expect.stringContaining("/cards-full/beta/0.120.0/abundance.webp"),
      expect.stringContaining("/cards-full/beta/0.120.0/abundance_upg.webp"),
    ]);
    const chain = cardImageChain("abundance", {
      channel: "beta",
      enchantment: "sharp",
      lang: "deu",
      betaVersion: "0.120.0",
    });
    expect(chain.length).toBe(4);
    expect(chain.every((u) => u.includes("/beta/0.120.0/"))).toBe(true);
    const stable = cardImageChain("abundance", { betaVersion: "0.120.0" });
    expect(stable.at(-1)).toContain("/cards-full/beta/0.120.0/abundance.webp");
  });
});

describe("fetchBetaRenderVersion", () => {
  const stub = (impl: () => Promise<unknown>) =>
    vi.stubGlobal("fetch", vi.fn(impl));

  it("prefers render_version over beta_version", async () => {
    stub(async () => ({
      ok: true,
      json: async () => ({
        beta_version: "v0.112.1",
        render_version: "v0.112.0",
      }),
    }));
    expect(await fetchBetaRenderVersion()).toBe("0.112.0");
  });

  it("uses beta_version when there is no render_version", async () => {
    stub(async () => ({
      ok: true,
      json: async () => ({ beta_version: "v0.112.1" }),
    }));
    expect(await fetchBetaRenderVersion()).toBe("0.112.1");
  });

  it("falls back to the literal when the API is unreachable or empty", async () => {
    stub(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await fetchBetaRenderVersion()).toBe(BETA_RENDER_VERSION_FALLBACK);
    stub(async () => ({ ok: false, json: async () => ({}) }));
    expect(await fetchBetaRenderVersion()).toBe(BETA_RENDER_VERSION_FALLBACK);
    stub(async () => ({
      ok: true,
      json: async () => ({ beta_version: null }),
    }));
    expect(await fetchBetaRenderVersion()).toBe(BETA_RENDER_VERSION_FALLBACK);
  });
});
