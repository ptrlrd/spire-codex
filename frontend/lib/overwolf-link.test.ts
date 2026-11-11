import { describe, expect, it } from "vitest";
import { overwolfIdFromToken } from "./overwolf-link";

function token(claims: unknown): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `e30.${body}.sig`;
}

describe("overwolfIdFromToken", () => {
  it("reads the Overwolf user id from the token", () => {
    expect(overwolfIdFromToken(token({ sub: "b779116f-e976", exp: 1 }))).toBe(
      "b779116f-e976",
    );
  });

  it("returns null for anything that is not a token with a user id", () => {
    expect(overwolfIdFromToken("")).toBeNull();
    expect(overwolfIdFromToken("not-a-token")).toBeNull();
    expect(overwolfIdFromToken("a.%%%.c")).toBeNull();
    expect(overwolfIdFromToken(token({ exp: 1 }))).toBeNull();
    expect(overwolfIdFromToken(token({ sub: 42 }))).toBeNull();
    expect(overwolfIdFromToken(token({ sub: "  " }))).toBeNull();
  });
});
