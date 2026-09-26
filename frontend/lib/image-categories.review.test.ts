import { describe, expect, it } from "vitest";
import {
  categoryDescription,
  categoryLabel,
  folderLabel,
} from "./image-categories";

describe("image gallery labels and prototype property names", () => {
  it("treats prototype property names as ordinary unknown API values", () => {
    expect(categoryLabel("constructor", "deu")).toBe("Constructor");
    expect(categoryDescription("constructor", "deu")).toBeNull();
    expect(folderLabel("__proto__", "fra")).toBe("Proto");
    expect(folderLabel("toString", "eng")).toBe("ToString");
  });
});
