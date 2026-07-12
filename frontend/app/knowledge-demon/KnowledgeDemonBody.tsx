import { t } from "@/lib/ui-translations";

const SLASH_COMMANDS = [
  { cmd: "/card <name>", desc: "Cost, type, rarity, damage, keywords, upgrade text" },
  { cmd: "/relic <name>", desc: "Rarity, pool, description, shop price" },
  { cmd: "/monster <name>", desc: "HP ranges, moves, innate powers, attack patterns" },
  { cmd: "/potion <name>", desc: "Rarity, pool, resolved description" },
  { cmd: "/character <name>", desc: "Starting deck, relics, HP, energy" },
  { cmd: "/event <name>", desc: "Multi-page choices and branching outcomes" },
  { cmd: "/power <name>", desc: "Buff / debuff descriptions and stack behaviour" },
  { cmd: "/enchantment <name>", desc: "Card-type restrictions and stackability" },
  { cmd: "/lookup <query>", desc: "Cross-category fuzzy search across everything" },
  { cmd: "/meta", desc: "Live counts and patch info pulled from Spire Codex" },
];

const MODERATION = [
  "Warnings with escalation thresholds (mute, kick, ban)",
  "Automod for profile scanning and image spam detection",
  "Audit logging (message edits / deletes, joins / leaves, role changes)",
  "Forum moderation rules",
  "Welcome / leave messages",
  "Polls, suggestions, reminders, announcements",
];

export default function KnowledgeDemonBody({ lang }: { lang: string }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Knowledge</span>{" "}
        <span className="text-[var(--text-primary)]">Demon</span>
      </h1>
      <p className="text-[var(--text-secondary)] text-lg leading-relaxed mb-8">
        {t("A Discord bot for Slay the Spire 2 communities, with slash-command lookups for every card, relic, monster, potion, and event in the game, plus a full moderation toolkit. Powered by the Spire Codex API, so the data stays current with every patch.", lang)}
      </p>

      <div className="flex flex-wrap gap-3 mb-12">
        <a
          href="https://discord.com/oauth2/authorize?client_id=1492232191546228886&permissions=1494984439878&scope=bot+applications.commands"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold hover:opacity-90 transition-opacity"
        >
          {t("Invite to Server", lang)}
        </a>
        <a
          href="https://bot.spire-codex.com/auth/login"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-primary)] font-semibold hover:bg-[var(--bg-card-hover)] transition-colors"
        >
          {t("Knowledge Demon Dashboard", lang)}
        </a>
      </div>

      {/* Slash commands: the headline feature */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("Slay the Spire 2 lookups", lang)}
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          {t("Every command resolves through the public Spire Codex API, so a card looked up in Discord matches what you'd see on this site.", lang)}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SLASH_COMMANDS.map((c) => (
            <div
              key={c.cmd}
              className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4"
            >
              <code className="block text-sm font-mono text-[var(--accent-gold)] mb-1">
                {c.cmd}
              </code>
              <p className="text-sm text-[var(--text-secondary)]">{t(c.desc, lang)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Moderation */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("Moderation", lang)}
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
            {MODERATION.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden className="text-[var(--accent-gold)] shrink-0">→</span>
                <span>{t(item, lang)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* News feed */}
      <section>
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("News feed", lang)}
        </h2>
        <p className="text-[var(--text-secondary)]">
          {t("Polls RSS feeds you configure per guild and posts new entries to the channel of your choice. Add the Slay the Spire 2 Steam announcements feed (", lang)}
          <a
            href="https://store.steampowered.com/feeds/news/app/2868840/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-gold)] hover:underline break-all"
          >
            store.steampowered.com/feeds/news/app/2868840/
          </a>
          {t(") to get patch notes the moment Mega Crit ships them.", lang)}
        </p>
      </section>
    </div>
  );
}
