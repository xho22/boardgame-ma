import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_ATHLETES } from "../game/athletes";
import { Track } from "./Track";
import type { Entrant, GameState, Player, RaceState } from "../game/types";

const alchemist = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Alchemist");
const legs = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Legs");

if (!alchemist || !legs) {
  throw new Error("Missing test athletes");
}

const players: Player[] = [
  {
    id: "player-1",
    name: "Dad",
    color: "#1d6258",
    score: 0,
    athleteIds: [alchemist.id, legs.id],
    usedAthleteIds: [],
    firstPlaces: 0,
    secondPlaces: 0,
    isAI: false,
  },
];

const entrants: Entrant[] = [
  {
    id: "player-1:racer-1",
    playerId: "player-1",
    athleteId: alchemist.id,
    position: 0,
    finished: false,
    finishRank: null,
    skippedTurns: 0,
    actionCount: 0,
    abilityUses: {},
    temporaryEffects: [],
  },
  {
    id: "player-1:racer-2",
    playerId: "player-1",
    athleteId: legs.id,
    position: 0,
    finished: false,
    finishRank: null,
    skippedTurns: 1,
    actionCount: 0,
    abilityUses: {},
    temporaryEffects: [],
  },
];

const race: RaceState = {
  id: "race-1",
  raceNumber: 1,
  trackLength: 6,
  firstPlacePoints: 5,
  secondPlacePoints: 2,
  turnOrder: entrants.map((entrant) => entrant.id),
  currentTurnIndex: 0,
  entrants,
  finishers: [],
  round: 1,
  previousFinalMoveValue: null,
  pendingReactions: [],
  status: "active",
};

const game = {
  phase: "racing",
  gameId: "test-game",
  settings: {
    playerCount: 1,
    playerNames: ["Dad"],
    aiPlayerIds: [],
    racesCount: 4,
    racersPerPlayerPerRace: 2,
    athletesPerPlayer: 8,
    trackLength: 6,
    teamAssignment: "snake",
  },
  players,
  athletes: STANDARD_ATHLETES,
  raceIndex: 0,
  races: [],
  activeRace: race,
  selectionState: null,
  log: [],
  rngSeed: "track-test",
  revision: 0,
} satisfies GameState;

describe("Track", () => {
  it("renders racer images and marks tripped racers", () => {
    const markup = renderToStaticMarkup(<Track game={game} race={race} />);

    expect(markup).toContain(alchemist.imagePath);
    expect(markup).toContain(legs.imagePath);
    expect(markup).toContain("track-piece moving-piece tripped");
  });
});
