import { useEffect, useState } from "react";
import { DicePanel } from "./DicePanel";
import { GameLog } from "./GameLog";
import { Track } from "./Track";
import { getEffectiveImplementationKey } from "../game/abilityEngine";
import type { GameState, MainMoveChoice } from "../game/types";

type RaceScreenProps = {
  game: GameState;
  onConfirmReaction: (playerId: string, reactionId: string, accepted: boolean, targetEntrantId?: string) => void;
  onRoll: (playerId: string, choice?: MainMoveChoice) => void;
};

export function RaceScreen({ game, onConfirmReaction, onRoll }: RaceScreenProps) {
  const [duelTargetEntrantId, setDuelTargetEntrantId] = useState("");
  const race = game.activeRace;

  if (!race) {
    return null;
  }

  const currentEntrantId = race.turnOrder[race.currentTurnIndex];
  const currentEntrant = race.entrants.find((entrant) => entrant.id === currentEntrantId);
  const currentPlayer = game.players.find((player) => player.id === currentEntrant?.playerId);
  const pendingReaction = race.pendingReactions[0];
  useEffect(() => {
    setDuelTargetEntrantId("");
  }, [pendingReaction?.id]);
  const reactionPlayer = game.players.find((player) => player.id === pendingReaction?.playerId);
  const duelist = pendingReaction?.sourceEntrantId
    ? race.entrants.find((entrant) => entrant.id === pendingReaction.sourceEntrantId)
    : null;
  const duelTargets = pendingReaction?.promptType === "duel" && duelist
    ? race.entrants.filter(
        (entrant) =>
          entrant.id !== duelist.id &&
          !entrant.finished &&
          !entrant.eliminated &&
          entrant.position === duelist.position,
      )
    : [];
  const reactionActions = pendingReaction?.title?.startsWith("炼金师")
    ? { decline: "保留点数", accept: "改为移动 4 格" }
    : pendingReaction?.title?.startsWith("魔术师")
      ? { decline: "保留点数", accept: "重投" }
      : pendingReaction?.title?.startsWith("火箭科学家")
        ? { decline: "保留点数", accept: "加倍并绊倒" }
        : pendingReaction?.promptType === "reroll"
          ? { decline: "保留点数", accept: "重投" }
          : { decline: "放弃", accept: "使用能力" };

  if (!currentPlayer || !currentEntrant) {
    return null;
  }

  return (
    <main className="app-shell race-layout">
      <header className="race-header">
        <div>
          <p className="eyebrow">{`Race ${race.raceNumber}`}</p>
          <h1>Track</h1>
        </div>
        <dl className="race-score-strip">
          {game.players.map((player) => (
            <div key={player.id}>
              <dt>{player.name}</dt>
              <dd>{player.score}</dd>
            </div>
          ))}
        </dl>
      </header>

      <Track game={game} race={race} />

      <div className="race-control-grid">
        {pendingReaction ? (
          <section className="dice-panel" aria-label="Reaction prompt">
            <div className="current-racer-copy reaction-copy">
              <p className="eyebrow">Reaction</p>
              <h2>{reactionPlayer?.name ?? pendingReaction.playerId}</h2>
              <h3>{pendingReaction.title ?? "能力确认"}</h3>
              <p>{pendingReaction.description ?? "请决定是否使用这个能力。"}</p>
            </div>
            <div className="ability-choice-panel">
              {pendingReaction.promptType === "duel" ? (
                <label className="ability-select">
                  <span>决斗对手</span>
                  <select value={duelTargetEntrantId} onChange={(event) => setDuelTargetEntrantId(event.target.value)}>
                    <option value="">请选择同格选手</option>
                    {duelTargets.map((entrant) => {
                      const player = game.players.find((candidate) => candidate.id === entrant.playerId);
                      const athlete = game.athletes.find((candidate) => candidate.id === entrant.athleteId);
                      return <option key={entrant.id} value={entrant.id}>{`${player?.name ?? entrant.playerId}的${athlete?.displayName ?? entrant.athleteId}`}</option>;
                    })}
                  </select>
                </label>
              ) : null}
              <div className="ability-choice-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onConfirmReaction(pendingReaction.playerId, pendingReaction.id, false)}
                >
                  {reactionActions.decline}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => onConfirmReaction(pendingReaction.playerId, pendingReaction.id, true, duelTargetEntrantId || undefined)}
                  disabled={pendingReaction.promptType === "duel" && !duelTargetEntrantId}
                >
                  {reactionActions.accept}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <DicePanel
            debugMode={game.settings.debugMode}
            race={race}
            currentPlayer={currentPlayer}
            currentEntrant={currentEntrant}
            effectiveAbilityKey={getEffectiveImplementationKey(game, race, currentEntrant)}
            onRoll={onRoll}
          />
        )}
        <GameLog entries={game.log} />
      </div>
    </main>
  );
}
