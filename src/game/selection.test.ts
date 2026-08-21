import { describe, expect, it } from "vitest";
import {
  beginSelection,
  lockPlayerSelection,
  selectAthleteForRace,
  setMastermindPrediction,
} from "./selection";
import { createInitialGameState } from "./setup";
import type { Rng } from "./rng";
import { STANDARD_ATHLETES } from "./athletes";

const orderedRng: Rng = {
  nextFloat: () => 0,
  nextInt: () => 0,
  rollDie: () => 1,
  shuffle: (items) => [...items],
};

function createSelectionGame() {
  const game = createInitialGameState({
    settings: { playerCount: 2, playerNames: ["Dad", "Kid"] },
    seed: "selection",
    now: 1_000,
  });

  return beginSelection(game);
}

function athleteId(standardName: string): string {
  const athlete = STANDARD_ATHLETES.find((candidate) => candidate.standardName === standardName);
  if (!athlete) {
    throw new Error(`Missing athlete: ${standardName}`);
  }
  return athlete.id;
}

describe("selection flow", () => {
  it("starts with the first player active and no revealed selections", () => {
    const game = createSelectionGame();

    expect(game.phase).toBe("selecting");
    expect(game.selectionState?.activePlayerId).toBe("player-1");
    expect(game.selectionState?.lockedPlayerIds).toEqual([]);
    expect(game.selectionState?.revealed).toBe(false);
    expect(game.selectionState?.selectionsByPlayerId).toEqual({
      "player-1": [],
      "player-2": [],
    });
    expect(game.selectionState?.mastermindPredictionsByAthleteId).toEqual({});
  });

  it("allows every player to select before anyone locks and only reveals after everyone is locked", () => {
    let game = createSelectionGame();
    const firstAthlete = game.players[0].athleteIds[0];
    const secondAthlete = game.players[1].athleteIds[0];

    game = selectAthleteForRace(game, "player-1", firstAthlete);
    game = selectAthleteForRace(game, "player-2", secondAthlete);
    expect(game.selectionState?.selectionsByPlayerId).toEqual({
      "player-1": [firstAthlete],
      "player-2": [secondAthlete],
    });

    game = lockPlayerSelection(game, "player-1", orderedRng);

    expect(game.phase).toBe("selecting");
    expect(game.selectionState?.activePlayerId).toBe("player-2");
    expect(game.selectionState?.lockedPlayerIds).toEqual(["player-1"]);
    expect(game.selectionState?.revealed).toBe(false);

    game = lockPlayerSelection(game, "player-2", orderedRng);

    expect(game.phase).toBe("raceReveal");
    expect(game.selectionState?.activePlayerId).toBeNull();
    expect(game.selectionState?.lockedPlayerIds).toEqual(["player-1", "player-2"]);
    expect(game.selectionState?.revealed).toBe(true);
    expect(game.selectionState?.selectionsByPlayerId).toEqual({
      "player-1": [firstAthlete],
      "player-2": [secondAthlete],
    });
  });

  it("stores Mastermind predictions after racers are revealed", () => {
    let game = createSelectionGame();
    const firstAthlete = game.players[0].athleteIds[0];
    const secondAthlete = game.players[1].athleteIds[0];

    game = selectAthleteForRace(game, "player-1", firstAthlete);
    game = lockPlayerSelection(game, "player-1", orderedRng);
    game = selectAthleteForRace(game, "player-2", secondAthlete);
    game = lockPlayerSelection(game, "player-2", orderedRng);
    game = setMastermindPrediction(game, firstAthlete, secondAthlete);

    expect(game.selectionState?.mastermindPredictionsByAthleteId[firstAthlete]).toBe(secondAthlete);
  });

  it("draws Egg's three candidates after excluding every player's assigned racers", () => {
    const eggId = athleteId("Egg");
    const bananaId = athleteId("Banana");
    const coachId = athleteId("Coach");
    const selectionGame = createSelectionGame();
    let game = {
      ...selectionGame,
      players: selectionGame.players.map((player, index) => ({
        ...player,
        athleteIds: index === 0 ? [eggId, coachId] : [bananaId],
      })),
    };

    game = selectAthleteForRace(game, "player-1", eggId);
    game = lockPlayerSelection(game, "player-1", orderedRng);
    game = selectAthleteForRace(game, "player-2", bananaId);
    game = lockPlayerSelection(game, "player-2", orderedRng);

    const candidates = game.selectionState?.eggCandidatesByAthleteId[eggId] ?? [];
    expect(candidates).toHaveLength(3);
    expect(candidates).not.toContain(eggId);
    expect(candidates).not.toContain(bananaId);
    expect(candidates).not.toContain(coachId);
  });

  it("repeats Egg candidates only when fewer than three unassigned racers remain", () => {
    const eggId = athleteId("Egg");
    const bananaId = athleteId("Banana");
    const remainingId = athleteId("Blimp");
    const selectionGame = createSelectionGame();
    const gameWithAlmostEveryRacerAssigned = {
      ...selectionGame,
      players: selectionGame.players.map((player, index) => ({
        ...player,
        athleteIds: index === 0
          ? STANDARD_ATHLETES.filter((athlete) => athlete.id !== remainingId && athlete.id !== bananaId).map((athlete) => athlete.id)
          : [bananaId],
      })),
    };
    let game = selectAthleteForRace(gameWithAlmostEveryRacerAssigned, "player-1", eggId);

    game = lockPlayerSelection(game, "player-1", orderedRng);
    game = selectAthleteForRace(game, "player-2", bananaId);
    game = lockPlayerSelection(game, "player-2", orderedRng);

    expect(game.selectionState?.eggCandidatesByAthleteId[eggId]).toEqual([remainingId, remainingId, remainingId]);
  });

  it("requires two selected racers when the game is configured for two racers per player", () => {
    let game = beginSelection(
      createInitialGameState({
        settings: { playerCount: 2, racersPerPlayerPerRace: 2 },
        seed: "selection-two-racers",
        now: 1_000,
      }),
    );
    const [firstAthlete, secondAthlete] = game.players[0].athleteIds;

    game = selectAthleteForRace(game, "player-1", firstAthlete);
    expect(() => lockPlayerSelection(game, "player-1", orderedRng)).toThrow("must select 2 racer");

    game = selectAthleteForRace(game, "player-1", secondAthlete);
    game = lockPlayerSelection(game, "player-1", orderedRng);

    expect(game.selectionState?.selectionsByPlayerId["player-1"]).toEqual([firstAthlete, secondAthlete]);
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

    expect(() => lockPlayerSelection(game, "player-1", orderedRng)).toThrow("must select");
  });
});
