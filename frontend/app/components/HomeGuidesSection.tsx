import Link from "next/link";
import { t } from "@/lib/ui-translations";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const REVALIDATE = 1800;

interface GuideStub {
  slug: string;
  title: string;
  author: string;
  date: string;
  category: string;
  difficulty?: string;
  character?: string;
  summary: string;
  tags?: string[];
}

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const ARROW = (
  <svg className="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

async function loadLatestGuides(): Promise<GuideStub[]> {
  try {
    const res = await fetch(`${API}/api/guides`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return [];
    const all = (await res.json()) as GuideStub[];
    // Newest first by date string (ISO yyyy-mm-dd sorts lexically).
    return [...all]
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 3);
  } catch {
    return [];
  }
}

export default async function HomeGuidesSection({
  langPrefix = "",
  lang = "eng",
}: {
  langPrefix?: string;
  lang?: string;
}) {
  const guides = await loadLatestGuides();
  if (guides.length === 0) return null;
  const guidesBase = `${langPrefix}/guides`;

  return (
    <div className="rvmp">
      <section className="hb">
        <div className="hsec">
          <div className="s-head">
            <h2>{t("Guides", lang)}</h2>
            <Link className="viewmore" href={guidesBase}>
              {t("View more", lang)} {ARROW}
            </Link>
          </div>

          <div className="newsrow">
            {guides.map((g) => {
              const difficulty = g.difficulty ? DIFFICULTY_LABEL[g.difficulty] ?? g.difficulty : null;
              return (
                <Link key={g.slug} href={`${guidesBase}/${g.slug}`} className="gcard">
                  <span className="gcard-k">
                    {g.category}
                    {difficulty ? ` · ${difficulty}` : ""}
                  </span>
                  <span className="gcard-t">{g.title}</span>
                  <span className="gcard-d">{g.summary}</span>
                  <span className="gcard-foot">
                    <span className="gcard-by">
                      By <span style={{ color: "var(--text-2)" }}>{g.author}</span>
                    </span>
                    <span className="gcard-more">{t("View more", lang)} {ARROW}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
