import type { Player, RaceState } from "../game/types";

type DicePanelProps = {
  race: RaceState;
  currentPlayer: Player;
  onRoll: (playerId: string) => void;
};

export function DicePanel({ race, currentPlayer, onRoll }: DicePanelProps) {
  return (
    <section className="dice-panel" aria-label="Current turn">
      <div>
        <p className="eyebrow">Current turn</p>
        <h2>{currentPlayer.name}</h2>
      </div>
      <div className="dice-readout" aria-label="Last die roll">
        {race.previousFinalMoveValue ?? "-"}
      </div>
      <button className="primary-button" type="button" onClick={() => onRoll(currentPlayer.id)}>
        Roll Die
      </button>
    </section>
  );
}
