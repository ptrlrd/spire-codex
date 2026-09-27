import { describe, expect, it } from "vitest";
import { parseOptionId, resolveEventOption } from "./event-option";

const events = {
  BRAIN_LEECH: {
    id: "BRAIN_LEECH",
    options: [{ id: "RIP", title: "Rip the Leech Off", description: "Ouch." }],
    pages: [
      {
        id: "INITIAL",
        options: [
          {
            id: "SHARE_KNOWLEDGE",
            title: "Share Knowledge",
            description: "Learn.",
          },
          { id: "RIP", title: "Rip the Leech Off", description: "Ouch." },
        ],
      },
    ],
  },
  NEOW: { id: "NEOW", options: null, pages: null },
};

describe("parseOptionId", () => {
  it("splits the hierarchical id into event, page and option", () => {
    expect(parseOptionId("BRAIN_LEECH.pages.INITIAL.options.RIP")).toEqual({
      event: "BRAIN_LEECH",
      page: "INITIAL",
      option: "RIP",
    });
    expect(parseOptionId("PROCEED")).toEqual({ option: "PROCEED" });
  });
});

describe("resolveEventOption", () => {
  it("names a page option from the viewer's catalog, description included", () => {
    expect(
      resolveEventOption(
        "BRAIN_LEECH.pages.INITIAL.options.SHARE_KNOWLEDGE",
        events,
      ),
    ).toEqual({ label: "Share Knowledge", desc: "Learn." });
  });

  it("falls back to the event's flat option list when the page is unknown", () => {
    expect(
      resolveEventOption("BRAIN_LEECH.pages.LATER.options.RIP", events),
    ).toEqual({
      label: "Rip the Leech Off",
      desc: "Ouch.",
    });
  });

  it("names Neow's relic offers through the relic catalog", () => {
    const relic = (id: string) =>
      id === "LEAD_PAPERWEIGHT"
        ? { name: "Lead Paperweight", description: "Pick 1 of 2." }
        : undefined;
    expect(
      resolveEventOption(
        "NEOW.pages.INITIAL.options.LEAD_PAPERWEIGHT",
        events,
        relic,
      ),
    ).toEqual({ label: "Lead Paperweight", desc: "Pick 1 of 2." });
  });

  it("keeps the recorded description only when it is already in the viewer's language", () => {
    const id = "BRAIN_LEECH.pages.INITIAL.options.RIP";
    expect(
      resolveEventOption(id, events, undefined, undefined, {
        label: "把它扯下来",
        desc: "失去5点生命值",
      }),
    ).toEqual({ label: "Rip the Leech Off", desc: "Ouch." });
    expect(
      resolveEventOption(id, events, undefined, undefined, {
        label: "Rip the Leech Off",
        desc: "Lose 5 HP.",
      }),
    ).toEqual({ label: "Rip the Leech Off", desc: "Lose 5 HP." });
  });

  it("translates the generic ids and gives up on anything else", () => {
    expect(
      resolveEventOption("PROCEED", events, undefined, (k) => `#${k}`),
    ).toEqual({
      label: "#Proceed",
    });
    expect(
      resolveEventOption("UNKNOWN_EVENT.pages.X.options.Y", events),
    ).toBeNull();
    expect(resolveEventOption(undefined, events)).toBeNull();
  });
});
