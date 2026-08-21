import { describe, expect, it } from "vitest";
import { STANDARD_ATHLETES } from "./athletes";
import { reduceGameCommand } from "./raceEngine";
import { createInitialGameState } from "./setup";
import type { Rng } from "./rng";
import type { GameState, MainMoveChoice } from "./types";

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

function roll(game: GameState, playerId: string, rolls: number[], choice?: MainMoveChoice): GameState {
  const rng = scriptedRng(rolls);
  let nextGame = reduceGameCommand(game, { type: "ROLL_DICE", playerId, choice }, rng);

  while (nextGame.activeRace?.pendingDiceDecision) {
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
    expect(latestMessages(game).some((message) => message.includes("炼金术士"))).toBe(true);
  });

  it("Coach gives racers sharing the coach space +1 to main move", () => {
    const game = roll(createRace("Coach", "Baba Yaga"), "player-1", [1]);

    expect(entrantPosition(game, "player-1")).toBe(2);
    expect(latestMessages(game).some((message) => message.includes("指导"))).toBe(true);
  });

  it("Gunk gives other racers -1 to main move without changing the die", () => {
    const game = roll(createRace("Alchemist", "Gunk"), "player-1", [4]);

    expect(game.activeRace?.previousFinalMoveValue).toBe(3);
    expect(entrantPosition(game, "player-1")).toBe(3);
    expect(latestMessages(game).some((message) => message.includes("掷出了 4"))).toBe(true);
  });

  it("uses a forced debug die roll when provided", () => {
    const game = roll(createRace("Baba Yaga", "Baba Yaga"), "player-1", [1], {
      forcedDieRoll: 6,
    });

    expect(entrantPosition(game, "player-1")).toBe(6);
    expect(latestMessages(game).some((message) => message.includes("掷出了 6"))).toBe(true);
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
    expect(latestMessages(skipped).some((message) => message.includes("独自领先"))).toBe(true);
  });

  it("Legs can replace the roll with a fixed main move of 5", () => {
    const game = roll(createRace("Legs", "Baba Yaga"), "player-1", [1]);

    expect(entrantPosition(game, "player-1")).toBe(5);
    expect(latestMessages(game).some((message) => message.includes("不掷骰"))).toBe(true);
  });

  it("Legs can choose to roll instead of using the fixed 5 move", () => {
    const game = roll(createRace("Legs", "Baba Yaga"), "player-1", [2], { useLegsFixedMove: false });

    expect(entrantPosition(game, "player-1")).toBe(2);
    expect(latestMessages(game).some((message) => message.includes("掷出了 2"))).toBe(true);
  });

  it("Magician rerolls a main move once and uses the final roll", () => {
    const game = roll(createRace("Magician", "Baba Yaga"), "player-1", [2, 6]);

    expect(entrantPosition(game, "player-1")).toBe(6);
    expect(latestMessages(game).filter((message) => message.includes("魔术师重投")).length).toBe(1);
  });

  it("assigns a Magician prompt to the racer owner in a two-racer turn", () => {
    const game = createRace("Magician", "Baba Yaga");
    const multiRacerGame: GameState = {
      ...game,
      activeRace: {
        ...game.activeRace!,
        turnOrder: ["player-1:racer-1", "player-2"],
        entrants: game.activeRace!.entrants.map((entrant) =>
          entrant.id === "player-1" ? { ...entrant, id: "player-1:racer-1" } : entrant,
        ),
      },
    };
    const prompted = reduceGameCommand(
      multiRacerGame,
      { type: "ROLL_DICE", playerId: "player-1:racer-1", choice: { forcedDieRoll: 2 } },
      scriptedRng([2]),
    );

    expect(prompted.activeRace?.pendingReactions[0]?.playerId).toBe("player-1");
    expect(prompted.activeRace?.pendingDiceDecision).toMatchObject({ playerId: "player-1", entrantId: "player-1:racer-1" });
  });

  it("resumes the same racer after its owner answers a Dicemonger prompt", () => {
    const game = createRace("Baba Yaga", "Dicemonger");
    const multiRacerGame: GameState = {
      ...game,
      activeRace: {
        ...game.activeRace!,
        turnOrder: ["player-1:racer-1", "player-2"],
        entrants: game.activeRace!.entrants.map((entrant) =>
          entrant.id === "player-1" ? { ...entrant, id: "player-1:racer-1" } : entrant,
        ),
      },
    };
    const prompted = reduceGameCommand(
      multiRacerGame,
      { type: "ROLL_DICE", playerId: "player-1:racer-1", choice: { forcedDieRoll: 2 } },
      scriptedRng([2]),
    );
    const prompt = prompted.activeRace!.pendingReactions[0];
    const resolved = reduceGameCommand(
      prompted,
      { type: "CONFIRM_REACTION", playerId: "player-1", reactionId: prompt.id, accepted: false },
      scriptedRng([2]),
    );

    expect(resolved.activeRace?.entrants.find((entrant) => entrant.id === "player-1:racer-1")?.position).toBe(2);
  });

  it("Rocket Scientist doubles the main move and trips until the next main move", () => {
    let game = roll(createRace("Rocket Scientist", "Baba Yaga"), "player-1", [3]);

    expect(entrantPosition(game, "player-1")).toBe(6);
    expect(game.activeRace?.entrants.find((entrant) => entrant.playerId === "player-1")?.skippedTurns).toBe(1);

    game = roll(game, "player-2", [1]);
    game = roll(game, "player-1", [6]);

    expect(entrantPosition(game, "player-1")).toBe(6);
    expect(game.activeRace?.entrants.find((entrant) => entrant.playerId === "player-1")?.skippedTurns).toBe(0);
    expect(latestMessages(game).some((message) => message.includes("从摔倒中恢复"))).toBe(true);
  });

  it("applies Coach's bonus after Rocket Scientist doubles a shared main move", () => {
    const game = roll(createRace("Rocket Scientist", "Coach"), "player-1", [3]);

    expect(entrantPosition(game, "player-1")).toBe(7);
    expect(game.activeRace?.previousDieRoll).toBe(3);
    expect(game.activeRace?.previousFinalMoveValue).toBe(7);
    expect(latestMessages(game).some((message) => message.includes("主移动翻倍为 6"))).toBe(true);
    expect(latestMessages(game).some((message) => message.includes("主移动 +1，当前为 7"))).toBe(true);
  });

  it("Rocket Scientist can skip the optional double move", () => {
    const game = roll(createRace("Rocket Scientist", "Baba Yaga"), "player-1", [3], {
      useRocketScientistDouble: false,
    });

    expect(entrantPosition(game, "player-1")).toBe(3);
    expect(game.activeRace?.entrants.find((entrant) => entrant.playerId === "player-1")?.skippedTurns).toBe(0);
  });

  it("does not show an after-roll prompt while a Rocket Scientist is recovering from a trip", () => {
    let game = roll(createRace("Rocket Scientist", "Baba Yaga"), "player-1", [3]);
    game = roll(game, "player-2", [1]);
    const rng = scriptedRng([6]);
    game = reduceGameCommand(game, { type: "ROLL_DICE", playerId: "player-1" }, rng);

    expect(game.activeRace?.pendingDiceDecision).toBeFalsy();
    expect(game.activeRace?.pendingReactions).toHaveLength(0);
    expect(game.activeRace?.entrants.find((entrant) => entrant.playerId === "player-1")?.skippedTurns).toBe(0);
  });

  it("Genius gains an extra turn only when the guessed die matches", () => {
    let game = roll(createRace("Genius", "Baba Yaga"), "player-1", [4], {
      geniusGuess: 4,
    });

    expect(game.activeRace?.turnOrder[game.activeRace.currentTurnIndex]).toBe("player-1");
    expect(latestMessages(game).some((message) => message.includes("成功命中"))).toBe(true);

    game = roll(createRace("Genius", "Baba Yaga"), "player-1", [4], {
      geniusGuess: 3,
    });

    expect(game.activeRace?.turnOrder[game.activeRace.currentTurnIndex]).toBe("player-2");
    expect(latestMessages(game).some((message) => message.includes("未命中"))).toBe(true);
  });
});
