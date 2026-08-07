import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import { getActiveSelectionPlayer } from "../game/selection";
import type { GameState } from "../game/types";

type SelectionScreenProps = {
  game: GameState;
  onBack: () => void;
  onSelectAthlete: (playerId: string, athleteId: string) => void;
  onLockSelection: (playerId: string) => void;
};

export function SelectionScreen({ game, onBack, onSelectAthlete, onLockSelection }: SelectionScreenProps) {
  const activePlayer = getActiveSelectionPlayer(game);

  if (!activePlayer || !game.selectionState) {
    return null;
  }

  const selectedAthleteIds = game.selectionState.selectionsByPlayerId[activePlayer.id] ?? [];
  const requiredSelections = game.settings.racersPerPlayerPerRace;

  return (
    <main className="app-shell screen-layout">
      <header className="top-bar selection-top-bar">
        <button className="ghost-button" type="button" onClick={onBack}>
          Back
        </button>
        <div>
          <p className="eyebrow">Secret selection</p>
          <h1>{activePlayer.name}</h1>
          <p className="helper-text">{`Only this player should look. Pick ${requiredSelections} unused racer${requiredSelections > 1 ? "s" : ""}, then lock it.`}</p>
          <p className="selection-count">{`${selectedAthleteIds.length} / ${requiredSelections} selected`}</p>
        </div>
        <span />
      </header>

      <section className="selection-grid" aria-label={`${activePlayer.name} available racers`}>
        {activePlayer.athleteIds.map((athleteId) => {
          const athlete = STANDARD_ATHLETE_BY_ID.get(athleteId);
          const isUsed = activePlayer.usedAthleteIds.includes(athleteId);
          const isSelected = selectedAthleteIds.includes(athleteId);

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
              <img src={athlete.imagePath} alt={athlete.displayName} />
              <span>{athlete.displayName}</span>
              <small>{athlete.standardName}</small>
              <p>{athlete.abilityText}</p>
            </button>
          );
        })}
      </section>

      <footer className="bottom-actions">
        <button
          className="primary-button"
          type="button"
          disabled={selectedAthleteIds.length !== requiredSelections}
          onClick={() => onLockSelection(activePlayer.id)}
        >
          Lock Choice
        </button>
      </footer>
    </main>
  );
}
