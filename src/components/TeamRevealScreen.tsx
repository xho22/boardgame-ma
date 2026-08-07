import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import { useState } from "react";
import type { GameState } from "../game/types";

type TeamRevealScreenProps = {
  game: GameState;
  onNewGame: () => void;
  onClearGame: () => void;
  onRandomizeTeams: () => void;
  onBeginSelection: () => void;
};

export function TeamRevealScreen({ game, onNewGame, onClearGame, onRandomizeTeams, onBeginSelection }: TeamRevealScreenProps) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  function showTooltip(text: string, x: number, y: number) {
    setTooltip({
      text,
      x: Math.max(16, Math.min(x, window.innerWidth - 336)),
      y: Math.max(16, Math.min(y, window.innerHeight - 160)),
    });
  }

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
                  <article
                    className="racer-card"
                    key={athlete.id}
                    tabIndex={0}
                    onBlur={() => setTooltip(null)}
                    onFocus={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      showTooltip(athlete.abilityText, rect.left + 16, rect.bottom + 12);
                    }}
                    onPointerLeave={() => setTooltip(null)}
                    onPointerMove={(event) =>
                      showTooltip(athlete.abilityText, event.clientX + 16, event.clientY + 16)
                    }
                  >
                    <img src={athlete.imagePath} alt={athlete.displayName} />
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

      <footer className="bottom-actions">
        <button className="secondary-button" type="button" onClick={onRandomizeTeams}>
          Randomize Teams
        </button>
        <button className="primary-button" type="button" onClick={onBeginSelection}>
          Choose Racers
        </button>
      </footer>
      {tooltip ? (
        <div className="ability-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.text}
        </div>
      ) : null}
    </main>
  );
}
