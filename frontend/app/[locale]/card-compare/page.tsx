import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import type { Card } from "@/lib/api/types";
import CardRender, { type CardEnchantment } from "@/app/components/CardRender";
import { enchantedCardUrl, fullCardUrl, imageUrl } from "@/lib/image-url";
import {
  ENCHANTMENT_RULES,
  enchantmentExtraText,
  enchantmentReplayText,
} from "@/app/components/card-render/Attachments";

const PICKS: Array<[string, string, boolean]> = [
  ["eng", "BASH", false],
  ["eng", "BASH", true],
  ["eng", "BACKSTAB", false],
  ["eng", "ZAP", false],
  ["eng", "DEMON_FORM", false],
  ["eng", "ASCENDERS_BANE", false],
  ["eng", "APOTHEOSIS", false],
  ["eng", "WHIRLWIND", false],
  ["eng", "NEUTRALIZE", true],
  ["jpn", "BASH", false],
  ["kor", "DEMON_FORM", false],
  ["zhs", "BACKSTAB", false],
  ["tha", "BASH", false],
  ["rus", "DEMON_FORM", false],
];

function load(lang: string, beta = false): Card[] {
  const p = beta
    ? path.join(
        process.cwd(),
        "..",
        "data-beta",
        "v0.113.0",
        lang,
        "cards.json",
      )
    : path.join(process.cwd(), "..", "data", lang, "cards.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadEnchantment(
  lang: string,
  id: string | undefined,
  amount: string | undefined,
  card: Card | undefined,
): CardEnchantment | undefined {
  if (!id) return undefined;
  const p = path.join(
    process.cwd(),
    "..",
    "data-beta",
    "v0.113.0",
    lang,
    "messages.json",
  );
  const messages = JSON.parse(fs.readFileSync(p, "utf8"));
  const key = id.toUpperCase();
  if (!messages.enchantments?.[key]) return undefined;
  const n = amount != null && amount !== "" ? Number(amount) : 1;
  const keywordNames: Record<string, string> = {};
  for (const k of ENCHANTMENT_RULES[key]?.add ?? []) {
    const title = messages.card_keywords?.[k.toUpperCase()]?.title;
    if (title) keywordNames[k] = title;
  }
  return {
    id: key,
    amount: n,
    extraText: enchantmentExtraText(
      messages.enchantments[key].extraCardText,
      key,
      n,
      card?.target,
      lang,
    ),
    replayText: enchantmentReplayText(
      messages.static_hover_tips?.REPLAY?.extraText,
      key,
      lang,
    ),
    keywordNames,
  };
}

function titleVariants(
  lang: string,
  id: string,
): Record<string, string> | undefined {
  const p = path.join(
    process.cwd(),
    "..",
    "data-beta",
    "v0.113.0",
    lang,
    "messages.json",
  );
  if (!fs.existsSync(p)) return undefined;
  const title = JSON.parse(fs.readFileSync(p, "utf8")).cards?.[id]?.title;
  return title && typeof title === "object" ? title : undefined;
}

const FONT_CSS =
  `@font-face{font-family:"GameFira";font-weight:400;src:url("/fonts/game-sub/fira-sans-extra-condensed-regular-game.woff2") format("woff2");}@font-face{font-family:"GameFira";font-weight:700;src:url("/fonts/game-sub/fira-sans-extra-condensed-regular-game.woff2") format("woff2");}@font-face{font-family:"GameNotoJP";font-weight:400;src:url("/fonts/game-sub/noto-sans-cjk-jp-regular-game.woff2") format("woff2");}@font-face{font-family:"GameNotoJP";font-weight:700;src:url("/fonts/game-sub/noto-sans-cjk-jp-regular-game.woff2") format("woff2");}@font-face{font-family:"GameGyeonggi";font-weight:400;src:url("/fonts/game-sub/gyeonggi-cheonnyeon-batang-bold-game.woff2") format("woff2");}@font-face{font-family:"GameGyeonggi";font-weight:700;src:url("/fonts/game-sub/gyeonggi-cheonnyeon-batang-bold-game.woff2") format("woff2");}@font-face{font-family:"GameThai";font-weight:400;src:url("/fonts/game-sub/cs-chat-thai-ui-game.woff2") format("woff2");}@font-face{font-family:"GameThai";font-weight:700;src:url("/fonts/game-sub/cs-chat-thai-ui-game.woff2") format("woff2");}@font-face{font-family:"GameNotoMonoSC";font-weight:400;src:url("/fonts/game-sub/noto-sans-mono-cjk-sc-regular-game.woff2") format("woff2");}@font-face{font-family:"GameNotoMonoSC";font-weight:700;src:url("/fonts/game-sub/noto-sans-mono-cjk-sc-regular-game.woff2") format("woff2");}@font-face{font-family:"GameNotoMonoTC";font-weight:400;src:url("/fonts/game-sub/noto-sans-mono-cjk-tc-regular-game.woff2") format("woff2");}@font-face{font-family:"GameNotoMonoTC";font-weight:700;src:url("/fonts/game-sub/noto-sans-mono-cjk-tc-regular-game.woff2") format("woff2");}@font-face{font-family:"GameYamama";font-weight:400;src:url("/fonts/game-sub/alyamama-regular-game.woff2") format("woff2");}@font-face{font-family:"GameYamama";font-weight:700;src:url("/fonts/game-sub/alyamama-regular-game.woff2") format("woff2");}`.replaceAll(
    "/fonts/game-sub/",
    imageUrl("/static/images/card-render/fonts/"),
  );

const GRID: Array<[string, string[]]> = [
  [
    "Energy and star icons in text",
    [
      "eng:ADRENALINE:0",
      "eng:BLOODLETTING:1",
      "eng:OFFERING:0",
      "eng:CHARGE_BATTERY:0",
      "eng:ENERGY_SURGE:1",
      "eng:BORROWED_TIME:1",
      "eng:KI_REST:1",
      "eng:ENCORE:0",
      "eng:BIG_BANG:0",
      "eng:CONVERGENCE:0",
      "eng:CHILD_OF_THE_STARS:0",
      "eng:THE_EMPEROR:0",
      "eng:CORRUPTION:0",
      "eng:BRIGHTEST_FLAME:0",
      "eng:VOID:0",
      "eng:MIDNIGHT:0",
      "eng:FLATTEN:0",
      "eng:PRODUCTION:0",
    ],
  ],
  [
    "One from each language",
    [
      "ara:OFFERING:0",
      "deu:ADRENALINE:1",
      "esp:BLOODLETTING:0",
      "fra:CHARGE_BATTERY:0",
      "ind:ENCORE:0",
      "ita:BIG_BANG:0",
      "jpn:KI_REST:1",
      "kor:BORROWED_TIME:0",
      "pol:CONVERGENCE:0",
      "ptb:TACTICIAN:0",
      "rus:FORGOTTEN_RITUAL:0",
      "spa:DEMESNE:0",
      "tha:SIDESTEP:1",
      "tur:POUNCE:0",
      "zhs:ENERGY_SURGE:0",
      "zht:OFFERING:1",
    ],
  ],
  [
    "Enchants",
    [
      "eng:FALLING_STAR:0:SHARP",
      "eng:BACKSTAB:1:CLONE",
      "eng:DEFEND_SILENT:1:GOOPY",
      "eng:COMET:1:SWIFT",
      "eng:ROYAL_GAMBLE:0:SOULS_POWER",
      "eng:BASH:0:TEZCATARAS_EMBER",
      "eng:CLOAK_OF_STARS:0:NIMBLE",
      "eng:BASH:0:VIGOROUS",
      "eng:ADRENALINE:0:SWIFT",
      "eng:CHARGE_BATTERY:0:NIMBLE",
      "eng:POUNCE:0:INSTINCT",
      "jpn:BASH:0:ADROIT",
      "rus:FALLING_STAR:0:ADROIT",
      "jpn:ASTRAL_PULSE:1:GLAM",
      "rus:ABUNDANCE:0:STEADY",
    ],
  ],
  [
    "Russian and Polish plurals",
    [
      "rus:ENSEMBLE:0",
      "rus:JACKPOT:1",
      "rus:CHARGE:0",
      "pol:HIDDEN_DAGGERS:0",
      "pol:JACKPOT:0",
      "pol:ENSEMBLE:1",
    ],
  ],
  [
    "Ancient and others",
    [
      "eng:APOTHEOSIS:0",
      "eng:WISH:1",
      "eng:LOST_LUTE:0",
      "eng:DINGY_DAGGER:0",
      "eng:WAH_SYMPHONY:0",
      "eng:DOUBT:0",
    ],
  ],
];

const ALL_LANGS = [
  "eng",
  "ara",
  "deu",
  "esp",
  "fra",
  "ind",
  "ita",
  "jpn",
  "kor",
  "pol",
  "ptb",
  "rus",
  "spa",
  "tha",
  "tur",
  "zhs",
  "zht",
];
const RENDER_VERSION = "0.113.0";

function customGrid(sp: Record<string, string | undefined>) {
  if (!sp.cards && !sp.langs) return GRID;
  const cards = (sp.cards ?? "BASH,OFFERING,DEMON_FORM")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const langs = sp.langs
    ? sp.langs.split(",").map((l) => l.trim().toLowerCase())
    : ALL_LANGS;
  const up = sp.up === "1" ? "1" : "0";
  const ench = sp.ench ? `:${sp.ench.toUpperCase()}` : "";
  return cards.map(
    (id) =>
      [
        `${id}${up === "1" ? "+" : ""}`,
        langs.map((l) => `${l}:${id}:${up}${ench}`),
      ] as [string, string[]],
  );
}

function GridView({ grid }: { grid: Array<[string, string[]]> }) {
  const cache: Record<string, Card[]> = {};
  return (
    <div
      style={{
        background: "#14141c",
        padding: 24,
        color: "#ddd",
        fontFamily: "sans-serif",
      }}
    >
      <style>{FONT_CSS}</style>
      <div style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>
        HTML on the left, game render on the right. Beta v0.113.0 data. Pick
        your own with ?grid=1&cards=BASH,ZAP&langs=jpn,kor&up=1&ench=SHARP
      </div>
      {grid.map(([heading, items]) => (
        <section key={heading}>
          <h2 style={{ fontSize: 20, margin: "28px 0 12px" }}>{heading}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
            {items.map((item) => {
              const [lang, id, up, ench] = item.split(":");
              cache[lang] ??= load(lang, true);
              const card = cache[lang].find((c) => c.id === id);
              const level = Number(up) || 0;
              const ref = ench
                ? enchantedCardUrl(
                    id,
                    ench,
                    !!level,
                    "beta",
                    lang,
                    RENDER_VERSION,
                  )
                : fullCardUrl(id, !!level, "beta", lang, RENDER_VERSION);
              return (
                <div key={item}>
                  <div style={{ fontSize: 12, color: "#aaa", marginBottom: 4 }}>
                    {lang} {id}
                    {level ? "+" : ""}
                    {ench ? ` with ${ench}` : ""}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <div
                      style={{
                        position: "relative",
                        width: 400,
                        height: 520,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          transform: "translate(60px, 65px)",
                        }}
                      >
                        {card ? (
                          <CardRender
                            card={card}
                            width={300}
                            upgraded={!!level}
                            upgradeLevel={level}
                            titleVariants={titleVariants(lang, card.id)}
                            lang={lang}
                            enchantment={loadEnchantment(lang, ench, "1", card)}
                          />
                        ) : (
                          <span style={{ color: "red" }}>missing card</span>
                        )}
                      </div>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ref} alt="" width={400} height={520} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; w?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const w = Number(sp.w ?? 300);
  const picks = sp.ids
    ? sp.ids.split(",").map((s) => {
        const [lang, id, up] = s.split(":");
        return [lang, id.toUpperCase(), up === "1"] as [
          string,
          string,
          boolean,
        ];
      })
    : PICKS;
  if ((sp as { grid?: string }).grid === "1")
    return (
      <GridView grid={customGrid(sp as Record<string, string | undefined>)} />
    );
  const cache: Record<string, Card[]> = {};
  const one = (sp as { one?: string }).one;
  if (one) {
    const [lang, id, up, enchantId, enchantAmount] = one.split(":");
    const q = sp as { beta?: string };
    const card = load(lang, q.beta === "1").find(
      (c) => c.id === id.toUpperCase(),
    );
    if (!card) return <div>missing</div>;
    const big = q.beta === "1" && (sp as { small?: string }).small !== "1";
    return (
      <div
        id="box"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: big ? 367 : 400,
          height: big ? 458 : 520,
          zIndex: 99999,
          background: "#14141c",
        }}
      >
        <style>{FONT_CSS}</style>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translate(${big ? 33.5 : 60}px, ${big ? 18 : 65}px)`,
          }}
        >
          <CardRender
            card={card}
            width={300}
            upgraded={!!Number(up)}
            upgradeLevel={Number(up) || 0}
            titleVariants={titleVariants(lang, card.id)}
            lang={lang}
            tune={JSON.parse((sp as { tune?: string }).tune ?? "{}")}
            enchantment={loadEnchantment(lang, enchantId, enchantAmount, card)}
          />
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        background: "#14141c",
        padding: 24,
        display: "flex",
        flexWrap: "wrap",
        gap: 32,
      }}
    >
      {picks.map(([lang, id, up], i) => {
        cache[lang] ??= load(lang);
        const card = cache[lang].find((c) => c.id === id);
        if (!card)
          return (
            <div key={i} style={{ color: "red" }}>
              missing {lang} {id}
            </div>
          );
        const seg = lang === "eng" ? "" : `${lang}/`;
        const game = `https://cdn.spire-codex.com/cards-full/stable/${seg}${id.toLowerCase()}${up ? "_upg" : ""}.webp`;
        return (
          <div key={i} style={{ color: "#aaa", fontSize: 12 }}>
            <div style={{ marginBottom: 8 }}>
              {lang} {id}
              {up ? "+" : ""} · html | game
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div
                style={{
                  width: w * 1.3333,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <CardRender card={card} width={w} upgraded={up} lang={lang} />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={game} alt="" style={{ width: w * 1.3333 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
