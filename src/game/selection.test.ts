import { describe, expect, it } from "vitest";
import { beginSelection, lockPlayerSelection, selectAthleteForRace } from "./selection";
import { createInitialGameState } from "./setup";

function createSelectionGame() {
  const game = createInitialGameState({
    settings: { playerCount: 2, playerNames: ["Dad", "Kid"] },
    seed: "selection",
    now: 1_000,
  });

  return beginSelection(game);
}

describe("selection flow", () => {
  it("starts with the first player active and no revealed selections", () => {
    const game = createSelectionGame();

    expect(game.phase).toBe("selecting");
    expect(game.selectionState?.activePlayerId).toBe("player-1");
    expect(game.selectionState?.lockedPlayerIds).toEqual([]);
    expect(game.selectionState?.revealed).toBe(false);
    expect(game.selectionState?.selectionsByPlayerId).toEqual({
      "player-1": null,
      "player-2": null,
    });
  });

  it("locks players one by one and only reveals after everyone is locked", () => {
    let game = createSelectionGame();
    const firstAthlete = game.players[0].athleteIds[0];
    const secondAthlete = game.players[1].athleteIds[0];

    game = selectAthleteForRace(game, "player-1", firstAthlete);
    game = lockPlayerSelection(game, "player-1");

    expect(game.phase).toBe("selecting");
    expect(game.selectionState?.activePlayerId).toBe("player-2");
    expect(game.selectionState?.lockedPlayerIds).toEqual(["player-1"]);
    expect(game.selectionState?.revealed).toBe(false);

    game = selectAthleteForRace(game, "player-2", secondAthlete);
    game = lockPlayerSelection(game, "player-2");

    expect(game.phase).toBe("raceReveal");
    expect(game.selectionState?.activePlayerId).toBeNull();
    expect(game.selectionState?.lockedPlayerIds).toEqual(["player-1", "player-2"]);
    expect(game.selectionState?.revealed).toBe(true);
    expect(game.selectionState?.selectionsByPlayerId).toEqual({
      "player-1": firstAthlete,
      "player-2": secondAthlete,
    });
  });

  it("prevents selecting a used racer", () => {
    const game = createSelectionGame();
    const usedAthleteId = game.players[0].athleteIds[0];
    const gameWithUsedRacer = {
      ...game,
      players: game.players.map((player) =>
        player.id === "player-1" ? { ...player, usedAthleteIds: [usedAthleteId] } : player,
      ),
    };

    expect(() => selectAthleteForRace(gameWithUsedRacer, "player-1", usedAthleteId)).toThrow("already been used");
  });

  it("requires a selected racer before locking", () => {
    const game = createSelectionGame();

    expect(() => lockPlayerSelection(game, "player-1")).toThrow("must select");
  });
});
