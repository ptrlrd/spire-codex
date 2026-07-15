import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/seo";

// RFC 9727 api-catalog: a linkset (RFC 9264) describing the site's public
// API so agents and API clients can discover it from the well-known URI
// (advertised via the homepage's Link header in next.config.ts).
export const dynamic = "force-static";

export function GET() {
  const linkset = {
    linkset: [
      {
        anchor: `${SITE_URL}/api`,
        "service-desc": [
          {
            href: `${SITE_URL}/openapi.json`,
            type: "application/json",
            title: "Spire Codex API (OpenAPI 3)",
          },
        ],
        "service-doc": [
          {
            href: `${SITE_URL}/developers`,
            type: "text/html",
            title: "Spire Codex developer documentation",
          },
        ],
        "service-meta": [
          {
            href: `${SITE_URL}/llms.txt`,
            type: "text/plain",
            title: "Site overview for AI agents (llms.txt)",
          },
        ],
        describes: [
          {
            href: `${SITE_URL}/`,
            type: "text/html",
          },
        ],
      },
    ],
  };
  return NextResponse.json(linkset, {
    headers: {
      "Content-Type": "application/linkset+json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
