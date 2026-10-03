import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

function run(path: string) {
  const res = proxy(new NextRequest(`https://spire-codex.com${path}`));
  const rewrite = res.headers.get("x-middleware-rewrite");
  const location = res.headers.get("location");
  return {
    status: res.status,
    rewrite: rewrite
      ? new URL(rewrite).pathname + new URL(rewrite).search
      : null,
    location: location
      ? new URL(location).pathname + new URL(location).search
      : null,
  };
}

describe("locale routing", () => {
  it("serves English from the bare URL by rewriting into the eng segment", () => {
    expect(run("/")).toMatchObject({ rewrite: "/eng" });
    expect(run("/cards/bash")).toMatchObject({ rewrite: "/eng/cards/bash" });
    expect(run("/leaderboards?bracket=a20")).toMatchObject({
      rewrite: "/eng/leaderboards?bracket=a20",
    });
  });

  it("redirects an explicit eng prefix to the bare canonical", () => {
    expect(run("/eng/cards")).toMatchObject({
      status: 308,
      location: "/cards",
    });
    expect(run("/eng")).toMatchObject({ status: 308, location: "/" });
  });

  it("passes other locales straight through", () => {
    expect(run("/jpn/cards/bash")).toMatchObject({
      rewrite: null,
      location: null,
    });
    expect(run("/jpn")).toMatchObject({ rewrite: null, location: null });
  });

  it("redirects moved stats pages in every prefix form", () => {
    expect(run("/community-stats?bracket=a10")).toMatchObject({
      status: 301,
      location: "/stats?bracket=a10",
    });
    expect(run("/jpn/leaderboards/metrics")).toMatchObject({
      status: 301,
      location: "/jpn/stats/cards",
    });
    expect(run("/beta/leaderboards/elo")).toMatchObject({
      status: 301,
      location: "/beta/top-players",
    });
    expect(run("/deu/beta/charts")).toMatchObject({
      status: 301,
      location: "/deu/beta/stats/charts",
    });
    expect(run("/leaderboards/submit/")).toMatchObject({
      status: 301,
      location: "/runs/submit",
    });
    expect(run("/leaderboards")).toMatchObject({
      rewrite: "/eng/leaderboards",
    });
  });

  it("sends localized URLs of English-only sections to the English page", () => {
    expect(run("/jpn/admin")).toMatchObject({
      status: 308,
      location: "/admin",
    });
    expect(run("/deu/tier-list/cards?color=red")).toMatchObject({
      rewrite: null,
      location: null,
    });
    expect(run("/deu/meta")).toMatchObject({
      status: 301,
      location: "/deu/stats",
    });
    expect(run("/meta")).toMatchObject({
      status: 301,
      location: "/stats",
    });
    expect(run("/seed-lab")).toMatchObject({
      status: 308,
      location: "/seed-finder",
    });
    expect(run("/jpn/seed-lab?deck=BASH")).toMatchObject({
      status: 308,
      location: "/jpn/seed-finder?deck=BASH",
    });
    expect(run("/deck-lab")).toMatchObject({
      status: 308,
      location: "/deck-builder",
    });
    expect(run("/deu/deck-lab?character=DEFECT&deck=ZAP")).toMatchObject({
      status: 308,
      location: "/deu/deck-builder?character=DEFECT&deck=ZAP",
    });
    expect(run("/seed-lab/")).toMatchObject({
      status: 308,
      location: "/seed-finder",
    });
    expect(run("/deu/deck-lab/")).toMatchObject({
      status: 308,
      location: "/deu/deck-builder",
    });
    expect(run("/deu/tier-list")).toMatchObject({
      rewrite: null,
      location: null,
    });
    expect(run("/fra/timeline/act-1")).toMatchObject({
      status: 308,
      location: "/timeline/act-1",
    });
    expect(run("/fra/timeline")).toMatchObject({
      rewrite: null,
      location: null,
    });
  });
});

describe("beta section", () => {
  it("rewrites beta pages onto the main tree with the channel query", () => {
    expect(run("/beta/relics")).toMatchObject({
      rewrite: "/eng/relics?channel=beta",
    });
    expect(run("/jpn/beta/monsters/cultist")).toMatchObject({
      rewrite: "/jpn/monsters/cultist?channel=beta",
    });
  });

  it("keeps the real beta routes, only adding the locale segment", () => {
    expect(run("/beta")).toMatchObject({ rewrite: "/eng/beta" });
    expect(run("/beta/cards/bash")).toMatchObject({
      rewrite: "/eng/beta/cards/bash",
    });
    expect(run("/jpn/beta")).toMatchObject({ rewrite: null, location: null });
  });
});

describe("existing redirects", () => {
  it("lowercases entity slugs before anything else", () => {
    expect(run("/cards/BASH")).toMatchObject({
      status: 308,
      location: "/cards/bash",
    });
    expect(run("/jpn/beta/relics/Anchor")).toMatchObject({
      status: 308,
      location: "/jpn/beta/relics/anchor",
    });
  });

  it("canonicalises encoded Steam news URLs to the gid", () => {
    const encoded = encodeURIComponent(
      "https://store.steampowered.com/news/app/2868840/view/123456789",
    );
    expect(run(`/news/${encoded}`)).toMatchObject({
      status: 308,
      location: "/news/123456789",
    });
    expect(run(`/jpn/news/${encoded}`)).toMatchObject({
      status: 308,
      location: "/jpn/news/123456789",
    });
  });
});

describe("matcher", () => {
  const pattern = new RegExp(
    "^" + config.matcher[0].replace(/^\/\((.*)\)$/, "/$1") + "$",
  );
  it("lets encoded legacy Steam news URLs (they contain dots) reach the redirect", () => {
    const encoded = encodeURIComponent(
      "https://store.steampowered.com/news/app/2868840/view/123456789",
    );
    expect(pattern.test(`/news/${encoded}`)).toBe(true);
    expect(run(`/news/${encoded}`)).toMatchObject({
      status: 308,
      location: "/news/123456789",
    });
  });
  it("still skips static files, route handlers and Next internals", () => {
    for (const p of [
      "/favicon.ico",
      "/sitemap.xml",
      "/robots.txt",
      "/api/cards",
      "/_next/static/x.js",
      "/.well-known/x",
    ])
      expect(pattern.test(p)).toBe(false);
    expect(pattern.test("/jpn/cards/bash")).toBe(true);
  });
  it("tags every rendered request with the locale header next-intl reads", () => {
    const res = proxy(new NextRequest("http://localhost/jpn/cards"));
    expect(res.headers.get("x-middleware-request-x-next-intl-locale")).toBe(
      "jpn",
    );
    const bare = proxy(new NextRequest("http://localhost/cards"));
    expect(bare.headers.get("x-middleware-request-x-next-intl-locale")).toBe(
      "eng",
    );
  });
});
