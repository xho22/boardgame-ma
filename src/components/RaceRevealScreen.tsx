import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import type { GameState } from "../game/types";

type RaceRevealScreenProps = {
  game: GameState;
};

export function RaceRevealScreen({ game }: RaceRevealScreenProps) {
  const selectionState = game.selectionState;

  return (
    <main className="app-shell screen-layout">
      <header className="top-bar reveal-top-bar">
        <span />
        <h1>{`Race ${game.raceIndex + 1}`}</h1>
        <span />
      </header>

      <section className="reveal-grid" aria-label="Revealed racers">
        {game.players.map((player) => {
          const athleteId = selectionState?.selectionsByPlayerId[player.id] ?? null;
          const athlete = athleteId ? STANDARD_ATHLETE_BY_ID.get(athleteId) : null;

          return (
            <article className="reveal-card" key={player.id}>
              <div className="player-heading">
                <span className={`player-dot player-dot-${player.color}`} />
                <h2>{player.name}</h2>
              </div>
              {athlete ? (
                <div>
                  <h3>{athlete.displayName}</h3>
                  <p>{athlete.standardName}</p>
                </div>
              ) : (
                <p>No racer selected</p>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
