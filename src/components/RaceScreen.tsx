import { useEffect, useRef, useState } from "react";
import { DicePanel } from "./DicePanel";
import { GameLog } from "./GameLog";
import { Track } from "./Track";
import { TurnOrder } from "./TurnOrder";
import { getEffectiveImplementationKey } from "../game/abilityEngine";
import type { GameState, MainMoveChoice } from "../game/types";

type RaceScreenProps = {
  game: GameState;
  onConfirmReaction: (playerId: string, reactionId: string, accepted: boolean, targetEntrantId?: string) => void;
  onRoll: (playerId: string, choice?: MainMoveChoice) => void;
  canActAsPlayer?: (playerId: string) => boolean;
};

export function RaceScreen({ game, onConfirmReaction, onRoll, canActAsPlayer = () => true }: RaceScreenProps) {
  const [duelTargetEntrantId, setDuelTargetEntrantId] = useState("");
  const [revealedDieRoll, setRevealedDieRoll] = useState<number | null>(null);
  const lastSeenRevisionRef = useRef(game.revision);
  const race = game.activeRace;
  const pendingReaction = race?.pendingReactions[0];
  useEffect(() => {
    setDuelTargetEntrantId("");
  }, [pendingReaction?.id]);

  useEffect(() => {
    if (lastSeenRevisionRef.current === game.revision) {
      return;
    }

    lastSeenRevisionRef.current = game.revision;
    if (race?.previousDieRoll === null || race?.previousDieRoll === undefined) {
      return;
    }

    setRevealedDieRoll(race.previousDieRoll);
    const timeout = window.setTimeout(() => setRevealedDieRoll(null), 1_000);
    return () => window.clearTimeout(timeout);
  }, [game.revision, race?.previousDieRoll]);

  if (!race) {
    return null;
  }

  const currentEntrantId = race.turnOrder[race.currentTurnIndex];
  const currentEntrant = race.entrants.find((entrant) => entrant.id === currentEntrantId);
  const currentPlayer = game.players.find((player) => player.id === currentEntrant?.playerId);
  const reactionPlayer = game.players.find((player) => player.id === pendingReaction?.playerId);
  const reactingEntrant = pendingReaction?.sourceEntrantId
    ? race.entrants.find((entrant) => entrant.id === pendingReaction.sourceEntrantId)
    : null;
  const reactionTargets = pendingReaction?.promptType === "duel" && reactingEntrant
    ? race.entrants.filter(
        (entrant) =>
          entrant.id !== reactingEntrant.id &&
          !entrant.finished &&
          !entrant.eliminated &&
          entrant.position === reactingEntrant.position,
      )
    : pendingReaction?.promptType === "copy" && reactingEntrant
      ? race.entrants.filter(
          (entrant) =>
            entrant.id !== reactingEntrant.id &&
            !entrant.finished &&
            !entrant.eliminated &&
            entrant.position === Math.max(...race.entrants.filter((candidate) => candidate.id !== reactingEntrant.id && !candidate.finished && !candidate.eliminated).map((candidate) => candidate.position)),
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
          : pendingReaction?.promptType === "copy"
            ? { decline: "暂不复制", accept: "复制所选能力" }
          : { decline: "放弃", accept: "使用能力" };

  if (!currentPlayer || !currentEntrant) {
    return null;
  }

  return (
    <main className="app-shell race-layout">
      <header className="race-header">
        <div>
          <p className="eyebrow">{`Race ${race.raceNumber}`}</p>
          <h1>魔法运动会</h1>
        </div>
        <div className="race-scoreboard">
          <span className="race-scoreboard-label">当前积分榜</span>
          <dl className="race-score-strip">
            {game.players.map((player) => (
              <div key={player.id}>
                <dt>{player.name}</dt>
                <dd>{player.score}</dd>
              </div>
            ))}
          </dl>
          <div className="race-awards-inline" aria-label="本局名次积分">
            <span>本局</span>
            <strong>{`1名 +${race.firstPlacePoints}`}</strong>
            <strong>{`2名 +${race.secondPlacePoints}`}</strong>
          </div>
        </div>
      </header>

      <div className="race-board-layout">
        <aside className="race-sidebar">
          <TurnOrder game={game} race={race} />
        </aside>
        <div className="race-track-column">
          <Track game={game} race={race} />
        </div>
      </div>

      {revealedDieRoll !== null ? (
        <section className="dice-result-hold" role="status" aria-label="本次骰子结果">
          <span>本次骰点</span>
          <strong>{revealedDieRoll}</strong>
          <p>结果已确认</p>
        </section>
      ) : null}

      <div className="race-control-grid">
        {pendingReaction ? (
          <section className="dice-panel" aria-label="Reaction prompt">
            <div className="current-racer-copy reaction-copy">
              <p className="eyebrow">Reaction</p>
              <h2>{reactionPlayer?.name ?? pendingReaction.playerId}</h2>
              <h3>{pendingReaction.title ?? "能力确认"}</h3>
              <p>{pendingReaction.description ?? "请决定是否使用这个能力。"}</p>
              {race.pendingDiceDecision ? (
                <div className="reaction-die-highlight" aria-label={`本次骰点 ${race.pendingDiceDecision.dieRoll}`}>
                  <span>本次骰点</span>
                  <strong>{race.pendingDiceDecision.dieRoll}</strong>
                </div>
              ) : null}
            </div>
            <div className="ability-choice-panel">
              {pendingReaction.promptType === "duel" || pendingReaction.promptType === "copy" ? (
                <label className="ability-select">
                  <span>{pendingReaction.promptType === "duel" ? "决斗对手" : "领先者"}</span>
                  <select value={duelTargetEntrantId} onChange={(event) => setDuelTargetEntrantId(event.target.value)}>
                    <option value="">{pendingReaction.promptType === "duel" ? "请选择同格选手" : "请选择领先者"}</option>
                    {reactionTargets.map((entrant) => {
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
                  disabled={revealedDieRoll !== null || !canActAsPlayer(pendingReaction.playerId)}
                >
                  {reactionActions.decline}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => onConfirmReaction(pendingReaction.playerId, pendingReaction.id, true, duelTargetEntrantId || undefined)}
                  disabled={revealedDieRoll !== null || !canActAsPlayer(pendingReaction.playerId) || ((pendingReaction.promptType === "duel" || pendingReaction.promptType === "copy") && !duelTargetEntrantId)}
                >
                  {reactionActions.accept}
                </button>
              </div>
            </div>
          </section>
        ) : canActAsPlayer(currentPlayer.id) ? (
          <DicePanel
            debugMode={game.settings.debugMode}
            race={race}
            currentPlayer={currentPlayer}
            currentEntrant={currentEntrant}
            effectiveAbilityKey={getEffectiveImplementationKey(game, race, currentEntrant)}
            interactionBlocked={revealedDieRoll !== null}
            onRoll={onRoll}
          />
        ) : (
          <section className="dice-panel" aria-label="Waiting for turn">
            <div className="current-racer-copy">
              <p className="eyebrow">Online room</p>
              <h2>{`等待 ${currentPlayer.name} 行动`}</h2>
              <p>对方的操作会由服务端同步到这里。</p>
            </div>
          </section>
        )}
        <GameLog entries={game.log} players={game.players} athletes={game.athletes} />
      </div>
    </main>
  );
}
