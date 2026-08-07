import type { GameLogEntry } from "../game/types";

type GameLogProps = {
  entries: GameLogEntry[];
};

export function GameLog({ entries }: GameLogProps) {
  const visibleEntries = entries.map((entry, index) => ({ entry, number: index + 1 })).reverse();

  return (
    <section className="game-log" aria-label="比赛日志">
      <h2>比赛日志</h2>
      <ol className="game-log-list">
        {visibleEntries.map(({ entry, number }) => (
          <li key={entry.id}>
            <span>{number}</span>
            <p>{entry.message}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
