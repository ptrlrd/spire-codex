export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">
        <span className="text-[var(--accent-gold)]">About</span>{" "}
        <span className="text-[var(--text-primary)]">Spire Codex</span>
      </h1>

      <div className="space-y-6 text-[var(--text-secondary)] leading-relaxed">
        <p>
          I&apos;ve been loving Slay the Spire 2 and got extremely curious about how the game was
          built. I wanted to build an API of all of the data, which then led me to just consuming the
          API and making a cute little frontend for it.
        </p>

        <p>
          The reason I built it is because I feel that StS didn&apos;t really have a lot of good resources
          for new players — I am relatively new to the Spire series with about 40 hours on both
          PC/mobile.
        </p>

        <p>
          This is purely for educational purposes and shouldn&apos;t be used to recompile the game and
          get it for free.
        </p>

        <h2 className="text-xl font-semibold text-[var(--text-primary)] pt-4">
          Roadmap
        </h2>

        <ul className="space-y-3">
          <li className="flex gap-3">
            <span className="text-[var(--accent-gold)] flex-shrink-0">-</span>
            <span>
              Automate the decompilation process so I can extract everything quickly and update the
              API to always be current (or hoping the devs make an API that makes this project
              null-void)
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-[var(--accent-gold)] flex-shrink-0">-</span>
            <span>
              Powers/buffs/debuffs — there are 262 power models in the game files waiting to be parsed
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-[var(--accent-gold)] flex-shrink-0">-</span>
            <span>
              More images — card art, enchantment icons, and encounter scene images from the
              game&apos;s extracted assets
            </span>
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-[var(--text-primary)] pt-4">
          How It Works
        </h2>

        <p>
          Slay the Spire 2 is built with Godot 4 but all the game logic lives in a C#/.NET 8 DLL.
          The data pipeline works like this:
        </p>

        <ol className="space-y-2 list-decimal list-inside">
          <li>Extract the Godot PCK file to get images, animations, and localization data</li>
          <li>Decompile the C# DLL with ILSpy to get all game models</li>
          <li>Python parsers extract card stats, monster data, relic effects, etc. from the decompiled source</li>
          <li>A FastAPI backend serves the parsed data as a REST API</li>
          <li>This Next.js frontend consumes the API</li>
        </ol>

        <p>
          Monster sprites are Spine skeletal animations — we render the idle poses headlessly using
          the Spine runtime to generate the portrait images you see on the site.
        </p>

        <p>
          The entire project is open source and available on{" "}
          <a
            href="https://github.com/ptrlrd/spire-codex"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-gold)] hover:underline"
          >
            GitHub
          </a>
          . I tried to document everything needed to build it locally — it has some prerequisite
          knowledge like Docker and CLI exposure.
        </p>

        <h2 className="text-xl font-semibold text-[var(--text-primary)] pt-4">
          Get in Touch
        </h2>

        <p>
          If you want to chat about the project, have ideas, or just want to hang out, feel free to
          join the{" "}
          <a
            href="https://discord.gg/xMsTBeh"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-gold)] hover:underline"
          >
            Discord
          </a>
          . Found a bug or have a feature request? You can{" "}
          <a
            href="https://github.com/ptrlrd/spire-codex/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-gold)] hover:underline"
          >
            open an issue on GitHub
          </a>
          . Both are welcome!
        </p>
      </div>
    </div>
  );
}
