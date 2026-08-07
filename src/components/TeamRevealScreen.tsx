import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import type { GameState } from "../game/types";

type TeamRevealScreenProps = {
  game: GameState;
  onNewGame: () => void;
  onClearGame: () => void;
};

export function TeamRevealScreen({ game, onNewGame, onClearGame }: TeamRevealScreenProps) {
  return (
    <main className="app-shell screen-layout">
      <header className="top-bar">
        <button className="ghost-button" type="button" onClick={onNewGame}>
          New
        </button>
        <h1>Teams</h1>
        <button className="ghost-button danger" type="button" onClick={onClearGame}>
          Clear
        </button>
      </header>

      <section className="team-grid" aria-label="Assigned teams">
        {game.players.map((player) => (
          <article className="player-column" key={player.id}>
            <div className="player-heading">
              <span className={`player-dot player-dot-${player.color}`} />
              <h2>{player.name}</h2>
            </div>
            <div className="racer-list">
              {player.athleteIds.map((athleteId) => {
                const athlete = STANDARD_ATHLETE_BY_ID.get(athleteId);

                if (!athlete) {
                  return null;
                }

                return (
                  <article className="racer-card" key={athlete.id}>
                    <div>
                      <h3>{athlete.displayName}</h3>
                      <p>{athlete.standardName}</p>
                    </div>
                    <span>{athlete.type}</span>
                  </article>
                );
              })}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
