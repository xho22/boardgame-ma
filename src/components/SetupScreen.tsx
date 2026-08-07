import { useMemo, useState } from "react";
import { DEFAULT_ATHLETES_PER_PLAYER, DEFAULT_RACES_COUNT, DEFAULT_TRACK_LENGTH } from "../game/constants";
import type { GameSettings } from "../game/types";

type SetupScreenProps = {
  onStartGame: (settings: Partial<GameSettings>) => void;
  onBack: () => void;
};

export function SetupScreen({ onStartGame, onBack }: SetupScreenProps) {
  const [playerCount, setPlayerCount] = useState(2);
  const [playerNames, setPlayerNames] = useState(["Dad", "Kid"]);

  const visibleNames = useMemo(
    () =>
      Array.from({ length: playerCount }, (_, index) => {
        return playerNames[index] ?? `Player ${index + 1}`;
      }),
    [playerCount, playerNames],
  );

  function updatePlayerCount(nextCount: number) {
    setPlayerCount(nextCount);
    setPlayerNames((currentNames) =>
      Array.from({ length: nextCount }, (_, index) => currentNames[index] ?? `Player ${index + 1}`),
    );
  }

  function updatePlayerName(index: number, name: string) {
    setPlayerNames((currentNames) => {
      const nextNames = [...currentNames];
      nextNames[index] = name;
      return nextNames;
    });
  }

  return (
    <main className="app-shell screen-layout">
      <header className="top-bar">
        <button className="ghost-button" type="button" onClick={onBack} aria-label="Back to home">
          Back
        </button>
        <h1>New Game</h1>
      </header>

      <section className="setup-grid">
        <div className="control-band">
          <label htmlFor="player-count">Players</label>
          <div className="stepper">
            <button
              type="button"
              onClick={() => updatePlayerCount(Math.max(2, playerCount - 1))}
              disabled={playerCount <= 2}
            >
              -
            </button>
            <output id="player-count">{playerCount}</output>
            <button
              type="button"
              onClick={() => updatePlayerCount(Math.min(6, playerCount + 1))}
              disabled={playerCount >= 6}
            >
              +
            </button>
          </div>
        </div>

        <div className="name-list">
          {visibleNames.map((name, index) => (
            <label className="name-field" key={`player-name-${index}`}>
              <span>{`Player ${index + 1}`}</span>
              <input value={name} onChange={(event) => updatePlayerName(index, event.target.value)} />
            </label>
          ))}
        </div>

        <dl className="summary-strip" aria-label="Game summary">
          <div>
            <dt>Races</dt>
            <dd>{DEFAULT_RACES_COUNT}</dd>
          </div>
          <div>
            <dt>Racers Each</dt>
            <dd>{DEFAULT_ATHLETES_PER_PLAYER}</dd>
          </div>
          <div>
            <dt>Track</dt>
            <dd>{DEFAULT_TRACK_LENGTH}</dd>
          </div>
        </dl>
      </section>

      <footer className="bottom-actions">
        <button
          className="primary-button"
          type="button"
          onClick={() =>
            onStartGame({
              playerCount,
              playerNames: visibleNames,
            })
          }
        >
          Start Game
        </button>
      </footer>
    </main>
  );
}
