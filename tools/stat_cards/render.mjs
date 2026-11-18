import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, "../../frontend/public");
const API = (process.env.STAT_CARDS_API || "https://spire-codex.com").replace(/\/$/, "");
const CDN = (process.env.STAT_CARDS_CDN || "https://cdn.spire-codex.com").replace(/\/$/, "");
const OUT = path.resolve(process.env.STAT_CARDS_OUT || path.join(HERE, "out"));

const MIN_HEADLINE_RUNS = 100;
const MODE_COLORS = { blitz: "#34d399", standard: "#e8b830", dread: "#45cfd8" };

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : "";
}

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "spire-codex-stat-cards" } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

function versionKey(v) {
  return v.replace(/^v/, "").split(/[.-]/).map((p) => (/^\d+$/.test(p) ? Number(p) : -1));
}

function compareVersions(a, b) {
  const ka = versionKey(a);
  const kb = versionKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const d = (ka[i] ?? 0) - (kb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function pickMainVersion(statVersions, betaVersion) {
  const release = statVersions.filter((v) => /^v\d+\.\d+\.\d+$/.test(v));
  if (!betaVersion) return release.sort(compareVersions).pop() || "";
  const [bMajor, bMinor] = versionKey(betaVersion);
  const older = release.filter((v) => {
    const [major, minor] = versionKey(v);
    return major < bMajor || (major === bMajor && minor < bMinor);
  });
  return older.sort(compareVersions).pop() || "";
}

async function resolveVersions() {
  const typed = arg("versions")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((v) => (/^v/i.test(v) ? `v${v.slice(1)}` : `v${v}`));
  if (typed.length) return [...new Set(typed)].map((version) => ({ version, channel: "" }));
  const beta = (await getJson(`${API}/api/beta/version`)).beta_version || "";
  const listed = await getJson(`${API}/api/runs/versions`);
  const main = pickMainVersion(listed.stat_versions || [], beta);
  return [
    { version: beta, channel: "beta" },
    { version: main, channel: "main" },
  ].filter((v) => v.version);
}

async function bracketStats(bracket) {
  const data = await getJson(
    `${API}/api/runs/community-stats?bracket=${encodeURIComponent(bracket)}`,
  );
  return {
    bracket,
    runs: data.total_runs || 0,
    wins: data.total_wins || 0,
    abandoned: data.total_abandoned || 0,
    data_through: data.data_through || "",
    characters: (data.by_character || []).map((c) => ({
      id: c.id,
      name: (c.name || c.id).replace(/^The /, ""),
      runs: c.runs || 0,
      wins: c.wins || 0,
    })),
  };
}

async function epochArt(id) {
  try {
    const epoch = await getJson(`${API}/api/epochs/${id}?channel=beta`);
    const image = epoch.image_url || "";
    return image ? `${CDN}${image.replace("/static/images/", "/")}` : "";
  } catch {
    return "";
  }
}

const named = (channel, version) => (channel ? `${channel} ${version}` : version);
const slug = (channel, version) => (channel ? `${channel}-${version}` : version);
const rate = (row) => (row.runs ? (row.wins / row.runs) * 100 : 0);
const pct = (row) => `${rate(row).toFixed(1)}%`;
const num = (n) => n.toLocaleString("en-US");
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function oneIn(row) {
  if (!row.wins) return `No ${row.label} wins yet`;
  return `1 in ${Math.round(row.runs / row.wins)} ${row.label} runs ends in a win`;
}

function day(dataThrough) {
  const d = new Date(`${dataThrough.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function cardHtml(card) {
  const scale = Math.max(...card.rows.map(rate), 1) / 0.9;
  const height = card.rows.length > 4 ? 94 : 168;
  const compact = card.rows.length > 4;
  const rows = card.rows
    .map(
      (row) => `
 <div class="row">
  <div class="art" style="${row.art ? `background-image:url('${esc(row.art)}');` : ""}${row.artStyle || ""}"></div>
  <div class="info">
   <div class="top"><span class="name">${esc(row.label)}${row.note ? `<small>${esc(row.note)}</small>` : ""}</span><span class="pct" style="color:${row.color}">${pct(row)}</span></div>
   <div class="meta">${num(row.wins)} ${row.wins === 1 ? "win" : "wins"} / ${num(row.runs)} runs</div>
   <div class="bar"><i style="width:${((rate(row) / scale) * 100).toFixed(1)}%;background:${row.color}"></i></div>
  </div>
 </div>`,
    )
    .join("");
  const font = (name) => pathToFileURL(path.join(PUBLIC, "fonts", name)).href;
  const logo = pathToFileURL(path.join(PUBLIC, "spire-codex-white-final.png")).href;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Kreon;src:url('${font("kreon_regular.woff2")}');font-weight:400}
@font-face{font-family:Kreon;src:url('${font("kreon_bold.woff2")}');font-weight:700}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1080px;background:#0a1118;color:#e0ddd8;font-family:Kreon,serif;overflow:hidden}
.wrap{position:relative;width:1080px;height:1080px;padding:64px 72px 52px;display:flex;flex-direction:column}
.wrap:before{content:"";position:absolute;inset:0;background:radial-gradient(900px 520px at 85% -10%,rgba(232,184,48,.13),transparent 70%),radial-gradient(700px 500px at 0% 110%,rgba(69,207,216,.10),transparent 70%)}
.wrap>*{position:relative}
.brand{display:flex;align-items:center;gap:16px;font-size:30px;font-weight:700}
.brand img{height:54px}
.brand .tag{margin-left:auto;font-size:21px;font-weight:400;color:#bfc4ca;border:1px solid #2a4555;border-radius:999px;padding:7px 18px}
h1{margin-top:${compact ? 34 : 44}px;font-size:${compact ? 58 : 69}px;line-height:1.04;font-weight:700;color:#e8b830;letter-spacing:-.01em}
.sub{margin-top:${compact ? 12 : 18}px;font-size:${compact ? 24 : 27}px;line-height:1.35;color:#bfc4ca;max-width:860px}
.rows{margin-top:${compact ? 26 : 40}px;display:flex;flex-direction:column;gap:${compact ? 12 : 22}px}
.row{position:relative;height:${height}px;border-radius:14px;overflow:hidden;background:#132028;border:1px solid #1e3040;display:flex;align-items:center}
.art{position:absolute;inset:0 auto 0 0;width:330px;background-size:cover;background-position:center}
.art:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(19,32,40,0) 0%,rgba(19,32,40,.55) 55%,#132028 100%)}
.info{position:relative;margin-left:360px;flex:1;min-width:0;padding-right:36px}
.top{display:flex;align-items:baseline;justify-content:space-between}
.name{font-size:${compact ? 34 : 46}px;font-weight:700;line-height:1}
.name small{font-size:23px;font-weight:400;color:#b1b7be;margin-left:12px}
.pct{font-size:${compact ? 46 : 76}px;font-weight:700;line-height:.9;font-variant-numeric:tabular-nums}
.meta{margin-top:${compact ? 4 : 8}px;font-size:${compact ? 19 : 23}px;color:#b1b7be}
.bar{margin-top:${compact ? 8 : 14}px;height:${compact ? 8 : 12}px;border-radius:6px;background:#0a1118;overflow:hidden}
.bar i{display:block;height:100%;border-radius:6px}
.foot{margin-top:auto;padding-top:${compact ? 14 : 24}px;font-size:19.5px;line-height:1.45;color:#b1b7be;display:flex;justify-content:space-between;align-items:flex-end;gap:32px}
.foot b{color:#e8b830;font-weight:700;font-size:23px;white-space:nowrap}
</style></head><body><div class="wrap">
<div class="brand"><img src="${logo}"><span>Spire Codex</span><span class="tag">${esc(card.tag)}</span></div>
<h1>${esc(card.headline)}</h1>
<p class="sub">${esc(card.sub)}</p>
<div class="rows">${rows}</div>
<div class="foot"><span>${esc(card.foot)}</span><b>spire-codex.com/stats</b></div>
</div></body></html>`;
}

async function modesCard(version, channel) {
  const modes = [
    { id: "blitz", label: "Blitz", bracket: `solo:blitz:${version}`, art: await epochArt("blitz_epoch") },
    {
      id: "standard",
      label: "Standard",
      note: "Ascension 10",
      bracket: `solo:a10:standard:${version}`,
      art: `${CDN}/backgrounds/main_menu_bg.webp`,
      artStyle: "background-size:290% auto;background-position:100% 22%;",
    },
    { id: "dread", label: "Dread", bracket: `solo:dread:${version}`, art: await epochArt("dread_epoch") },
  ];
  const rows = [];
  for (const mode of modes) {
    const stats = await bracketStats(mode.bracket);
    rows.push({ ...mode, ...stats, color: MODE_COLORS[mode.id] });
  }
  if (!rows.some((r) => r.id !== "standard" && r.runs)) return null;
  const hardest = [...rows].filter((r) => r.runs).sort((a, b) => rate(a) - rate(b))[0];
  return {
    file: `modes-${slug(channel, version)}.png`,
    tag: `Slay the Spire 2 · ${named(channel, version)}`,
    headline: hardest.runs >= MIN_HEADLINE_RUNS ? oneIn(hardest) : "Win rates by mode so far",
    sub: "Solo win rates by mode.",
    foot: `Solo runs on ${named(channel, version)} uploaded to Spire Codex, all characters and all players. Abandoned runs count as not won. Data through ${day(rows[0].data_through)}.`,
    rows,
  };
}

async function charactersCard(version, channel) {
  const stats = await bracketStats(`solo:a10:standard:${version}`);
  const rows = stats.characters
    .filter((c) => c.runs)
    .sort((a, b) => rate(b) - rate(a))
    .map((c) => ({
      ...c,
      label: c.name,
      bracket: `solo:a10:standard:${c.id}:${version}`,
      art: `${CDN}/backgrounds/char_select_${c.id}.webp`,
      artStyle: "background-position:center 22%;",
      color: "#e8b830",
    }));
  if (!rows.length) return null;
  return {
    file: `characters-${slug(channel, version)}.png`,
    tag: `Slay the Spire 2 · ${named(channel, version)}`,
    headline: rows.every((r) => r.runs >= MIN_HEADLINE_RUNS)
      ? `${rows[0].label} wins most at Ascension 10`
      : "Ascension 10 win rates so far",
    sub: "Solo Ascension 10 win rate for each character.",
    foot: `Solo standard Ascension 10 runs on ${named(channel, version)} uploaded to Spire Codex, all players. Abandoned runs count as not won. Data through ${day(stats.data_through)}.`,
    rows,
  };
}

async function main() {
  const versions = await resolveVersions();
  console.log(versions.map((v) => named(v.channel, v.version)).join(", "));
  const cards = [];
  for (const { version, channel } of versions) {
    for (const build of [modesCard, charactersCard]) {
      const card = await build(version, channel);
      if (card) cards.push({ ...card, channel, version });
    }
  }
  if (!cards.length) throw new Error("no stats found for any card");

  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 2,
  });
  for (const card of cards) {
    const htmlPath = path.join(OUT, card.file.replace(/\.png$/, ".html"));
    await writeFile(htmlPath, cardHtml(card));
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, card.file) });
    console.log(`wrote ${card.file}`);
  }
  await browser.close();

  const flat = cards.flatMap((card) =>
    card.rows.map((row) => ({
      card: card.file,
      channel: card.channel,
      version: card.version,
      row: row.label,
      bracket: row.bracket,
      runs: row.runs,
      wins: row.wins,
      win_rate: Number(rate(row).toFixed(1)),
    })),
  );
  await writeFile(path.join(OUT, "stats.json"), JSON.stringify(flat, null, 2));
  const header = "card,channel,version,row,bracket,runs,wins,win_rate";
  const lines = flat.map((r) =>
    [r.card, r.channel, r.version, r.row, r.bracket, r.runs, r.wins, r.win_rate].join(","),
  );
  await writeFile(path.join(OUT, "stats.csv"), [header, ...lines].join("\n") + "\n");
  const table = [
    "| Card | Row | Wins | Runs | Win rate |",
    "|---|---|---|---|---|",
    ...flat.map((r) => `| ${r.card} | ${r.row} | ${r.wins} | ${r.runs} | ${r.win_rate}% |`),
  ].join("\n");
  await writeFile(path.join(OUT, "summary.md"), `${table}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
