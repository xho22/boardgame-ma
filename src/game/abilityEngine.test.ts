import { describe, expect, it } from "vitest";
import { STANDARD_ATHLETES } from "./athletes";
import { reduceGameCommand } from "./raceEngine";
import { createInitialGameState } from "./setup";
import type { Rng } from "./rng";
import type { GameState } from "./types";

function scriptedRng(rolls: number[]): Rng {
  let rollIndex = 0;

  return {
    nextFloat: () => 0.5,
    nextInt: (maxExclusive) => Math.floor(maxExclusive / 2),
    rollDie: () => rolls[rollIndex++] ?? rolls[rolls.length - 1] ?? 1,
    shuffle: (items) => [...items],
  };
}

function athleteId(standardName: string): string {
  const athlete = STANDARD_ATHLETES.find((candidate) => candidate.standardName === standardName);

  if (!athlete) {
    throw new Error(`Missing athlete: ${standardName}`);
  }

  return athlete.id;
}

function createRace(firstAthlete: string, secondAthlete: string, trackLength = 30): GameState {
  const firstAthleteId = athleteId(firstAthlete);
  const secondAthleteId = athleteId(secondAthlete);
  const rng = scriptedRng([6]);
  let game = createInitialGameState({
    settings: {
      playerCount: 2,
      playerNames: ["Dad", "Kid"],
      trackLength,
    },
    seed: "ability-test",
    now: 1_000,
  });

  game = {
    ...game,
    players: game.players.map((player, index) => ({
      ...player,
      athleteIds: index === 0 ? [firstAthleteId] : [secondAthleteId],
    })),
  };

  game = reduceGameCommand(game, { type: "BEGIN_SELECTION" }, rng);
  game = reduceGameCommand(game, { type: "SELECT_ATHLETE", playerId: "player-1", athleteId: firstAthleteId }, rng);
  game = reduceGameCommand(game, { type: "LOCK_SELECTION", playerId: "player-1" }, rng);
  game = reduceGameCommand(game, { type: "SELECT_ATHLETE", playerId: "player-2", athleteId: secondAthleteId }, rng);
  game = reduceGameCommand(game, { type: "LOCK_SELECTION", playerId: "player-2" }, rng);
  return reduceGameCommand(game, { type: "REVEAL_RACE" }, rng);
}

function roll(game: GameState, playerId: string, rolls: number[]): GameState {
  return reduceGameCommand(game, { type: "ROLL_DICE", playerId }, scriptedRng(rolls));
}

function entrantPosition(game: GameState, playerId: string): number {
  const entrant = game.activeRace?.entrants.find((candidate) => candidate.playerId === playerId);

  if (!entrant) {
    throw new Error(`Missing entrant: ${playerId}`);
  }

  return entrant.position;
}

function latestMessages(game: GameState): string[] {
  return game.log.map((entry) => entry.message);
}

describe("phase 7 abilities", () => {
  it("Alchemist turns a main move roll of 1 or 2 into 4 spaces", () => {
    const game = roll(createRace("Alchemist", "Baba Yaga"), "player-1", [1]);

    expect(entrantPosition(game, "player-1")).toBe(4);
    expect(latestMessages(game).some((message) => message.includes("Alchemist"))).toBe(true);
  });

  it("Coach gives racers sharing the coach space +1 to main move", () => {
    const game = roll(createRace("Coach", "Baba Yaga"), "player-1", [1]);

    expect(entrantPosition(game, "player-1")).toBe(2);
    expect(latestMessages(game).some((message) => message.includes("coached"))).toBe(true);
  });

  it("Gunk gives other racers -1 to main move without changing the die", () => {
    const game = roll(createRace("Alchemist", "Gunk"), "player-1", [4]);

    expect(game.activeRace?.previousFinalMoveValue).toBe(3);
    expect(entrantPosition(game, "player-1")).toBe(3);
    expect(latestMessages(game)).toContain("player-1 rolled 4.");
  });

  it("Hare gains +2 unless it starts the turn alone in the lead", () => {
    const boosted = roll(createRace("Hare", "Baba Yaga"), "player-1", [1]);

    expect(entrantPosition(boosted, "player-1")).toBe(3);

    const leadingRace = boosted.activeRace;

    if (!leadingRace) {
      throw new Error("Expected active race");
    }

    const leadingGame = {
      ...boosted,
      activeRace: {
        ...leadingRace,
        currentTurnIndex: 0,
      },
    };
    const skipped = roll(leadingGame, "player-1", [6]);

    expect(entrantPosition(skipped, "player-1")).toBe(3);
    expect(latestMessages(skipped).some((message) => message.includes("alone in the lead"))).toBe(true);
  });

  it("Legs can replace the roll with a fixed main move of 5", () => {
    const game = roll(createRace("Legs", "Baba Yaga"), "player-1", [1]);

    expect(entrantPosition(game, "player-1")).toBe(5);
    expect(latestMessages(game).some((message) => message.includes("skip rolling"))).toBe(true);
  });

  it("Magician rerolls low main move rolls up to two times and uses the final roll", () => {
    const game = roll(createRace("Magician", "Baba Yaga"), "player-1", [2, 3, 6]);

    expect(entrantPosition(game, "player-1")).toBe(6);
    expect(latestMessages(game).some((message) => message.includes("2 -> 3 -> 6"))).toBe(true);
  });

  it("Rocket Scientist doubles the main move and trips until the next main move", () => {
    let game = roll(createRace("Rocket Scientist", "Baba Yaga"), "player-1", [3]);

    expect(entrantPosition(game, "player-1")).toBe(6);
    expect(game.activeRace?.entrants.find((entrant) => entrant.playerId === "player-1")?.skippedTurns).toBe(1);

    game = roll(game, "player-2", [1]);
    game = roll(game, "player-1", [6]);

    expect(entrantPosition(game, "player-1")).toBe(6);
    expect(game.activeRace?.entrants.find((entrant) => entrant.playerId === "player-1")?.skippedTurns).toBe(0);
    expect(latestMessages(game).some((message) => message.includes("recovered from trip"))).toBe(true);
  });
});
