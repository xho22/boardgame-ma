import { describe, expect, it } from "vitest";
import { STANDARD_ATHLETES } from "./athletes";
import { reduceGameCommand } from "./raceEngine";
import { createRng } from "./rng";
import { createInitialGameState } from "./setup";
import type { Rng } from "./rng";
import type { GameState, MainMoveChoice, RaceState } from "./types";

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

function createRace(
  athleteNames: string[],
  trackLength = 30,
  previousWinnerName?: string,
  mastermindPredictionName?: string,
): GameState {
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

  game = setDefaultMastermindPredictions(game, rng, mastermindPredictionName);
  game = setDefaultBeforeRaceCopyChoices(game, rng);

  return reduceGameCommand(game, { type: "REVEAL_RACE" }, rng);
}

function setDefaultBeforeRaceCopyChoices(game: GameState, rng: Rng): GameState {
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

  for (const athleteId of Object.values(selection.selectionsByPlayerId).flat()) {
    const athlete = STANDARD_ATHLETES.find((candidate) => candidate.id === athleteId);
    const candidates = athlete?.implementationKey === "draft_temp_power_before_race"
      ? selection.eggCandidatesByAthleteId[athleteId] ?? []
      : athlete?.implementationKey === "copy_previous_winner_before_race"
        ? previousWinnerAthleteIds
        : [];

    if (candidates[0]) {
      game = reduceGameCommand(
        game,
        { type: "SET_BEFORE_RACE_COPY_CHOICE", athleteId, copiedAthleteId: candidates[0] },
        rng,
      );
    }
  }

  return game;
}

function roll(game: GameState, playerId: string, rolls: number[], choice?: MainMoveChoice): GameState {
  const rng = scriptedRng(rolls);
  let nextGame = reduceGameCommand(game, { type: "ROLL_DICE", playerId, choice }, rng);

  while (nextGame.activeRace?.pendingDiceDecision?.kind !== "dicemonger" && nextGame.activeRace?.pendingDiceDecision) {
    const prompt = nextGame.activeRace.pendingReactions[0];
    const decision = nextGame.activeRace.pendingDiceDecision;
    const accepted = decision.kind === "rocketScientist" ? (choice?.useRocketScientistDouble ?? true) : true;
    nextGame = reduceGameCommand(
      nextGame,
      { type: "CONFIRM_REACTION", playerId: prompt.playerId, reactionId: prompt.id, accepted },
      rng,
    );
  }

  return nextGame;
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

function setDefaultMastermindPredictions(game: GameState, rng: Rng, mastermindPredictionName?: string): GameState {
  const selectedAthleteIds = Object.values(game.selectionState?.selectionsByPlayerId ?? {}).flat();
  let nextGame = game;

  for (const selectedAthleteId of selectedAthleteIds) {
    const athlete = STANDARD_ATHLETES.find((candidate) => candidate.id === selectedAthleteId);

    if (athlete?.implementationKey !== "predict_winner_finish_second") {
      continue;
    }

    const targetAthleteId = mastermindPredictionName ? athleteId(mastermindPredictionName) : selectedAthleteId;
    nextGame = reduceGameCommand(
      nextGame,
      { type: "SET_MASTERMIND_PREDICTION", athleteId: selectedAthleteId, predictedAthleteId: targetAthleteId },
      rng,
    );
  }

  return nextGame;
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
    expect(messages(game).some((message) => message.includes("经过判定"))).toBe(true);
    expect(messages(game).some((message) => message.includes("推回"))).toBe(true);
    expect(messages(game).some((message) => message.includes("同格停留"))).toBe(true);

    const sharedStartBanana = roll(setPositions(createRace(["Banana", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 0,
    }, "player-2"), "player-2", [3]);
    expect(entrant(sharedStartBanana, "player-2").skippedTurns).toBeGreaterThanOrEqual(1);
    expect(messages(sharedStartBanana).some((message) => message.includes("经过判定"))).toBe(true);
  });

  it("Cheerleader, Lovable Loser, Heckler, Romantic, Scoocher, and Suckerfish can trigger", () => {
    let game = roll(setPositions(createRace(["Cheerleader", "Lovable Loser", "Heckler", "Romantic"]), {
      "player-1": 3,
      "player-2": 0,
      "player-3": 4,
      "player-4": 8,
    }), "player-1", [1], { useCheerleader: true });

    expect(messages(game).some((message) => message.includes("啦啦队长"))).toBe(true);
    expect(position(game, "player-2")).toBe(2);
    expect(position(game, "player-1")).toBe(5);

    game = roll(setPositions(createRace(["Lovable Loser", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 4,
    }), "player-1", [1]);
    expect(game.players[0].score).toBe(1);
    expect(messages(game).some((message) => message.includes("独自在最后一名时获得 1 分"))).toBe(true);

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
    expect(requireRace(game).pendingReactions).toHaveLength(1);
    game = reduceGameCommand(
      game,
      {
        type: "CONFIRM_REACTION",
        playerId: "player-2",
        reactionId: requireRace(game).pendingReactions[0].id,
        accepted: true,
      },
      scriptedRng([1]),
    );
    expect(position(game, "player-2")).toBe(position(game, "player-1"));
    expect(messages(game).some((message) => message.includes("跟随"))).toBe(true);
  });

  it("Cheerleader supports only a unique last racer and resolves Banana while doing so", () => {
    const game = roll(setPositions(createRace(["Cheerleader", "Alchemist", "Banana"]), {
      "player-1": 3,
      "player-2": 0,
      "player-3": 1,
    }), "player-1", [1], { useCheerleader: true });

    expect(position(game, "player-2")).toBe(2);
    expect(entrant(game, "player-2").skippedTurns).toBe(1);
    expect(messages(game).some((message) => message.includes("经过判定"))).toBe(true);
  });

  it("Suckerfish queues every shared racer and keeps resolving follow movements", () => {
    let game = roll(createRace(["Alchemist", "Suckerfish", "Suckerfish"]), "player-1", [3]);

    expect(requireRace(game).pendingReactions).toHaveLength(2);

    const firstPrompt = requireRace(game).pendingReactions[0];
    game = reduceGameCommand(
      game,
      { type: "CONFIRM_REACTION", playerId: firstPrompt.playerId, reactionId: firstPrompt.id, accepted: true },
      scriptedRng([1]),
    );
    expect(requireRace(game).pendingReactions).toHaveLength(2);

    while (requireRace(game).pendingReactions.length > 0) {
      const nextPrompt = requireRace(game).pendingReactions[0];
      game = reduceGameCommand(
        game,
        { type: "CONFIRM_REACTION", playerId: nextPrompt.playerId, reactionId: nextPrompt.id, accepted: true },
        scriptedRng([1]),
      );
    }

    expect(requireRace(game).pendingReactions).toHaveLength(0);
    expect(position(game, "player-2")).toBe(3);
    expect(position(game, "player-3")).toBe(3);
  });

  it("Suckerfish can react to ability-driven movement", () => {
    let game = roll(createRace(["Legs", "Suckerfish"]), "player-1", [1], { useLegsFixedMove: true });
    expect(requireRace(game).pendingReactions[0]?.title).toBe("吸盘鱼跟随");

    game = roll(setPositions(createRace(["Romantic", "Suckerfish", "Alchemist", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 0,
      "player-3": 0,
      "player-4": 3,
    }, "player-3"), "player-3", [3]);
    expect(requireRace(game).pendingReactions.some((prompt) => prompt.sourceEntrantId === "player-2" && prompt.targetEntrantId === "player-1")).toBe(true);

    game = roll(setPositions(createRace(["Centaur", "Scoocher", "Suckerfish", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 0,
      "player-3": 0,
      "player-4": 2,
    }), "player-1", [3]);
    expect(requireRace(game).pendingReactions.some((prompt) => prompt.sourceEntrantId === "player-3" && prompt.targetEntrantId === "player-2")).toBe(true);
  });

  it("Dicemonger, Inchworm, and Lackey react to other racers' rolls", () => {
    let game = roll(createRace(["Alchemist", "Dicemonger"]), "player-1", [2, 6]);

    expect(requireRace(game).pendingReactions).toHaveLength(1);
    const rerollPrompt = requireRace(game).pendingReactions[0];
    game = reduceGameCommand(
      game,
      { type: "CONFIRM_REACTION", playerId: rerollPrompt.playerId, reactionId: rerollPrompt.id, accepted: true },
      scriptedRng([6]),
    );
    expect(position(game, "player-1")).toBe(6);
    expect(position(game, "player-2")).toBe(1);

    game = roll(setPositions(createRace(["Alchemist", "Dicemonger", "Suckerfish"]), {
      "player-1": 0,
      "player-2": 0,
      "player-3": 0,
    }), "player-1", [2]);
    const followableRerollPrompt = requireRace(game).pendingReactions[0];
    game = reduceGameCommand(
      game,
      { type: "CONFIRM_REACTION", playerId: followableRerollPrompt.playerId, reactionId: followableRerollPrompt.id, accepted: true },
      scriptedRng([6]),
    );
    expect(requireRace(game).pendingReactions[0]?.title).toBe("吸盘鱼跟随");

    game = roll(createRace(["Alchemist", "Inchworm"]), "player-1", [1]);
    expect(position(game, "player-1")).toBe(0);
    expect(position(game, "player-2")).toBe(1);

    game = roll(createRace(["Alchemist", "Lackey"]), "player-1", [6]);
    expect(position(game, "player-2")).toBe(2);
  });

  it("Gunk reduces other racers' main move and triggers Scoocher", () => {
    const game = roll(createRace(["Baba Yaga", "Gunk", "Scoocher"]), "player-1", [6]);

    expect(requireRace(game).previousFinalMoveValue).toBe(5);
    expect(position(game, "player-1")).toBe(5);
    expect(position(game, "player-3")).toBe(1);
    expect(messages(game).some((message) => message.includes("主移动从 6 减为 5"))).toBe(true);
    expect(messages(game).some((message) => message.includes("在其他选手使用能力后移动 1 格"))).toBe(true);
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
    }), "player-1", [6], { useFlipFlopSwap: true });
    expect(position(game, "player-1")).toBe(5);
    expect(position(game, "player-2")).toBe(0);

    game = roll(setPositions(createRace(["Flip Flop", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 5,
    }), "player-1", [2], { useFlipFlopSwap: false });
    expect(position(game, "player-1")).toBe(2);
    expect(position(game, "player-2")).toBe(5);

    game = roll(setPositions(createRace(["Flip Flop", "Baba Yaga", "Banana"]), {
      "player-1": 5,
      "player-2": 2,
      "player-3": 8,
    }), "player-1", [1], { useFlipFlopSwap: true, flipFlopTargetEntrantId: "player-2" });
    expect(position(game, "player-1")).toBe(2);
    expect(position(game, "player-2")).toBe(5);

    game = roll(createRace(["Genius", "Baba Yaga"]), "player-1", [4], { geniusGuess: 4 });
    expect(requireRace(game).turnOrder[requireRace(game).currentTurnIndex]).toBe("player-1");

    game = roll(setPositions(createRace(["Alchemist", "Huge Baby"]), {
      "player-1": 0,
      "player-2": 3,
    }), "player-1", [3]);
    expect(position(game, "player-1")).toBe(2);

    game = roll(setPositions(createRace(["Hypnotist", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 6,
    }), "player-1", [1], { useHypnotist: true });
    expect(position(game, "player-2")).toBe(0);

    game = roll(setPositions(createRace(["Hypnotist", "Baba Yaga", "Banana"]), {
      "player-1": 0,
      "player-2": 6,
      "player-3": 4,
    }), "player-1", [1], { useHypnotist: true, hypnotistTargetEntrantId: "player-3" });
    expect(position(game, "player-3")).toBe(0);

    game = roll(setPositions(createRace(["Leaptoad", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 1,
    }), "player-1", [2]);
    expect(position(game, "player-1")).toBe(3);
  });

  it("Mastermind, M.O.U.T.H., Party Animal, Sisyphus, Skipper, Stickler, Third Wheel, and Twin can trigger", () => {
    let game = roll(
      setPositions(createRace(["Mastermind", "Baba Yaga"], 1, undefined, "Baba Yaga"), {}, "player-2"),
      "player-2",
      [6],
    );
    expect(game.phase).toBe("raceResults");
    expect(game.players[0].score).toBe(1);
    expect(messages(game).some((message) => message.includes("预测命中"))).toBe(true);

    game = roll(setPositions(createRace(["M.O.U.T.H.", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 3,
    }), "player-1", [3]);
    expect(entrant(game, "player-2").eliminated).toBe(true);

    game = roll(setPositions(createRace(["Party Animal", "Baba Yaga", "Banana"]), {
      "player-1": 3,
      "player-2": 1,
      "player-3": 4,
    }), "player-1", [1], { usePartyAnimal: true });
    expect(position(game, "player-1")).toBe(5);

    game = roll(setPositions(createRace(["Party Animal", "Baba Yaga", "Banana"]), {
      "player-1": 3,
      "player-2": 1,
      "player-3": 4,
    }), "player-1", [1], { usePartyAnimal: false });
    expect(position(game, "player-1")).toBe(4);
    expect(position(game, "player-2")).toBe(1);
    expect(position(game, "player-3")).toBe(4);

    game = roll(setPositions(createRace(["Party Animal", "Baba Yaga"]), {
      "player-1": 3,
      "player-2": 3,
    }), "player-1", [1]);
    expect(position(game, "player-2")).toBe(3);

    game = roll(setPositions(createRace(["Copycat", "Party Animal"]), {
      "player-1": 0,
      "player-2": 4,
    }), "player-1", [1], { usePartyAnimal: true });
    expect(position(game, "player-2")).toBe(3);
    expect(messages(game).some((message) => message.includes("模仿猫") && message.includes("派对动物"))).toBe(true);

    game = createRace(["Sisyphus", "Baba Yaga"]);
    expect(game.players[0].score).toBe(4);
    expect(messages(game).some((message) => message.includes("赛前获得 4 分"))).toBe(true);
    game = roll(game, "player-1", [6]);
    expect(game.players[0].score).toBe(3);
    expect(position(game, "player-1")).toBe(0);

    game = createRace(["Sisyphus", "Baba Yaga"]);
    game = { ...game, players: game.players.map((player, index) => index === 0 ? { ...player, score: 0 } : player) };
    game = roll(game, "player-1", [6]);
    expect(game.players[0].score).toBe(0);

    game = roll(createRace(["Alchemist", "Baba Yaga", "Skipper"]), "player-1", [1]);
    expect(requireRace(game).turnOrder[requireRace(game).currentTurnIndex]).toBe("player-3");

    game = roll(setPositions(createRace(["Alchemist", "Stickler"], 10), {
      "player-1": 8,
      "player-2": 0,
    }), "player-1", [3]);
    expect(position(game, "player-1")).toBe(9);
    expect(entrant(game, "player-1").finished).toBe(false);
    expect(messages(game).some((message) => message.includes("需要刚好冲线"))).toBe(true);

    game = roll(setPositions(createRace(["Third Wheel", "Baba Yaga", "Banana"]), {
      "player-1": 0,
      "player-2": 4,
      "player-3": 4,
    }), "player-1", [1], { useThirdWheel: true });
    expect(position(game, "player-1")).toBe(5);

    game = roll(setPositions(createRace(["Third Wheel", "Baba Yaga", "Banana", "Alchemist", "Legs"]), {
      "player-1": 0,
      "player-2": 4,
      "player-3": 4,
      "player-4": 7,
      "player-5": 7,
    }), "player-1", [1], { useThirdWheel: true, thirdWheelTargetPosition: 7 });
    expect(position(game, "player-1")).toBe(8);

    game = roll(createRace(["Twin", "Baba Yaga"], 30, "Alchemist"), "player-1", [1]);
    expect(position(game, "player-1")).toBe(4);
  });

  it("Duelist prompts for confirmation and only the winner moves", () => {
    let game = roll(setPositions(createRace(["Duelist", "Alchemist"]), {
      "player-1": 0,
      "player-2": 3,
    }), "player-1", [3]);
    const duelPrompt = requireRace(game).pendingReactions[0];
    expect(duelPrompt?.promptType).toBe("duel");
    game = reduceGameCommand(
      game,
      { type: "CONFIRM_REACTION", playerId: "player-1", reactionId: duelPrompt.id, accepted: true, targetEntrantId: "player-2" },
      scriptedRng([6, 2]),
    );

    expect(position(game, "player-1")).toBe(5);
    expect(entrant(game, "player-2").skippedTurns).toBe(0);
    expect(messages(game).some((message) => message.includes("双方掷出 6 比 2"))).toBe(true);

    game = roll(setPositions(createRace(["Duelist", "Alchemist"]), {
      "player-1": 3,
      "player-2": 0,
    }, "player-2"), "player-2", [3]);
    const movedIntoDuelPrompt = requireRace(game).pendingReactions[0];
    game = reduceGameCommand(
      game,
      { type: "CONFIRM_REACTION", playerId: "player-1", reactionId: movedIntoDuelPrompt.id, accepted: true, targetEntrantId: "player-2" },
      scriptedRng([1, 5]),
    );

    expect(position(game, "player-2")).toBe(5);
    expect(entrant(game, "player-1").skippedTurns).toBe(0);
    expect(messages(game).some((message) => message.includes("双方掷出 1 比 5"))).toBe(true);
  });

  it("does not trigger another duel from the winner's two-step reward", () => {
    let game = roll(setPositions(createRace(["Duelist", "Alchemist", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 3,
      "player-3": 5,
    }), "player-1", [3]);
    const duelPrompt = requireRace(game).pendingReactions[0];
    game = reduceGameCommand(
      game,
      { type: "CONFIRM_REACTION", playerId: "player-1", reactionId: duelPrompt.id, accepted: true, targetEntrantId: "player-2" },
      scriptedRng([6, 2]),
    );

    expect(position(game, "player-1")).toBe(5);
    expect(requireRace(game).pendingReactions.some((prompt) => prompt.promptType === "duel")).toBe(false);
  });

  it("Copycat asks its player to choose a tied leader and uses the selected ability", () => {
    let game = setPositions(createRace(["Copycat", "Party Animal", "Legs"]), {
      "player-1": 0,
      "player-2": 4,
      "player-3": 4,
    });
    game = reduceGameCommand(game, { type: "ROLL_DICE", playerId: "player-1" }, scriptedRng([1]));
    const copyPrompt = requireRace(game).pendingReactions[0];
    expect(copyPrompt?.promptType).toBe("copy");
    game = reduceGameCommand(
      game,
      { type: "CONFIRM_REACTION", playerId: "player-1", reactionId: copyPrompt.id, accepted: true, targetEntrantId: "player-2" },
      scriptedRng([1]),
    );
    expect(requireRace(game).turnOrder[requireRace(game).currentTurnIndex]).toBe("player-1");

    game = roll(game, "player-1", [1], { usePartyAnimal: true });
    expect(position(game, "player-2")).toBe(3);
    expect(position(game, "player-3")).toBe(3);
  });

  it("asks the Copycat player to choose when another racer creates a tied lead", () => {
    const game = reduceGameCommand(
      setPositions(createRace(["Copycat", "Party Animal", "Legs"]), {
        "player-1": 0,
        "player-2": 4,
        "player-3": 4,
      }, "player-2"),
      { type: "ROLL_DICE", playerId: "player-2" },
      scriptedRng([1]),
    );

    expect(requireRace(game).pendingReactions[0]).toMatchObject({ promptType: "copy", playerId: "player-1" });
  });

  it("Duelist wins ties and can choose among multiple opponents", () => {
    let game = roll(setPositions(createRace(["Duelist", "Alchemist"]), {
      "player-1": 0,
      "player-2": 2,
    }), "player-1", [2]);
    const tieDuelPrompt = requireRace(game).pendingReactions[0];
    game = reduceGameCommand(
      game,
      { type: "CONFIRM_REACTION", playerId: "player-1", reactionId: tieDuelPrompt.id, accepted: true, targetEntrantId: "player-2" },
      scriptedRng([4, 4]),
    );

    expect(position(game, "player-1")).toBe(4);
    expect(entrant(game, "player-2").skippedTurns).toBe(0);

    game = roll(setPositions(createRace(["Duelist", "Alchemist", "Baba Yaga"]), {
      "player-1": 0,
      "player-2": 2,
      "player-3": 2,
    }), "player-1", [2]);
    const multiDuelPrompt = requireRace(game).pendingReactions[0];
    game = reduceGameCommand(
      game,
      { type: "CONFIRM_REACTION", playerId: "player-1", reactionId: multiDuelPrompt.id, accepted: true, targetEntrantId: "player-3" },
      scriptedRng([1, 6]),
    );

    expect(position(game, "player-1")).toBe(2);
    expect(position(game, "player-2")).toBe(2);
    expect(position(game, "player-3")).toBe(4);
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
      const copycatId = athleteId("Copycat");
      game = {
        ...game,
        players: game.players.map((player) => {
          const replacementId = STANDARD_ATHLETES.find(
            (athlete) => athlete.id !== copycatId && !player.athleteIds.includes(athlete.id),
          )?.id;

          return {
            ...player,
            athleteIds: player.athleteIds.map((id) => id === copycatId ? (replacementId ?? id) : id),
          };
        }),
      };
      const rng = createRng(`simulation-rolls-${index}`);
      let actions = 0;

      while (game.phase !== "finalResults" && actions < 1_000) {
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
          game = setDefaultMastermindPredictions(game, rng);
          game = setDefaultBeforeRaceCopyChoices(game, rng);
          game = reduceGameCommand(game, { type: "REVEAL_RACE" }, rng);
          continue;
        }

        if (game.phase === "racing") {
          const race = requireRace(game);

          if (race.pendingReactions.length > 0) {
            const prompt = race.pendingReactions[0];
            const reactingEntrant = (prompt.promptType === "duel" || prompt.promptType === "copy") && prompt.sourceEntrantId
              ? race.entrants.find((entrant) => entrant.id === prompt.sourceEntrantId)
              : null;
            const targetEntrantId = reactingEntrant
              ? race.entrants.find(
                  (entrant) =>
                    entrant.id !== reactingEntrant.id &&
                    !entrant.finished &&
                    !entrant.eliminated &&
                    (prompt.promptType === "duel"
                      ? entrant.position === reactingEntrant.position
                      : entrant.position === Math.max(...race.entrants.filter((candidate) => candidate.id !== reactingEntrant.id && !candidate.finished && !candidate.eliminated).map((candidate) => candidate.position))),
                )?.id
              : undefined;
            game = reduceGameCommand(
              game,
              {
                type: "CONFIRM_REACTION",
                playerId: prompt.playerId,
                reactionId: prompt.id,
                accepted: prompt.promptType === "duel" || prompt.promptType === "copy" ? Boolean(targetEntrantId) : true,
                targetEntrantId,
              },
              rng,
            );
            actions += 1;
            continue;
          }

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
      expect(actions, `simulation-${index} used too many actions`).toBeLessThan(1_000);
    }
  });
});
