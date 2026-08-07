import type { GameLogEntry } from "../game/types";

type GameLogProps = {
  entries: GameLogEntry[];
};

export function GameLog({ entries }: GameLogProps) {
  const visibleEntries = entries.slice(-10).reverse();

  return (
    <section className="game-log" aria-label="Game log">
      <h2>Log</h2>
      <ol>
        {visibleEntries.map((entry) => (
          <li key={entry.id}>{entry.message}</li>
        ))}
      </ol>
    </section>
  );
}
