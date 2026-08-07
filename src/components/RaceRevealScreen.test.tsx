import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_ATHLETES } from "../game/athletes";
import { RaceRevealScreen } from "./RaceRevealScreen";
import type { GameState, Player } from "../game/types";

const mastermind = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Mastermind");
const babaYaga = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Baba Yaga");

if (!mastermind || !babaYaga) {
  throw new Error("Missing Mastermind test athletes");
}

const players: Player[] = [
  {
    id: "player-1",
    name: "Dad",
    color: "red",
    score: 0,
    athleteIds: [mastermind.id],
    usedAthleteIds: [],
    firstPlaces: 0,
    secondPlaces: 0,
    isAI: false,
  },
  {
    id: "player-2",
    name: "Kid",
    color: "blue",
    score: 0,
    athleteIds: [babaYaga.id],
    usedAthleteIds: [],
    firstPlaces: 0,
    secondPlaces: 0,
    isAI: false,
  },
];

const game = {
  phase: "raceReveal",
  gameId: "test-game",
  settings: {
    playerCount: 2,
    playerNames: ["Dad", "Kid"],
    aiPlayerIds: [],
    racesCount: 4,
    racersPerPlayerPerRace: 1,
    athletesPerPlayer: 4,
    trackLength: 30,
    teamAssignment: "snake",
  },
  players,
  athletes: STANDARD_ATHLETES,
  raceIndex: 0,
  races: [],
  activeRace: null,
  selectionState: {
    raceNumber: 1,
    activePlayerId: null,
    selectionsByPlayerId: {
      "player-1": [mastermind.id],
      "player-2": [babaYaga.id],
    },
    mastermindPredictionsByAthleteId: {},
    lockedPlayerIds: ["player-1", "player-2"],
    revealed: true,
  },
  log: [],
  rngSeed: "race-reveal-test",
  revision: 0,
} satisfies GameState;

describe("RaceRevealScreen", () => {
  it("requires Mastermind to predict a revealed racer before starting", () => {
    const markup = renderToStaticMarkup(
      <RaceRevealScreen game={game} onPredictionChange={() => undefined} onStartRace={() => undefined} />,
    );

    expect(markup).toContain("幕后大师预测");
    expect(markup).toContain("Dad的幕后大师");
    expect(markup).toContain("Kid的芭芭雅嘎");
    expect(markup).toContain("disabled=\"\"");
  });
});
