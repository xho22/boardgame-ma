import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import type { GameState } from "../game/types";

type RaceRevealScreenProps = {
  game: GameState;
  onStartRace: () => void;
};

export function RaceRevealScreen({ game, onStartRace }: RaceRevealScreenProps) {
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
          const athleteIds = selectionState?.selectionsByPlayerId[player.id] ?? [];

          return (
            <article className="reveal-card" key={player.id}>
              <div className="player-heading">
                <span className={`player-dot player-dot-${player.color}`} />
                <h2>{player.name}</h2>
              </div>
              {athleteIds.length > 0 ? (
                <div className="reveal-racer-list">
                  {athleteIds.map((athleteId) => {
                    const athlete = STANDARD_ATHLETE_BY_ID.get(athleteId);

                    if (!athlete) {
                      return null;
                    }

                    return (
                      <div key={athlete.id}>
                        <img src={athlete.imagePath} alt={athlete.displayName} />
                        <div>
                          <h3>{athlete.displayName}</h3>
                          <p>{athlete.standardName}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p>No racer selected</p>
              )}
            </article>
          );
        })}
      </section>

      <footer className="bottom-actions">
        <button className="primary-button" type="button" onClick={onStartRace}>
          Start Race
        </button>
      </footer>
    </main>
  );
}
