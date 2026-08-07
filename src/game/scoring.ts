import type { Finisher, GameState, Player } from "./types";

export function applyRaceScoring(game: GameState, finishers: Finisher[]): GameState {
  const raceSummary = game.races[game.raceIndex];

  if (!raceSummary) {
    throw new Error(`Missing race summary for index ${game.raceIndex}`);
  }

  const firstFinisher = finishers.find((finisher) => finisher.rank === 1);
  const secondFinisher = finishers.find((finisher) => finisher.rank === 2);

  const players = game.players.map((player) =>
    scorePlayer(player, firstFinisher, secondFinisher, raceSummary.firstPlacePoints, raceSummary.secondPlacePoints),
  );
  const races = game.races.map((race, index) =>
    index === game.raceIndex
      ? {
          ...race,
          finishers,
        }
      : race,
  );

  return {
    ...game,
    players,
    races,
  };
}

export function isGameComplete(game: GameState): boolean {
  return game.raceIndex >= game.settings.racesCount - 1;
}

function scorePlayer(
  player: Player,
  firstFinisher: Finisher | undefined,
  secondFinisher: Finisher | undefined,
  firstPlacePoints: number,
  secondPlacePoints: number,
): Player {
  const firstPoints = firstFinisher?.playerId === player.id ? firstPlacePoints : 0;
  const secondPoints = secondFinisher?.playerId === player.id ? secondPlacePoints : 0;

  if (firstPoints > 0 || secondPoints > 0) {
    return {
      ...player,
      score: player.score + firstPoints + secondPoints,
      firstPlaces: player.firstPlaces + (firstPoints > 0 ? 1 : 0),
      secondPlaces: player.secondPlaces + (secondPoints > 0 ? 1 : 0),
    };
  }

  return player;
}
