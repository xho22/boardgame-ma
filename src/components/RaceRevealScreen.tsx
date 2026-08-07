import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import type { GameState } from "../game/types";

type RaceRevealScreenProps = {
  game: GameState;
  onPredictionChange: (athleteId: string, predictedAthleteId: string) => void;
  onStartRace: () => void;
};

export function RaceRevealScreen({ game, onPredictionChange, onStartRace }: RaceRevealScreenProps) {
  const selectionState = game.selectionState;
  const revealedRacers = game.players.flatMap((player) =>
    (selectionState?.selectionsByPlayerId[player.id] ?? []).map((athleteId) => ({
      player,
      athlete: STANDARD_ATHLETE_BY_ID.get(athleteId),
      athleteId,
    })),
  );
  const mastermindRacers = revealedRacers.filter(
    ({ athlete }) => athlete?.implementationKey === "predict_winner_finish_second",
  );
  const predictions = selectionState?.mastermindPredictionsByAthleteId ?? {};
  const hasMissingPrediction = mastermindRacers.some(({ athleteId }) => !predictions[athleteId]);

  return (
    <main className="app-shell screen-layout">
      <header className="top-bar reveal-top-bar">
        <span />
        <h1>{`Race ${game.raceIndex + 1}`}</h1>
        <span />
      </header>

      <section className="reveal-grid" aria-label="Revealed racers">
        {game.players.map((player) => {
          const athleteIds = selectionState?.selectionsByPlayerId[player.id] ?? [];

          return (
            <article className="reveal-card" key={player.id}>
              <div className="player-heading">
                <span className={`player-dot player-dot-${player.color}`} />
                <h2>{player.name}</h2>
              </div>
              {athleteIds.length > 0 ? (
                <div className="reveal-racer-list">
                  {athleteIds.map((athleteId) => {
                    const athlete = STANDARD_ATHLETE_BY_ID.get(athleteId);

                    if (!athlete) {
                      return null;
                    }

                    return (
                      <div key={athlete.id}>
                        <img src={athlete.imagePath} alt={athlete.displayName} />
                      <div>
                        <h3>{athlete.displayName}</h3>
                        <p>{athlete.standardName}</p>
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <p>No racer selected</p>
              )}
            </article>
          );
        })}
      </section>

      {mastermindRacers.length > 0 ? (
        <section className="prediction-panel" aria-label="幕后大师预测">
          <h2>幕后大师预测</h2>
          {mastermindRacers.map(({ athleteId, athlete }) => (
            <label key={athleteId}>
              <span>{athlete?.displayName ?? athleteId}</span>
              <select
                value={predictions[athleteId] ?? ""}
                onChange={(event) => onPredictionChange(athleteId, event.target.value)}
              >
                <option value="" disabled>
                  选择冠军
                </option>
                {revealedRacers.map(({ player, athlete: targetAthlete, athleteId: targetAthleteId }) => (
                  <option key={targetAthleteId} value={targetAthleteId}>
                    {`${player.name}的${targetAthlete?.displayName ?? targetAthleteId}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </section>
      ) : null}

      <footer className="bottom-actions">
        <button className="primary-button" type="button" onClick={onStartRace} disabled={hasMissingPrediction}>
          Start Race
        </button>
      </footer>
    </main>
  );
}
