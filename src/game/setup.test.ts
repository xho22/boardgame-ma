import { describe, expect, it } from "vitest";
import { STANDARD_RACER_NAMES } from "./constants";
import { createRng } from "./rng";
import { createInitialGameState } from "./setup";

describe("createInitialGameState", () => {
  it.each([2, 4, 6])("creates a serializable %i player game", (playerCount) => {
    const game = createInitialGameState({
      settings: { playerCount },
      seed: `seed-${playerCount}`,
      now: 1_000,
    });

    expect(game.players).toHaveLength(playerCount);
    expect(game.athletes).toHaveLength(STANDARD_RACER_NAMES.length);
    expect(game.races).toHaveLength(4);
    expect(game.phase).toBe("teamReveal");
    expect(() => JSON.stringify(game)).not.toThrow();
  });

  it.each([2, 4, 6])("assigns four unique athletes to each player in a %i player game", (playerCount) => {
    const game = createInitialGameState({
      settings: { playerCount },
      seed: `assignment-${playerCount}`,
      now: 1_000,
    });
    const assignedAthleteIds = game.players.flatMap((player) => player.athleteIds);

    for (const player of game.players) {
      expect(player.athleteIds).toHaveLength(4);
      expect(new Set(player.athleteIds).size).toBe(4);
    }

    expect(new Set(assignedAthleteIds).size).toBe(assignedAthleteIds.length);
  });

  it("uses deterministic assignment for the same seed", () => {
    const first = createInitialGameState({ settings: { playerCount: 4 }, seed: "same-seed", now: 1_000 });
    const second = createInitialGameState({ settings: { playerCount: 4 }, seed: "same-seed", now: 1_000 });

    expect(first.players.map((player) => player.athleteIds)).toEqual(
      second.players.map((player) => player.athleteIds),
    );
  });

  it("rejects unsupported player counts", () => {
    expect(() => createInitialGameState({ settings: { playerCount: 1 } })).toThrow("playerCount");
    expect(() => createInitialGameState({ settings: { playerCount: 7 } })).toThrow("playerCount");
  });
});

describe("createRng", () => {
  it("rolls dice inside the requested range", () => {
    const rng = createRng("dice");

    for (let index = 0; index < 100; index += 1) {
      expect(rng.rollDie(6)).toBeGreaterThanOrEqual(1);
      expect(rng.rollDie(6)).toBeLessThanOrEqual(6);
    }
  });
});
