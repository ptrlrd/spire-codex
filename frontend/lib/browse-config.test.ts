import { describe, expect, it } from "vitest";
import { REPLAYS_BROWSE, RUNS_BROWSE, browseRowHref } from "./browse-config";

describe("browse configs", () => {
  it("send runs rows to the run page and replay rows to the viewer", () => {
    expect(browseRowHref(RUNS_BROWSE, "", "abc123")).toBe("/runs/abc123");
    expect(browseRowHref(REPLAYS_BROWSE, "", "abc123")).toBe(
      "/runs/abc123/replay",
    );
  });

  it("keep the beta prefix in front of the run path", () => {
    expect(browseRowHref(REPLAYS_BROWSE, "/beta", "abc123")).toBe(
      "/beta/runs/abc123/replay",
    );
  });

  it("point the replay browser at the replay endpoints", () => {
    expect(REPLAYS_BROWSE.endpoint).toBe("/api/replays");
    expect(REPLAYS_BROWSE.path).toBe("/replays");
    expect(RUNS_BROWSE.endpoint).toBe("/api/runs/list");
  });
});
