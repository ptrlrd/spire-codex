import { describe, expect, it } from "vitest";
import { buildDetailPageJsonLd } from "./jsonld";

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
});
