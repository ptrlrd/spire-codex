"use client";

import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Card = { id: string };
type Player = {
  character: string;
  current_hp: number;
  max_hp: number;
  block: number;
  energy: number;
  hand: Card[];
};
type Enemy = { id: string; current_hp: number; max_hp: number; block: number };
type Position = {
  schema: string;
  build_id: string;
  seed: string;
  turn: number;
  players: Player[];
  enemies: Enemy[];
};
type Line = {
  actions: Record<string, unknown>[];
  lethal: boolean;
  damage: number;
  block: number;
  energy: number;
};
type Solution = {
  exhaustive: boolean;
  states_examined: number;
  elapsed_ms: number;
  lines: Line[];
};

function actionLabel(action: Record<string, unknown>): string {
  if (typeof action.play === "number") {
    const target =
      typeof action.target === "number" ? ` → enemy ${action.target + 1}` : "";
    return `Play hand slot ${action.play + 1}${target}`;
  }
  if (typeof action.potion === "number") return `Potion ${action.potion + 1}`;
  return "End turn";
}

export default function SandboxClient() {
  const [text, setText] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function solve() {
    setError("");
    setSolution(null);
    let parsed: Position;
    try {
      parsed = JSON.parse(text) as Position;
      if (
        !parsed.schema?.startsWith("sandbox_position/") ||
        !Array.isArray(parsed.players) ||
        !Array.isArray(parsed.enemies)
      ) {
        throw new Error("Choose a sandbox position exported by Spire Codex.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid JSON");
      return;
    }
    setPosition(parsed);
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/sandbox/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Solver failed");
      setSolution(result as Solution);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Solver failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-[var(--text-primary)]">
      <h1 className="text-3xl font-semibold">Combat Sandbox</h1>
      <p className="mt-3 text-[var(--text-secondary)]">
        Press F7 during a settled player turn with the Spire Codex mod, then
        paste the copied position or open its JSON file. The solver ranks plays
        for the current turn.
      </p>
      <label className="mt-8 block font-medium" htmlFor="sandbox-position">
        Combat position
      </label>
      <textarea
        id="sandbox-position"
        className="mt-2 h-44 w-full rounded border border-[var(--border-accent)] bg-[var(--bg-primary)] p-3 font-mono text-sm"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder='{"schema":"sandbox_position/3", ...}'
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          aria-label="Open sandbox JSON file"
          type="file"
          accept="application/json,.json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) setText(await file.text());
          }}
        />
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={solve}
          className="rounded bg-[var(--accent-gold)] px-5 py-2 font-semibold text-[var(--bg-primary)] disabled:opacity-50"
        >
          {busy ? "Solving…" : "Solve this turn"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-[var(--danger)]">
          {error}
        </p>
      )}
      {position && (
        <section className="mt-8 rounded border border-[var(--border-subtle)] p-5">
          <h2 className="text-xl font-semibold">
            {position.seed} · {position.build_id} · turn {position.turn}
          </h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              {position.players.map((player, index) => (
                <div key={index} className="mb-3">
                  <strong>{player.character}</strong> · {player.current_hp}/
                  {player.max_hp} HP · {player.block} block · {player.energy}{" "}
                  energy
                  <div className="text-sm text-[var(--text-secondary)]">
                    Hand:{" "}
                    {player.hand.map((card) => card.id).join(", ") || "empty"}
                  </div>
                </div>
              ))}
            </div>
            <div>
              {position.enemies.map((enemy, index) => (
                <div key={index} className="mb-3">
                  <strong>{enemy.id}</strong> · {enemy.current_hp}/
                  {enemy.max_hp} HP · {enemy.block} block
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      {solution && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Ranked plays</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {solution.states_examined} positions examined in{" "}
            {solution.elapsed_ms} ms
            {solution.exhaustive ? "" : " · search stopped at its time limit"}
          </p>
          <ol className="mt-4 space-y-3">
            {solution.lines.map((line, index) => (
              <li
                key={index}
                className="rounded border border-[var(--border-subtle)] p-4"
              >
                <div className="font-semibold">
                  #{index + 1} {line.lethal ? "· Lethal" : ""}
                </div>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">
                  {line.actions.map(actionLabel).join(" → ") || "End turn"}
                </div>
                <div className="mt-2 text-sm">
                  {line.damage} damage · {line.block} block · {line.energy}{" "}
                  energy left
                </div>
              </li>
            ))}
          </ol>
          {solution.lines.length === 0 && (
            <p className="mt-4">
              No supported play was found for this position.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
