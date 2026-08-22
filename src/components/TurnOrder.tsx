import { useState } from "react";
import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import { getCopiedAbilityAthlete } from "../game/abilityEngine";
import type { GameState, RaceState } from "../game/types";

type TurnOrderProps = {
  game: Pick<GameState, "players">;
  race: RaceState;
};

export function getUpcomingEntrantIds(race: RaceState): string[] {
  if (race.turnOrder.length === 0) {
    return [];
  }

  return Array.from(
    { length: race.turnOrder.length },
    (_, index) => race.turnOrder[(race.currentTurnIndex + index) % race.turnOrder.length],
  ).filter((entrantId) => {
    const entrant = race.entrants.find((candidate) => candidate.id === entrantId);
    return entrant && !entrant.finished && !entrant.eliminated;
  });
}

export function TurnOrder({ game, race }: TurnOrderProps) {
  const upcomingEntrantIds = getUpcomingEntrantIds(race);
  const currentEntrantId = race.turnOrder[race.currentTurnIndex];
  const finishers = [...race.finishers].sort((first, second) => first.rank - second.rank);
  const [hoveredRacer, setHoveredRacer] = useState<{
    playerName: string;
    racerName: string;
    abilityText: string;
    imagePath?: string;
    x: number;
    y: number;
  } | null>(null);

  return (
    <section className="turn-order" aria-label="行动顺序">
      <div className="turn-order-heading">
        <div>
          <p className="eyebrow">Turn order</p>
          <h2>行动顺序</h2>
        </div>
        <p>从当前 racer 开始</p>
      </div>
      <ol className="turn-order-list">
        {upcomingEntrantIds.map((entrantId, index) => {
          const entrant = race.entrants.find((candidate) => candidate.id === entrantId);
          if (!entrant) {
            return null;
          }

          const player = game.players.find((candidate) => candidate.id === entrant.playerId);
          const athlete = STANDARD_ATHLETE_BY_ID.get(entrant.athleteId);
          const copiedAthlete = getCopiedAbilityAthlete(race, entrant);
          const isCurrent = entrant.id === currentEntrantId;

          return (
            <li
              className={`turn-order-item ${isCurrent ? "current" : ""} ${entrant.skippedTurns > 0 ? "tripped" : ""}`}
              key={entrant.id}
              style={{ "--player-color": player?.color ?? "#1d6258" } as React.CSSProperties}
              onMouseEnter={(event) => setHoveredRacer({
                playerName: player?.name ?? entrant.playerId,
                racerName: athlete?.displayName ?? entrant.athleteId,
                abilityText: athlete?.abilityText ?? "暂无能力说明。",
                imagePath: athlete?.imagePath,
                x: event.clientX,
                y: event.clientY,
              })}
              onMouseMove={(event) => setHoveredRacer((current) =>
                current ? { ...current, x: event.clientX, y: event.clientY } : current,
              )}
              onMouseLeave={() => setHoveredRacer(null)}
            >
              <span className="turn-order-index">{isCurrent ? "当前" : index === 1 ? "下一位" : `${index} 回合后`}</span>
              {athlete ? (
                <span className="turn-order-avatar">
                  <img src={athlete.imagePath} alt={athlete.displayName} />
                  {copiedAthlete ? <img className="turn-order-copied-image" src={copiedAthlete.imagePath} alt={`${copiedAthlete.displayName}能力`} /> : null}
                </span>
              ) : <span className="turn-order-fallback">?</span>}
              <span className="turn-order-copy">
                <strong>{athlete?.displayName ?? entrant.athleteId}</strong>
                <small>{player?.name ?? entrant.playerId}</small>
              </span>
              {entrant.skippedTurns > 0 ? <span className="turn-status">绊倒</span> : null}
            </li>
          );
        })}
      </ol>
      {finishers.length > 0 ? (
        <div className="turn-order-finishers" aria-label="已冲线 racer">
          <span>已冲线</span>
          {finishers.map((finisher) => {
            const athlete = STANDARD_ATHLETE_BY_ID.get(finisher.athleteId);
            return <strong key={finisher.entrantId}>{`${finisher.rank}. ${athlete?.displayName ?? finisher.athleteId}`}</strong>;
          })}
        </div>
      ) : null}
      {hoveredRacer ? (
        <aside
          className="racer-hover-card"
          role="tooltip"
          style={{ left: hoveredRacer.x + 14, top: hoveredRacer.y + 14 }}
        >
          <div className="racer-hover-summary">
            {hoveredRacer.imagePath ? <img src={hoveredRacer.imagePath} alt="" /> : null}
            <div>
              <strong>{`${hoveredRacer.playerName}的${hoveredRacer.racerName}`}</strong>
              <span>{hoveredRacer.abilityText}</span>
            </div>
          </div>
        </aside>
      ) : null}
    </section>
  );
}
