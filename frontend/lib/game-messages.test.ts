import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

const PACK = join(__dirname, "..", "..", "data", "eng", "messages.json");

function* leaves(
  node: unknown,
  path: string[] = [],
): Generator<[string, string]> {
  if (typeof node === "string") {
    yield [path.join("."), node];
  } else if (Array.isArray(node)) {
    for (const [i, v] of node.entries()) yield* leaves(v, [...path, String(i)]);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) yield* leaves(v, [...path, k]);
  }
}

describe("game message pack", () => {
  it.skipIf(!existsSync(PACK))(
    "every message parses as ICU MessageFormat",
    () => {
      const pack = JSON.parse(readFileSync(PACK, "utf8")) as Record<
        string,
        unknown
      >;
      const failures: string[] = [];
      let count = 0;
      for (const [key, text] of leaves(pack)) {
        count += 1;
        try {
          parse(text, { ignoreTag: true });
        } catch (e) {
          failures.push(`${key}: ${(e as Error).message}`);
        }
      }
      expect(count).toBeGreaterThan(1000);
      expect(failures.slice(0, 20)).toEqual([]);
      expect(failures).toHaveLength(0);
    },
  );

  it.skipIf(!existsSync(PACK))("keys never contain dots", () => {
    const pack = JSON.parse(readFileSync(PACK, "utf8")) as Record<
      string,
      unknown
    >;
    const bad: string[] = [];
    const walk = (node: unknown, path: string[]) => {
      if (node && typeof node === "object" && !Array.isArray(node)) {
        for (const [k, v] of Object.entries(node)) {
          if (k.includes(".")) bad.push([...path, k].join("/"));
          walk(v, [...path, k]);
        }
      }
    };
    walk(pack, []);
    expect(bad).toEqual([]);
  });
});
