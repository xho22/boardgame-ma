import { STANDARD_ATHLETE_BY_ID } from "../game/athletes";
import type { GameState } from "../game/types";

type RaceResultsScreenProps = {
  game: GameState;
  onContinue: () => void;
};

export function RaceResultsScreen({ game, onContinue }: RaceResultsScreenProps) {
  const race = game.activeRace;
  const isFinalRace = game.raceIndex >= game.settings.racesCount - 1;

  if (!race) {
    return null;
  }

  return (
    <main className="app-shell screen-layout">
      <header className="top-bar reveal-top-bar">
        <span />
        <h1>{`Race ${race.raceNumber} Results`}</h1>
        <span />
      </header>

      <section className="results-list" aria-label="Race finishers">
        {race.finishers.map((finisher) => {
          const player = game.players.find((candidate) => candidate.id === finisher.playerId);
          const athlete = STANDARD_ATHLETE_BY_ID.get(finisher.athleteId);
          const points = finisher.rank === 1 ? race.firstPlacePoints : race.secondPlacePoints;

          return (
            <article className="result-row" key={`${finisher.entrantId}-${finisher.rank}`}>
              <strong>{`#${finisher.rank}`}</strong>
              <div>
                <h2>{player?.name ?? finisher.playerId}</h2>
                <p>{athlete ? `${athlete.displayName} / ${athlete.standardName}` : finisher.athleteId}</p>
              </div>
              <span>{`+${points}`}</span>
            </article>
          );
        })}
      </section>

      <footer className="bottom-actions">
        <button className="primary-button" type="button" onClick={onContinue}>
          {isFinalRace ? "Final Results" : "Next Race"}
        </button>
      </footer>
    </main>
  );
}
