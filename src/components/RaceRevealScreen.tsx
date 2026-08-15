import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import type { GameState } from "../game/types";

type RaceRevealScreenProps = {
  game: GameState;
  onPredictionChange: (athleteId: string, predictedAthleteId: string) => void;
  onCopyChoiceChange: (athleteId: string, copiedAthleteId: string) => void;
  onStartRace: () => void;
  canChangeAthlete?: (athleteId: string) => boolean;
  canStartRace?: boolean;
};

export function RaceRevealScreen({ game, onPredictionChange, onCopyChoiceChange, onStartRace, canChangeAthlete = () => true, canStartRace = true }: RaceRevealScreenProps) {
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
  const copyChoices = selectionState?.copiedAbilityAthleteIdByAthleteId ?? {};
  const eggCandidates = selectionState?.eggCandidatesByAthleteId ?? {};
  const hasMissingPrediction = mastermindRacers.some(({ athleteId }) => !predictions[athleteId]);
  const eggRacers = revealedRacers.filter(({ athlete }) => athlete?.implementationKey === "draft_temp_power_before_race");
  const previousWinnerAthleteIds = [...new Set(
    game.races
      .slice(0, game.raceIndex)
      .flatMap((race) => race.finishers)
      .filter((finisher) => finisher.rank === 1)
      .map((finisher) => finisher.athleteId),
  )];
  const twinRacers = revealedRacers.filter(({ athlete }) => athlete?.implementationKey === "copy_previous_winner_before_race");
  const hasMissingCopyChoice = eggRacers.some(({ athleteId }) => !copyChoices[athleteId]) || twinRacers.some(
    ({ athleteId }) => previousWinnerAthleteIds.length > 0 && !copyChoices[athleteId],
  );

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
                disabled={!canChangeAthlete(athleteId)}
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

      {eggRacers.length > 0 ? (
        <section className="prediction-panel" aria-label="鸡蛋能力选择">
          <h2>鸡蛋能力选择</h2>
          {eggRacers.map(({ athleteId, athlete }) => (
            <label key={athleteId}>
              <span>{athlete?.displayName ?? athleteId}</span>
              <select
                value={copyChoices[athleteId] ?? ""}
                disabled={!canChangeAthlete(athleteId)}
                onChange={(event) => onCopyChoiceChange(athleteId, event.target.value)}
              >
                <option value="" disabled>
                  从三名候选中选择能力
                </option>
                {(eggCandidates[athleteId] ?? []).map((candidateId) => {
                  const candidate = STANDARD_ATHLETE_BY_ID.get(candidateId);
                  return (
                    <option key={candidateId} value={candidateId}>
                      {`${candidate?.displayName ?? candidateId}：${candidate?.abilityText ?? ""}`}
                    </option>
                  );
                })}
              </select>
            </label>
          ))}
        </section>
      ) : null}

      {twinRacers.length > 0 ? (
        <section className="prediction-panel" aria-label="双胞胎能力选择">
          <h2>双胞胎能力选择</h2>
          {previousWinnerAthleteIds.length > 0 ? twinRacers.map(({ athleteId, athlete }) => (
            <label key={athleteId}>
              <span>{athlete?.displayName ?? athleteId}</span>
              <select
                value={copyChoices[athleteId] ?? ""}
                disabled={!canChangeAthlete(athleteId)}
                onChange={(event) => onCopyChoiceChange(athleteId, event.target.value)}
              >
                <option value="" disabled>
                  选择此前冠军的能力
                </option>
                {previousWinnerAthleteIds.map((candidateId) => {
                  const candidate = STANDARD_ATHLETE_BY_ID.get(candidateId);
                  return (
                    <option key={candidateId} value={candidateId}>
                      {`${candidate?.displayName ?? candidateId}：${candidate?.abilityText ?? ""}`}
                    </option>
                  );
                })}
              </select>
            </label>
          )) : <p>此前尚无冠军，双胞胎本场不复制能力。</p>}
        </section>
      ) : null}

      <footer className="bottom-actions">
        <button className="primary-button" type="button" onClick={onStartRace} disabled={!canStartRace || hasMissingPrediction || hasMissingCopyChoice}>
          Start Race
        </button>
      </footer>
    </main>
  );
}
