import { describe, expect, it } from "vitest";
import { STANDARD_ATHLETES } from "./athletes";
import { reduceGameCommand } from "./raceEngine";
import { createRng } from "./rng";
import { createInitialGameState } from "./setup";
import type { Rng } from "./rng";
import type { GameState, RaceState } from "./types";

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

function createRace(athleteNames: string[], trackLength = 30, previousWinnerName?: string): GameState {
  const rng = scriptedRng([6]);
  let game = createInitialGameState({
    settings: {
      playerCount: athleteNames.length,
      playerNames: athleteNames.map((_, index) => `P${index + 1}`),
      trackLength,
    },
    seed: `advanced-${athleteNames.join("-")}`,
    now: 1_000,
  });

  game = {
    ...game,
    raceIndex: previousWinnerName ? 1 : 0,
    races: previousWinnerName
      ? game.races.map((race, index) =>
          index === 0
            ? {
                ...race,
                finishers: [
                  {
                    entrantId: "player-2",
                    playerId: "player-2",
                    athleteId: athleteId(previousWinnerName),
                    rank: 1,
                  },
                ],
              }
            : race,
        )
      : game.races,
    players: game.players.map((player, index) => ({
      ...player,
      athleteIds: [athleteId(athleteNames[index])],
    })),
  };

  game = reduceGameCommand(game, { type: "BEGIN_SELECTION" }, rng);

  for (const [index, athleteName] of athleteNames.entries()) {
    const playerId = `player-${index + 1}`;
    game = reduceGameCommand(game, { type: "SELECT_ATHLETE", playerId, athleteId: athleteId(athleteName) }, rng);
    game = reduceGameCommand(game, { type: "LOCK_SELECTION", playerId }, rng);
  }

  return reduceGameCommand(game, { type: "REVEAL_RACE" }, rng);
}

function roll(game: GameState, playerId: string, rolls: number[]): GameState {
  return reduceGameCommand(game, { type: "ROLL_DICE", playerId }, scriptedRng(rolls));
}

function setPositions(game: GameState, positions: Record<string, number>, currentPlayerId = "player-1"): GameState {
  const race = requireRace(game);
  const currentTurnIndex = race.turnOrder.findIndex((playerId) => playerId === currentPlayerId);

  return {
    ...game,
    activeRace: {
      ...race,
      currentTurnIndex: currentTurnIndex < 0 ? race.currentTurnIndex : currentTurnIndex,
      entrants: race.entrants.map((entrant) => ({
        ...entrant,
        position: positions[entrant.playerId] ?? entrant.position,
      })),
    },
  };
}

function position(game: GameState, playerId: string): number {
  return entrant(game, playerId).position;
}

function entrant(game: GameState, playerId: string) {
  const found = requireRace(game).entrants.find((candidate) => candidate.playerId === playerId);

  if (!found) {
    throw new Error(`Missing entrant: ${playerId}`);
  }

  return found;
}

function requireRace(game: GameState): RaceState {
  if (!game.activeRace) {
    throw new Error("Expected active race");
  }

  return game.activeRace;
}

function messages(game: GameState): string[] {
  return game.log.map((entry) => entry.message);
}

describe("phase 8 abilities", () => {
  it("Baba Yaga, Banana, and Centaur react to shared stops and passing", () => {
    const game = roll(setPositions(createRace(["Centaur", "Banana", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 2,
      "player-3": 5,
    }), "player-1", [5]);

    expect(position(game, "player-2")).toBe(0);
    expect(entrant(game, "player-1").skippedTurns).toBeGreaterThanOrEqual(1);
    expect(messages(game).some((message) => message.includes("being passed"))).toBe(true);
    expect(messages(game).some((message) => message.includes("pushed them back"))).toBe(true);
    expect(messages(game).some((message) => message.includes("shared stop"))).toBe(true);
  });

  it("Cheerleader, Lovable Loser, Heckler, Romantic, Scoocher, and Suckerfish can trigger", () => {
    let game = roll(setPositions(createRace(["Cheerleader", "Lovable Loser", "Heckler", "Romantic"]), {
      "player-1": 3,
      "player-2": 0,
      "player-3": 4,
      "player-4": 8,
    }), "player-1", [1]);

    expect(messages(game).some((message) => message.includes("cheered"))).toBe(true);

    game = roll(setPositions(createRace(["Lovable Loser", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 4,
    }), "player-1", [1]);
    expect(game.players[0].score).toBe(1);

    game = roll(setPositions(createRace(["Baba Yaga", "Heckler"]), {
      "player-1": 0,
      "player-2": 4,
    }), "player-1", [1]);
    expect(position(game, "player-2")).toBe(6);

    game = roll(setPositions(createRace(["Alchemist", "Baba Yaga", "Romantic"]), {
      "player-1": 0,
      "player-2": 4,
      "player-3": 7,
    }), "player-1", [4]);
    expect(position(game, "player-3")).toBe(9);

    game = roll(createRace(["Alchemist", "Scoocher"]), "player-1", [1]);
    expect(position(game, "player-2")).toBe(1);

    game = roll(createRace(["Alchemist", "Suckerfish"]), "player-1", [3]);
    expect(position(game, "player-2")).toBe(position(game, "player-1"));
  });

  it("Dicemonger, Inchworm, and Lackey react to other racers' rolls", () => {
    let game = roll(createRace(["Alchemist", "Dicemonger"]), "player-1", [2, 6]);

    expect(position(game, "player-1")).toBe(6);
    expect(position(game, "player-2")).toBe(1);

    game = roll(createRace(["Alchemist", "Inchworm"]), "player-1", [1]);
    expect(position(game, "player-1")).toBe(0);
    expect(position(game, "player-2")).toBe(1);

    game = roll(createRace(["Alchemist", "Lackey"]), "player-1", [6]);
    expect(position(game, "player-2")).toBe(2);
  });
});

describe("phase 9 abilities", () => {
  it("Blimp, Copycat, Egg, Flip Flop, Genius, Huge Baby, Hypnotist, and Leaptoad can trigger", () => {
    let game = roll(createRace(["Blimp", "Baba Yaga"]), "player-1", [1]);
    expect(position(game, "player-1")).toBe(4);

    game = roll(setPositions(createRace(["Copycat", "Legs"]), {
      "player-1": 0,
      "player-2": 4,
    }), "player-1", [1]);
    expect(position(game, "player-1")).toBe(5);

    game = roll(createRace(["Egg", "Baba Yaga"]), "player-1", [1]);
    expect(position(game, "player-1")).toBe(4);

    game = roll(setPositions(createRace(["Flip Flop", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 5,
    }), "player-1", [6]);
    expect(position(game, "player-1")).toBe(5);
    expect(position(game, "player-2")).toBe(0);

    game = roll(createRace(["Genius", "Baba Yaga"]), "player-1", [4]);
    expect(requireRace(game).turnOrder[requireRace(game).currentTurnIndex]).toBe("player-1");

    game = roll(setPositions(createRace(["Alchemist", "Huge Baby"]), {
      "player-1": 0,
      "player-2": 3,
    }), "player-1", [3]);
    expect(position(game, "player-1")).toBe(2);

    game = roll(setPositions(createRace(["Hypnotist", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 6,
    }), "player-1", [1]);
    expect(position(game, "player-2")).toBe(0);

    game = roll(setPositions(createRace(["Leaptoad", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 1,
    }), "player-1", [2]);
    expect(position(game, "player-1")).toBe(3);
  });

  it("Mastermind, M.O.U.T.H., Party Animal, Sisyphus, Skipper, Stickler, Third Wheel, and Twin can trigger", () => {
    let game = roll(createRace(["Mastermind", "Baba Yaga"], 1), "player-1", [6]);
    game = roll(game, "player-2", [6]);
    expect(game.phase).toBe("raceResults");
    expect(game.players[0].score).toBe(4);

    game = roll(setPositions(createRace(["M.O.U.T.H.", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 3,
    }), "player-1", [3]);
    expect(entrant(game, "player-2").eliminated).toBe(true);

    game = roll(setPositions(createRace(["Party Animal", "Baba Yaga", "Banana"]), {
      "player-1": 3,
      "player-2": 1,
      "player-3": 4,
    }), "player-1", [1]);
    expect(position(game, "player-1")).toBe(5);

    game = roll(createRace(["Sisyphus", "Baba Yaga"]), "player-1", [6]);
    expect(game.players[0].score).toBe(3);
    expect(position(game, "player-1")).toBe(6);

    game = roll(createRace(["Alchemist", "Baba Yaga", "Skipper"]), "player-1", [1]);
    expect(requireRace(game).turnOrder[requireRace(game).currentTurnIndex]).toBe("player-3");

    game = roll(setPositions(createRace(["Alchemist", "Stickler"], 10), {
      "player-1": 8,
      "player-2": 0,
    }), "player-1", [3]);
    expect(position(game, "player-1")).toBe(9);
    expect(entrant(game, "player-1").finished).toBe(false);

    game = roll(setPositions(createRace(["Third Wheel", "Baba Yaga", "Banana"]), {
      "player-1": 0,
      "player-2": 4,
      "player-3": 4,
    }), "player-1", [1]);
    expect(position(game, "player-1")).toBe(5);

    game = roll(createRace(["Twin", "Baba Yaga"], 30, "Alchemist"), "player-1", [1]);
    expect(position(game, "player-1")).toBe(4);
  });
});

describe("ability simulation", () => {
  it("runs 1000 local games without deadlocking", () => {
    for (let index = 0; index < 1_000; index += 1) {
      let game = createInitialGameState({
        settings: {
          playerCount: 4,
          playerNames: ["P1", "P2", "P3", "P4"],
          trackLength: 18,
        },
        seed: `simulation-${index}`,
        now: 1_000,
      });
      const rng = createRng(`simulation-rolls-${index}`);
      let actions = 0;

      while (game.phase !== "finalResults" && actions < 500) {
        if (game.phase === "teamReveal") {
          game = reduceGameCommand(game, { type: "BEGIN_SELECTION" }, rng);
          continue;
        }

        if (game.phase === "selecting" || game.phase === "raceReveal") {
          for (const player of game.players) {
            if (game.selectionState?.lockedPlayerIds.includes(player.id)) {
              continue;
            }

            const athleteId = player.athleteIds.find((candidate) => !player.usedAthleteIds.includes(candidate));

            if (!athleteId) {
              throw new Error(`No available athlete for ${player.id}`);
            }

            game = reduceGameCommand(game, { type: "SELECT_ATHLETE", playerId: player.id, athleteId }, rng);
            game = reduceGameCommand(game, { type: "LOCK_SELECTION", playerId: player.id }, rng);
          }
          game = reduceGameCommand(game, { type: "REVEAL_RACE" }, rng);
          continue;
        }

        if (game.phase === "racing") {
          const race = requireRace(game);
          const playerId = race.turnOrder[race.currentTurnIndex];
          game = reduceGameCommand(game, { type: "ROLL_DICE", playerId }, rng);
          actions += 1;
          continue;
        }

        if (game.phase === "raceResults") {
          game = reduceGameCommand(game, { type: "BEGIN_NEXT_RACE" }, rng);
          continue;
        }
      }

      expect(game.phase, `simulation-${index} stopped at ${game.phase} after ${actions} actions`).toBe("finalResults");
      expect(actions, `simulation-${index} used too many actions`).toBeLessThan(500);
    }
  });
});
