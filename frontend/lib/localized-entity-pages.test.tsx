import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/cards/[id]/CardDetail", () => ({ default: function CardDetail() { return null; } }));
vi.mock("@/app/events/[id]/EventDetail", () => ({ default: function EventDetail() { return null; } }));
vi.mock("@/app/components/JsonLd", () => ({ default: function JsonLd() { return null; } }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), permanentRedirect: vi.fn() }));

import CardDetail from "@/app/cards/[id]/CardDetail";
import EventDetail from "@/app/events/[id]/EventDetail";
import JsonLd from "@/app/components/JsonLd";
import CardPage from "@/app/[lang]/cards/[id]/page";
import EventPage from "@/app/[lang]/events/[id]/page";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function stubApi(handler: (url: string) => Response) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => handler(String(input))));
}

function healthy(url: string): Response {
  if (url.includes("/api/cards/")) return ok({ id: "BASH", name: "Heurt", description: "Frappe.", rarity: "Basic", type: "Attack", color: "IRONCLAD", cost: 2 });
  if (url.includes("/api/events/")) return ok({ id: "TRIAL", name: "Le procès", description: "Un choix." });
  if (url.includes("/api/runs/stats/")) return ok({ picks: 10, win_rate: 0.5, total_runs: 100 });
  if (url.includes("/api/runs/community-stats")) return ok({ events: [{ id: "TRIAL", total: 12, options: [{ id: "A", count: 7 }, { id: "B", count: 5 }] }] });
  return new Response("", { status: 404 });
}

function elements(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => elements(n, out));
    return out;
  }
  const el = node as ReactElement<{ children?: ReactNode }>;
  out.push(el);
  elements(el.props?.children, out);
  return out;
}

const props = (lang: string, id: string) => ({ params: Promise.resolve({ lang, id }), searchParams: Promise.resolve({}) });

afterEach(() => vi.unstubAllGlobals());

describe("localized entity pages", () => {
  it("renders the community stats on a localized card page and emits no FAQ schema", async () => {
    stubApi(healthy);
    const tree = elements(await CardPage(props("fra", "bash")));
    const detail = tree.find((el) => el.type === CardDetail) as ReactElement<{ initialStats: unknown }> | undefined;
    expect(detail?.props.initialStats).toMatchObject({ picks: 10 });
    const jsonLd = tree.find((el) => el.type === JsonLd) as ReactElement<{ data: unknown }> | undefined;
    expect(JSON.stringify(jsonLd?.props.data)).not.toContain("FAQPage");
  });

  it("renders the vote distribution on a localized event page and emits no FAQ schema", async () => {
    stubApi(healthy);
    const tree = elements(await EventPage(props("fra", "trial")));
    const detail = tree.find((el) => el.type === EventDetail) as ReactElement<{ voteStats: unknown }> | undefined;
    expect(detail?.props.voteStats).toBeTruthy();
    const jsonLd = tree.find((el) => el.type === JsonLd) as ReactElement<{ data: unknown }> | undefined;
    expect(JSON.stringify(jsonLd?.props.data)).not.toContain("FAQPage");
  });

  it("still renders the entity when the stats endpoint fails", async () => {
    stubApi((url) => (url.includes("/api/runs/") ? new Response("", { status: 503 }) : healthy(url)));
    const tree = elements(await CardPage(props("fra", "bash")));
    const detail = tree.find((el) => el.type === CardDetail) as ReactElement<{ initialStats: unknown }> | undefined;
    expect(detail).toBeTruthy();
    expect(detail?.props.initialStats).toBeNull();
  });
});
