import { useEffect, useState } from "react";
import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import { getActiveSelectionPlayer } from "../game/selection";
import type { GameState } from "../game/types";

type SelectionScreenProps = {
  game: GameState;
  onBack: () => void;
  onSelectAthlete: (playerId: string, athleteId: string) => void;
  onLockSelection: (playerId: string) => void;
  selectionPlayerId?: string;
  selectionFailureToken?: number;
};

export function SelectionScreen({ game, onBack, onSelectAthlete, onLockSelection, selectionPlayerId, selectionFailureToken = 0 }: SelectionScreenProps) {
  const activePlayer = selectionPlayerId
    ? game.players.find((player) => player.id === selectionPlayerId) ?? null
    : getActiveSelectionPlayer(game);

  if (!activePlayer || !game.selectionState) {
    return null;
  }

  const activePlayerId = activePlayer.id;
  const serverSelectedAthleteIds = game.selectionState.selectionsByPlayerId[activePlayer.id] ?? [];
  const requiredSelections = game.settings.racersPerPlayerPerRace;
  const isLocked = game.selectionState.lockedPlayerIds.includes(activePlayer.id);
  const lockedCount = game.selectionState.lockedPlayerIds.length;
  const [optimisticSelectedAthleteIds, setOptimisticSelectedAthleteIds] = useState<string[] | null>(null);
  const [isLocking, setIsLocking] = useState(false);
  const selectedAthleteIds = optimisticSelectedAthleteIds ?? serverSelectedAthleteIds;

  useEffect(() => {
    if (
      optimisticSelectedAthleteIds &&
      optimisticSelectedAthleteIds.length === serverSelectedAthleteIds.length &&
      optimisticSelectedAthleteIds.every((athleteId) => serverSelectedAthleteIds.includes(athleteId))
    ) {
      setOptimisticSelectedAthleteIds(null);
    }
  }, [optimisticSelectedAthleteIds, serverSelectedAthleteIds]);

  useEffect(() => {
    setOptimisticSelectedAthleteIds(null);
    setIsLocking(false);
  }, [selectionFailureToken]);

  useEffect(() => {
    setOptimisticSelectedAthleteIds(null);
    setIsLocking(false);
  }, [activePlayerId]);

  useEffect(() => {
    if (isLocked) {
      setIsLocking(false);
    }
  }, [isLocked]);

  const selectionIsLocked = isLocked || isLocking;

  function selectAthlete(athleteId: string): void {
    const nextSelection = selectedAthleteIds.includes(athleteId)
      ? selectedAthleteIds.filter((selectedAthleteId) => selectedAthleteId !== athleteId)
      : [...selectedAthleteIds, athleteId].slice(-requiredSelections);

    setOptimisticSelectedAthleteIds(nextSelection);
    onSelectAthlete(activePlayerId, athleteId);
  }

  function lockSelection(): void {
    setIsLocking(true);
    onLockSelection(activePlayerId);
  }

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
          {selectionPlayerId ? <p className="selection-count">{`${lockedCount} / ${game.players.length} 位玩家已锁定`}</p> : null}
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
              disabled={isUsed || selectionIsLocked}
              onClick={() => selectAthlete(athlete.id)}
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
          disabled={selectionIsLocked || selectedAthleteIds.length !== requiredSelections}
          onClick={lockSelection}
        >
          {isLocked ? "已锁定，等待其他玩家" : isLocking ? "正在锁定..." : "Lock Choice"}
        </button>
      </footer>
    </main>
  );
}
