import { describe, expect, it } from "vitest";
import { parseQuery, queryParams } from "./run-query";

describe("queryParams", () => {
  it("maps expression filters to API params", () => {
    const { filters } = parseQuery(
      "char:ironclad asc:3-7 card:bash card:anger result:win version:v0.104.0-v0.106.0",
    );
    const p = queryParams(filters, ["v0.106.0", "v0.105.0", "v0.104.0"]);
    expect(p.get("character")).toBe("IRONCLAD");
    expect(p.get("ascension_min")).toBe("3");
    expect(p.get("ascension_max")).toBe("7");
    expect(p.get("card")).toBe("bash,anger");
    expect(p.get("win")).toBe("true");
    expect(p.get("build_ids")).toBe("v0.106.0,v0.105.0,v0.104.0");
  });

  it("leaves user and free text to the caller", () => {
    const { filters, rest } = parseQuery("user:bob something");
    expect(queryParams(filters, []).toString()).toBe("");
    expect(rest).toBe("something");
  });
});
