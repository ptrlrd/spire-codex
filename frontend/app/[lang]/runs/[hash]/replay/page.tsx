import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ lang: string; hash: string }> };

// Replays are English game data like the run pages; collapse every
// /<lang>/runs/<hash>/replay onto the canonical URL.
export default async function LangReplayRedirect({ params }: Props) {
  const { hash } = await params;
  permanentRedirect(`/runs/${hash}/replay`);
}
