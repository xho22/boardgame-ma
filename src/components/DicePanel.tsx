import { useEffect, useRef, useState } from "react";
import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import type { Player, RaceState } from "../game/types";

type DicePanelProps = {
  race: RaceState;
  currentPlayer: Player;
  onRoll: (playerId: string) => void;
};

export function DicePanel({ race, currentPlayer, onRoll }: DicePanelProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [rollingValue, setRollingValue] = useState(1);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setIsRolling(false);
    setRollingValue(race.previousFinalMoveValue ?? 1);
  }, [currentPlayer.id, race.previousFinalMoveValue]);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  function startRollAnimation() {
    if (isRolling) {
      return;
    }

    setIsRolling(true);
    intervalRef.current = window.setInterval(() => {
      setRollingValue(Math.floor(Math.random() * 6) + 1);
    }, 80);
    timeoutRef.current = window.setTimeout(() => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      timeoutRef.current = null;
      onRoll(currentPlayer.id);
    }, 2_000);
  }

  const displayValue = isRolling ? rollingValue : (race.previousFinalMoveValue ?? "-");
  const currentEntrant = race.entrants.find((entrant) => entrant.playerId === currentPlayer.id);
  const currentAthlete = currentEntrant ? STANDARD_ATHLETE_BY_ID.get(currentEntrant.athleteId) : null;

  return (
    <section className="dice-panel" aria-label="Current turn">
      {currentAthlete ? (
        <img className="current-racer-image" src={currentAthlete.imagePath} alt={currentAthlete.displayName} />
      ) : null}
      <div className="current-racer-copy">
        <p className="eyebrow">Current turn</p>
        <h2>{currentPlayer.name}</h2>
        {currentAthlete ? (
          <>
            <h3>{`${currentAthlete.displayName} / ${currentAthlete.standardName}`}</h3>
            <p>{currentAthlete.abilityText}</p>
          </>
        ) : null}
      </div>
      <div className={`dice-readout ${isRolling ? "rolling" : ""}`} aria-label="Last die roll">
        {displayValue}
      </div>
      <button className="primary-button" type="button" onClick={startRollAnimation} disabled={isRolling}>
        {isRolling ? "Rolling..." : "Roll Die"}
      </button>
    </section>
  );
}
