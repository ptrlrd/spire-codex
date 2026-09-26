import { describe, expect, it } from "vitest";
import { collectPages } from "./generate-site-pages.mjs";

describe("the site page inventory walks the locale tree", () => {
  const paths = collectPages().map((p) => p.path);

  it("finds the real pages under app/[locale]", () => {
    expect(paths).toContain("/cards");
    expect(paths).toContain("/runs");
    expect(paths).toContain("/leaderboards/stats");
    expect(paths.length).toBeGreaterThan(30);
  });

  it("leaves out dynamic routes, the operator panel and the hidden labs", () => {
    expect(paths.some((p) => p.includes("["))).toBe(false);
    expect(paths.some((p) => p === "/admin" || p.startsWith("/admin/"))).toBe(
      false,
    );
    expect(paths).not.toContain("/seed-lab");
    expect(paths).not.toContain("/deck-lab");
    expect(paths).not.toContain("/");
  });
});
