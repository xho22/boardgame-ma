import { DicePanel } from "./DicePanel";
import { GameLog } from "./GameLog";
import { Track } from "./Track";
import type { GameState, MainMoveChoice } from "../game/types";

type RaceScreenProps = {
  game: GameState;
  onConfirmReaction: (playerId: string, reactionId: string, accepted: boolean) => void;
  onRoll: (playerId: string, choice?: MainMoveChoice) => void;
};

export function RaceScreen({ game, onConfirmReaction, onRoll }: RaceScreenProps) {
  const race = game.activeRace;

  if (!race) {
    return null;
  }

  const currentEntrantId = race.turnOrder[race.currentTurnIndex];
  const currentEntrant = race.entrants.find((entrant) => entrant.id === currentEntrantId);
  const currentPlayer = game.players.find((player) => player.id === currentEntrant?.playerId);
  const pendingReaction = race.pendingReactions[0];
  const reactionPlayer = game.players.find((player) => player.id === pendingReaction?.playerId);

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
              <div className="ability-choice-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onConfirmReaction(pendingReaction.playerId, pendingReaction.id, false)}
                >
                  放弃
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => onConfirmReaction(pendingReaction.playerId, pendingReaction.id, true)}
                >
                  使用能力
                </button>
              </div>
            </div>
          </section>
        ) : (
          <DicePanel race={race} currentPlayer={currentPlayer} currentEntrant={currentEntrant} onRoll={onRoll} />
        )}
        <GameLog entries={game.log} />
      </div>
    </main>
  );
}
