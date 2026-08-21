import { useEffect, useMemo, useRef, useState } from "react";
import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import { getSpecialTrackEffect } from "../game/specialTrack";
import type { GameLogEntry, GameState, RaceState } from "../game/types";

type TrackProps = {
  game: GameState;
  race: RaceState;
};

const TRACK_COLUMNS = 16;

export function getTrackSpacePosition(space: number): { column: number; row: number } {
  if (space <= 13) {
    return { column: space + 3, row: 3 };
  }

  if (space === 14) {
    return { column: TRACK_COLUMNS, row: 2 };
  }

  return { column: 31 - space, row: 1 };
}

export function getBackwardSpecialWaypoints(
  game: GameState,
  race: RaceState,
  entries: GameLogEntry[],
): Record<string, number[]> {
  const waypoints: Record<string, number[]> = {};

  for (const entrant of race.entrants) {
    const player = game.players.find((candidate) => candidate.id === entrant.playerId);
    const athlete = STANDARD_ATHLETE_BY_ID.get(entrant.athleteId);
    const label = `${player?.name ?? entrant.playerId}的${athlete?.displayName ?? athlete?.standardName ?? entrant.athleteId}`;

    for (const entry of entries) {
      if (!entry.message.startsWith(`${label} 落到特殊格 `)) {
        continue;
      }

      const match = entry.message.match(/特殊格 (\d+)，后退 \d+ 格到 (\d+)。$/);
      if (match) {
        waypoints[entrant.id] = [...(waypoints[entrant.id] ?? []), Number(match[1]), Number(match[2])];
      }
    }
  }

  return waypoints;
}

export function Track({ game, race }: TrackProps) {
  const spaces = Array.from({ length: race.trackLength + 1 }, (_, index) => index);
  const targetPositions = useMemo(
    () => Object.fromEntries(race.entrants.map((entrant) => [entrant.id, entrant.position])),
    [race.entrants],
  );
  const [displayedPositions, setDisplayedPositions] = useState<Record<string, number>>(targetPositions);
  const movementQueuesRef = useRef<Record<string, number[]>>({});
  const processedLogCountRef = useRef(game.log.length);
  const [hoveredRacer, setHoveredRacer] = useState<{
    playerName: string;
    racerName: string;
    abilityText: string;
    x: number;
    y: number;
  } | null>(null);
  const currentEntrantId = race.turnOrder[race.currentTurnIndex];

  useEffect(() => {
    setDisplayedPositions(Object.fromEntries(race.entrants.map((entrant) => [entrant.id, entrant.position])));
    movementQueuesRef.current = {};
    processedLogCountRef.current = game.log.length;
  }, [race.id]);

  useEffect(() => {
    const newEntries = game.log.slice(processedLogCountRef.current);
    processedLogCountRef.current = game.log.length;
    const newWaypoints = getBackwardSpecialWaypoints(game, race, newEntries);

    for (const [entrantId, waypoints] of Object.entries(newWaypoints)) {
      movementQueuesRef.current[entrantId] = [...(movementQueuesRef.current[entrantId] ?? []), ...waypoints];
    }
  }, [game, race]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDisplayedPositions((currentPositions) => {
        let changed = false;
        const nextPositions = { ...currentPositions };

        for (const entrant of race.entrants) {
          const currentPosition = nextPositions[entrant.id] ?? entrant.position;
          const queuedPositions = movementQueuesRef.current[entrant.id] ?? [];
          const queuedTarget = queuedPositions[0];
          const targetPosition = queuedTarget ?? targetPositions[entrant.id] ?? entrant.position;

          if (currentPosition === queuedTarget) {
            queuedPositions.shift();
            if (queuedPositions.length === 0) {
              delete movementQueuesRef.current[entrant.id];
            }
            continue;
          }

          if (currentPosition < targetPosition) {
            nextPositions[entrant.id] = currentPosition + 1;
            changed = true;
          } else if (currentPosition > targetPosition) {
            nextPositions[entrant.id] = currentPosition - 1;
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
        style={{ gridTemplateColumns: `repeat(${TRACK_COLUMNS}, minmax(58px, 1fr))` }}
      >
        <div className="track-infield" aria-hidden="true">
          <span>{`Race ${race.raceNumber}`}</span>
          <strong>竞速赛道</strong>
        </div>
        {spaces.map((space) => {
          const entrants = race.entrants.filter((entrant) => (displayedPositions[entrant.id] ?? entrant.position) === space);
          const specialEffect = race.boardKind === "special" ? getSpecialTrackEffect(space) : undefined;
          const trackPosition = getTrackSpacePosition(space);

          return (
            <div
              className={`track-space ${specialEffect ? `special-space special-${specialEffect.type}` : ""}`}
              key={space}
              style={{ gridColumn: trackPosition.column, gridRow: trackPosition.row }}
            >
              <span className="space-label">{space === 0 ? "Start" : space === race.trackLength ? "Finish" : space}</span>
              {specialEffect ? <span className="special-space-marker" title={`特殊格：${specialEffect.label}`}>{specialEffect.label}</span> : null}
              <div className="piece-stack">
                {entrants.map((entrant) => {
                  const player = game.players.find((candidate) => candidate.id === entrant.playerId);
                  const athlete = STANDARD_ATHLETE_BY_ID.get(entrant.athleteId);

                  return (
                    <span
                      className={[
                        "track-piece",
                        "moving-piece",
                        entrant.id === currentEntrantId ? "current-racer" : "",
                        entrant.skippedTurns > 0 ? "tripped" : "",
                        entrant.eliminated ? "eliminated" : "",
                      ].filter(Boolean).join(" ")}
                      key={entrant.id}
                      style={{
                        borderColor: player?.color ?? "#1d6258",
                        "--current-player-color": player?.color ?? "#e94f2f",
                      } as React.CSSProperties}
                      onMouseEnter={(event) =>
                        setHoveredRacer({
                          playerName: player?.name ?? entrant.playerId,
                          racerName: athlete?.displayName ?? entrant.athleteId,
                          abilityText: athlete?.abilityText ?? "暂无能力说明。",
                          x: event.clientX,
                          y: event.clientY,
                        })
                      }
                      onMouseMove={(event) =>
                        setHoveredRacer((current) =>
                          current
                            ? { ...current, x: event.clientX, y: event.clientY }
                            : current,
                        )
                      }
                      onMouseLeave={() => setHoveredRacer(null)}
                    >
                      {athlete ? <img src={athlete.imagePath} alt={athlete.displayName} /> : player?.name.slice(0, 1).toUpperCase() ?? "?"}
                      {entrant.id === currentEntrantId ? <span className="current-racer-marker">当前</span> : null}
                      {entrant.eliminated ? <span className="chomp-marker">CHOMP!</span> : null}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {race.boardKind === "special" ? (
        <p className="special-track-legend" aria-label="Special track legend">
          特殊棋盘：得分 +1 可获得分数；绊倒会跳过下一次主移动；前进/后退格会立即继续移动。
        </p>
      ) : null}
      {hoveredRacer ? (
        <aside
          className="racer-hover-card"
          role="tooltip"
          style={{ left: hoveredRacer.x + 14, top: hoveredRacer.y + 14 }}
        >
          <strong>{`${hoveredRacer.playerName}的${hoveredRacer.racerName}`}</strong>
          <span>{hoveredRacer.abilityText}</span>
        </aside>
      ) : null}
    </section>
  );
}
