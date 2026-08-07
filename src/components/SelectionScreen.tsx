import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import { getActiveSelectionPlayer } from "../game/selection";
import type { GameState } from "../game/types";

type SelectionScreenProps = {
  game: GameState;
  onSelectAthlete: (playerId: string, athleteId: string) => void;
  onLockSelection: (playerId: string) => void;
};

export function SelectionScreen({ game, onSelectAthlete, onLockSelection }: SelectionScreenProps) {
  const activePlayer = getActiveSelectionPlayer(game);

  if (!activePlayer || !game.selectionState) {
    return null;
  }

  const selectedAthleteId = game.selectionState.selectionsByPlayerId[activePlayer.id];

  return (
    <main className="app-shell screen-layout">
      <header className="selection-cover">
        <p className="eyebrow">Secret selection</p>
        <h1>{activePlayer.name}</h1>
        <p className="helper-text">Only this player should look. Pick one unused racer, then lock it.</p>
      </header>

      <section className="selection-grid" aria-label={`${activePlayer.name} available racers`}>
        {activePlayer.athleteIds.map((athleteId) => {
          const athlete = STANDARD_ATHLETE_BY_ID.get(athleteId);
          const isUsed = activePlayer.usedAthleteIds.includes(athleteId);
          const isSelected = selectedAthleteId === athleteId;

          if (!athlete) {
            return null;
          }

          return (
            <button
              className={`selectable-racer ${isSelected ? "selected" : ""}`}
              type="button"
              key={athlete.id}
              disabled={isUsed}
              onClick={() => onSelectAthlete(activePlayer.id, athlete.id)}
            >
              <span>{athlete.displayName}</span>
              <small>{athlete.standardName}</small>
            </button>
          );
        })}
      </section>

      <footer className="bottom-actions">
        <button
          className="primary-button"
          type="button"
          disabled={!selectedAthleteId}
          onClick={() => onLockSelection(activePlayer.id)}
        >
          Lock Choice
        </button>
      </footer>
    </main>
  );
}
