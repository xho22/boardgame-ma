import { describe, expect, it } from "vitest";
import { reduceGameCommand } from "./raceEngine";
import type { GameState } from "./types";
import { createInitialGameState } from "./setup";
import type { Rng } from "./rng";

const sixRng: Rng = {
  nextFloat: () => 0.99,
  nextInt: (maxExclusive) => maxExclusive - 1,
  rollDie: () => 6,
  shuffle: (items) => [...items],
};

function createReadyRaceGame(trackLength = 6, racersPerPlayerPerRace: 1 | 2 = 1): GameState {
  let game = createInitialGameState({
    settings: {
      playerCount: 2,
      playerNames: ["Dad", "Kid"],
      trackLength,
      racersPerPlayerPerRace,
    },
    seed: "race-engine",
    now: 1_000,
  });

  game = reduceGameCommand(game, { type: "BEGIN_SELECTION" }, sixRng);

  for (const player of game.players) {
    const athleteIds = player.athleteIds
      .filter((candidate) => !player.usedAthleteIds.includes(candidate))
      .slice(0, racersPerPlayerPerRace);

    if (athleteIds.length !== racersPerPlayerPerRace) {
      throw new Error(`No available athlete for ${player.id}`);
    }

    for (const athleteId of athleteIds) {
      game = reduceGameCommand(game, { type: "SELECT_ATHLETE", playerId: player.id, athleteId }, sixRng);
    }
    game = reduceGameCommand(game, { type: "LOCK_SELECTION", playerId: player.id }, sixRng);
  }

  return reduceGameCommand(selectDefaultCopyChoices(game), { type: "REVEAL_RACE" }, sixRng);
}

function selectDefaultCopyChoices(game: GameState): GameState {
  const selection = game.selectionState;
  if (!selection) {
    return game;
  }

  const previousWinnerAthleteIds = [...new Set(
    game.races
      .slice(0, game.raceIndex)
      .flatMap((race) => race.finishers)
      .filter((finisher) => finisher.rank === 1)
      .map((finisher) => finisher.athleteId),
  )];
  const choices = { ...selection.copiedAbilityAthleteIdByAthleteId };

  for (const [athleteId, candidates] of Object.entries(selection.eggCandidatesByAthleteId)) {
    if (candidates[0]) {
      choices[athleteId] = candidates[0];
    }
  }

  for (const athleteId of Object.values(selection.selectionsByPlayerId).flat()) {
    if (previousWinnerAthleteIds[0] && !choices[athleteId]) {
      choices[athleteId] = previousWinnerAthleteIds[0];
    }
  }

  return {
    ...game,
    selectionState: { ...selection, copiedAbilityAthleteIdByAthleteId: choices },
  };
}

function finishActiveRace(game: GameState): GameState {
  let nextGame = game;

  while (nextGame.phase === "racing") {
    const race = nextGame.activeRace;

    if (!race) {
      throw new Error("Expected active race");
    }

    const playerId = race.turnOrder[race.currentTurnIndex];
    nextGame = reduceGameCommand(nextGame, { type: "ROLL_DICE", playerId }, sixRng);
  }

  return nextGame;
}

describe("race engine", () => {
  it("initializes a race from revealed selections", () => {
    const game = createReadyRaceGame();

    expect(game.phase).toBe("racing");
    expect(game.activeRace?.raceNumber).toBe(1);
    expect(game.activeRace?.trackLength).toBe(6);
    expect(game.activeRace?.turnOrder).toEqual(["player-1", "player-2"]);
    expect(game.activeRace?.entrants).toHaveLength(2);
    expect(game.selectionState).toBeNull();
    expect(game.players[0].usedAthleteIds).toHaveLength(1);
    expect(game.players[1].usedAthleteIds).toHaveLength(1);
  });

  it("initializes a small game race with two racers per player", () => {
    const game = createReadyRaceGame(6, 2);

    expect(game.activeRace?.entrants).toHaveLength(4);
    expect(game.activeRace?.turnOrder).toEqual([
      "player-1:racer-1",
      "player-2:racer-1",
      "player-1:racer-2",
      "player-2:racer-2",
    ]);
    expect(game.players[0].usedAthleteIds).toHaveLength(2);
    expect(game.players[1].usedAthleteIds).toHaveLength(2);
  });

  it("finishes a two player race and awards first and second place points", () => {
    const game = finishActiveRace(createReadyRaceGame());

    expect(game.phase).toBe("raceResults");
    expect(game.activeRace?.status).toBe("complete");
    expect(game.activeRace?.finishers).toEqual([
      {
        entrantId: "player-1",
        playerId: "player-1",
        athleteId: game.players[0].usedAthleteIds[0],
        rank: 1,
      },
      {
        entrantId: "player-2",
        playerId: "player-2",
        athleteId: game.players[1].usedAthleteIds[0],
        rank: 2,
      },
    ]);
    expect(game.players[0].score).toBe(3);
    expect(game.players[1].score).toBe(1);
    expect(game.players[0].firstPlaces).toBe(1);
    expect(game.players[1].secondPlaces).toBe(1);
    expect(game.races[0].finishers).toHaveLength(2);
  });

  it("prevents rolling out of turn", () => {
    const game = createReadyRaceGame();

    expect(() => reduceGameCommand(game, { type: "ROLL_DICE", playerId: "player-2" }, sixRng)).toThrow(
      "not player-2",
    );
  });

  it("can run four races and then enter final results", () => {
    let game = createReadyRaceGame(1);

    for (let raceIndex = 0; raceIndex < 4; raceIndex += 1) {
      game = finishActiveRace(game);
      expect(game.phase).toBe("raceResults");

      game = reduceGameCommand(game, { type: "BEGIN_NEXT_RACE" }, sixRng);

      if (raceIndex === 3) {
        break;
      }

      expect(game.phase).toBe("teamReveal");
      game = reduceGameCommand(game, { type: "BEGIN_SELECTION" }, sixRng);

      for (const player of game.players) {
        const athleteId = player.athleteIds.find((candidate) => !player.usedAthleteIds.includes(candidate));

        if (!athleteId) {
          throw new Error(`No available athlete for ${player.id}`);
        }

        game = reduceGameCommand(game, { type: "SELECT_ATHLETE", playerId: player.id, athleteId }, sixRng);
        game = reduceGameCommand(game, { type: "LOCK_SELECTION", playerId: player.id }, sixRng);
      }

      game = reduceGameCommand(selectDefaultCopyChoices(game), { type: "REVEAL_RACE" }, sixRng);
    }

    expect(game.phase).toBe("finalResults");
    expect(game.players[0].score).toBe(16);
    expect(game.players[1].score).toBe(8);
    expect(game.players[0].usedAthleteIds).toHaveLength(4);
    expect(game.players[1].usedAthleteIds).toHaveLength(4);
  });
});
