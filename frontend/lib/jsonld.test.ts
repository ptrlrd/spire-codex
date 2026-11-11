import { describe, expect, it } from "vitest";
import { buildDetailPageJsonLd, buildGuideArticleJsonLd } from "./jsonld";

describe("detail page JSON-LD", () => {
  it("describes an entity page as an ItemPage about a game thing, not an article", () => {
    const [page, crumbs] = buildDetailPageJsonLd({
      name: "Grand Finale",
      description: "Deal 60 damage to ALL enemies.",
      path: "/cards/grand_finale",
      imageUrl: "https://cdn.spire-codex.com/cards/grand_finale.webp",
      category: "Card",
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Cards", href: "/cards" },
        { name: "Grand Finale", href: "/cards/grand_finale" },
      ],
    }) as [Record<string, unknown>, Record<string, unknown>];
    expect(page["@type"]).toBe("ItemPage");
    expect(page.name).toBe("Grand Finale");
    expect(page.image).toBe(
      "https://cdn.spire-codex.com/cards/grand_finale.webp",
    );
    const entity = page.mainEntity as Record<string, unknown>;
    expect(entity["@type"]).toBe("Thing");
    expect(entity.additionalType).toBe("Slay the Spire 2 Card");
    expect(JSON.stringify(page)).not.toContain("Article");
    expect(crumbs["@type"]).toBe("BreadcrumbList");
  });

  it("carries only the dates it is given", () => {
    const base = {
      name: "Grand Finale",
      description: "Deal 60 damage to ALL enemies.",
      path: "/cards/grand_finale",
      category: "Card",
      breadcrumbs: [{ name: "Home", href: "/" }],
    };
    const [undated] = buildDetailPageJsonLd(base) as [Record<string, unknown>];
    expect(undated).not.toHaveProperty("datePublished");
    expect(undated).not.toHaveProperty("dateModified");
    expect(JSON.stringify(undated)).not.toContain("2026-01-01");
    const [dated] = buildDetailPageJsonLd({
      ...base,
      dateModified: "2026-10-18T00:00:00.000Z",
    }) as [Record<string, unknown>];
    expect(dated.dateModified).toBe("2026-10-18T00:00:00.000Z");
    expect(dated).not.toHaveProperty("datePublished");
  });
});

describe("guide JSON-LD", () => {
  const guide = {
    title: "Ironclad basics",
    summary: "How to start.",
    path: "/guides/ironclad-basics",
    category: "strategy",
    breadcrumbs: [{ name: "Home", href: "/" }],
  };

  it("is an Article with the guide's own dates and a person as author", () => {
    const [article, crumbs] = buildGuideArticleJsonLd({
      ...guide,
      author: "Yitsy",
      date: "2026-07-17",
      updated: "2026-07-28",
    }) as [Record<string, unknown>, Record<string, unknown>];
    expect(article["@type"]).toBe("Article");
    expect(article.headline).toBe("Ironclad basics");
    expect(article.datePublished).toBe("2026-07-17T00:00:00.000Z");
    expect(article.dateModified).toBe("2026-07-28T00:00:00.000Z");
    expect(article.author).toEqual({ "@type": "Person", name: "Yitsy" });
    expect(crumbs["@type"]).toBe("BreadcrumbList");
  });

  it("credits site-authored guides to the site and falls back to the publish date", () => {
    const [article] = buildGuideArticleJsonLd({
      ...guide,
      author: "Spire Codex",
      date: "2026-07-16",
      updated: null,
    }) as [Record<string, unknown>];
    expect((article.author as Record<string, unknown>)["@type"]).toBe(
      "Organization",
    );
    expect((article.author as Record<string, unknown>).name).toBe(
      "Spire Codex",
    );
    expect(article.dateModified).toBe("2026-07-16T00:00:00.000Z");
  });

  it("leaves a date out instead of inventing one", () => {
    const [article] = buildGuideArticleJsonLd({
      ...guide,
      author: "Yitsy",
      date: "not a date",
    }) as [Record<string, unknown>];
    expect(article).not.toHaveProperty("datePublished");
    expect(article).not.toHaveProperty("dateModified");
  });
});
