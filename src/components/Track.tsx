import { useEffect, useMemo, useState } from "react";
import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import type { GameState, RaceState } from "../game/types";

type TrackProps = {
  game: GameState;
  race: RaceState;
};

export function Track({ game, race }: TrackProps) {
  const spaces = Array.from({ length: race.trackLength + 1 }, (_, index) => index);
  const targetPositions = useMemo(
    () => Object.fromEntries(race.entrants.map((entrant) => [entrant.playerId, entrant.position])),
    [race.entrants],
  );
  const [displayedPositions, setDisplayedPositions] = useState<Record<string, number>>(targetPositions);

  useEffect(() => {
    setDisplayedPositions(Object.fromEntries(race.entrants.map((entrant) => [entrant.playerId, entrant.position])));
  }, [race.id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDisplayedPositions((currentPositions) => {
        let changed = false;
        const nextPositions = { ...currentPositions };

        for (const entrant of race.entrants) {
          const currentPosition = nextPositions[entrant.playerId] ?? entrant.position;
          const targetPosition = targetPositions[entrant.playerId] ?? entrant.position;

          if (currentPosition < targetPosition) {
            nextPositions[entrant.playerId] = currentPosition + 1;
            changed = true;
          } else if (currentPosition > targetPosition) {
            nextPositions[entrant.playerId] = currentPosition - 1;
            changed = true;
          }
        }

        return changed ? nextPositions : currentPositions;
      });
    }, 180);

    return () => window.clearInterval(timer);
  }, [race.entrants, targetPositions]);

  return (
    <section className="track-section" aria-label="Race track">
      <div
        className="track-grid"
        style={{ gridTemplateColumns: `repeat(${spaces.length}, minmax(38px, 1fr))` }}
      >
        {spaces.map((space) => {
          const entrants = race.entrants.filter((entrant) => (displayedPositions[entrant.playerId] ?? entrant.position) === space);

          return (
            <div className="track-space" key={space}>
              <span className="space-label">{space === 0 ? "Start" : space === race.trackLength ? "Finish" : space}</span>
              <div className="piece-stack">
                {entrants.map((entrant) => {
                  const player = game.players.find((candidate) => candidate.id === entrant.playerId);
                  const athlete = STANDARD_ATHLETE_BY_ID.get(entrant.athleteId);

                  return (
                    <span
                      className={`track-piece moving-piece player-dot-${player?.color ?? "red"}`}
                      key={entrant.playerId}
                      title={`${player?.name ?? entrant.playerId}: ${athlete?.displayName ?? entrant.athleteId}`}
                    >
                      {player?.name.slice(0, 1).toUpperCase() ?? "?"}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
