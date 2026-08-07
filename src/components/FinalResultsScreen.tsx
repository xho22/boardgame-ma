import type { GameState, Player } from "../game/types";

type FinalResultsScreenProps = {
  game: GameState;
  onNewGame: () => void;
};

export function FinalResultsScreen({ game, onNewGame }: FinalResultsScreenProps) {
  const standings = [...game.players].sort(comparePlayers);

  return (
    <main className="app-shell screen-layout">
      <header className="final-header">
        <p className="eyebrow">Champion</p>
        <h1>{standings[0]?.name ?? "Winner"}</h1>
      </header>

      <section className="results-list" aria-label="Final standings">
        {standings.map((player, index) => (
          <article className="result-row" key={player.id}>
            <strong>{`#${index + 1}`}</strong>
            <div>
              <h2>{player.name}</h2>
              <p>{`${player.firstPlaces} wins, ${player.secondPlaces} seconds`}</p>
            </div>
            <span>{`${player.score} pts`}</span>
          </article>
        ))}
      </section>

      <footer className="bottom-actions">
        <button className="primary-button" type="button" onClick={onNewGame}>
          New Game
        </button>
      </footer>
    </main>
  );
}

function comparePlayers(first: Player, second: Player): number {
  return (
    second.score - first.score ||
    second.firstPlaces - first.firstPlaces ||
    second.secondPlaces - first.secondPlaces ||
    first.name.localeCompare(second.name)
  );
}
