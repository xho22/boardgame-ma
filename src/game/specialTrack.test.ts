import { describe, expect, it } from "vitest";
import { STANDARD_ATHLETES } from "./athletes";
import { reduceGameCommand } from "./raceEngine";
import { createInitialGameState } from "./setup";
import { getBoardKind } from "./specialTrack";
import type { Entrant, GameState, RaceState } from "./types";
import type { Rng } from "./rng";

const fixedRng: Rng = {
  nextFloat: () => 0.5,
  nextInt: (maxExclusive) => Math.floor(maxExclusive / 2),
  rollDie: () => 1,
  shuffle: (items) => [...items],
};

function athleteId(name: string): string {
  const athlete = STANDARD_ATHLETES.find((candidate) => candidate.standardName === name);
  if (!athlete) throw new Error(`Missing ${name}`);
  return athlete.id;
}

function createSpecialRace(firstAthlete = "Baba Yaga", position = 0): GameState {
  const game = createInitialGameState({
    settings: { playerCount: 2, playerNames: ["Dad", "Kid"], trackLength: 30, boardMode: "allSpecial" },
    seed: "special-track",
    now: 1_000,
  });
  const entrants: Entrant[] = game.players.map((player, index) => ({
    id: player.id,
    playerId: player.id,
    athleteId: athleteId(index === 0 ? firstAthlete : "Baba Yaga"),
    position: index === 0 ? position : 0,
    finished: false,
    finishRank: null,
    skippedTurns: 0,
    actionCount: 0,
    abilityUses: {},
    temporaryEffects: [],
  }));
  const activeRace: RaceState = {
    id: "race-1",
    raceNumber: 1,
    trackLength: 30,
    boardKind: "special",
    firstPlacePoints: 5,
    secondPlacePoints: 2,
    turnOrder: entrants.map((entrant) => entrant.id),
    currentTurnIndex: 0,
    entrants,
    finishers: [],
    round: 1,
    previousFinalMoveValue: null,
    pendingReactions: [],
    pendingTurnState: null,
    status: "active",
  };

  return { ...game, phase: "racing", activeRace };
}

function roll(game: GameState, forcedDieRoll: 1 | 2 | 3 | 4 | 5 | 6, useLegsFixedMove = false): GameState {
  return reduceGameCommand(
    game,
    { type: "ROLL_DICE", playerId: "player-1", choice: { forcedDieRoll, useLegsFixedMove } },
    fixedRng,
  );
}

describe("special track", () => {
  it("alternates normal and special races, with an all-special debug override", () => {
    expect(getBoardKind(1, "alternating")).toBe("normal");
    expect(getBoardKind(2, "alternating")).toBe("special");
    expect(getBoardKind(3, "alternating")).toBe("normal");
    expect(getBoardKind(4, "alternating")).toBe("special");
    expect(getBoardKind(1, "allSpecial")).toBe("special");
  });

  it("awards a point when a racer lands on special space 1", () => {
    const game = roll(createSpecialRace(), 1);

    expect(game.players.find((player) => player.id === "player-1")?.score).toBe(1);
    expect(game.activeRace?.entrants[0].position).toBe(1);
    expect(game.log.some((entry) => entry.message.includes("特殊格 1，获得 1 分"))).toBe(true);
  });

  it("trips a racer landing on special space 5", () => {
    const game = roll(createSpecialRace(), 5);

    expect(game.activeRace?.entrants[0].position).toBe(5);
    expect(game.activeRace?.entrants[0].skippedTurns).toBe(1);
  });

  it("resolves chained movement from special space 7", () => {
    const game = roll(createSpecialRace("Baba Yaga", 6), 1);

    expect(game.activeRace?.entrants[0].position).toBe(10);
    expect(game.log.some((entry) => entry.message.includes("特殊格 7，前进 3 格到 10"))).toBe(true);
  });

  it("resolves special spaces reached by a skill movement", () => {
    const game = roll(createSpecialRace("Legs"), 1, true);

    expect(game.activeRace?.entrants[0].position).toBe(5);
    expect(game.activeRace?.entrants[0].skippedTurns).toBe(1);
  });
});
