import { DicePanel } from "./DicePanel";
import { GameLog } from "./GameLog";
import { Track } from "./Track";
import type { GameState } from "../game/types";

type RaceScreenProps = {
  game: GameState;
  onRoll: (playerId: string) => void;
};

export function RaceScreen({ game, onRoll }: RaceScreenProps) {
  const race = game.activeRace;

  if (!race) {
    return null;
  }

  const currentEntrantId = race.turnOrder[race.currentTurnIndex];
  const currentEntrant = race.entrants.find((entrant) => entrant.id === currentEntrantId);
  const currentPlayer = game.players.find((player) => player.id === currentEntrant?.playerId);

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
        <DicePanel race={race} currentPlayer={currentPlayer} currentEntrant={currentEntrant} onRoll={onRoll} />
        <GameLog entries={game.log} />
      </div>
    </main>
  );
}
