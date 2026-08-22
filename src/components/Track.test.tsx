import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_ATHLETES } from "../game/athletes";
import { getBackwardSpecialWaypoints, getCopiedAbilityDetails, getTrackSpacePosition, Track } from "./Track";
import type { Entrant, GameState, Player, RaceState } from "../game/types";

const alchemist = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Alchemist");
const legs = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Legs");
const copycat = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Copycat");
const egg = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Egg");
const twin = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Twin");

if (!alchemist || !legs || !copycat || !egg || !twin) {
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
    debugMode: false,
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
    expect(markup).toContain("piece-stack pieces-2");
    expect(markup).toContain("current-racer-marker");
    expect(markup).toContain("track-infield");
    expect(markup).toContain("special-space-marker");
    expect(markup).toContain("特殊棋盘");
  });

  it("describes Copycat, Egg, and Twin's currently copied ability", () => {
    const copycatRace: RaceState = {
      ...race,
      entrants: [
        { ...entrants[0], athleteId: copycat.id, position: 2 },
        { ...entrants[1], athleteId: legs.id, position: 3 },
      ],
    };

    for (const entrant of [
      copycatRace.entrants[0],
      { ...entrants[0], athleteId: egg.id, copiedAbilityKey: legs.implementationKey },
      { ...entrants[0], athleteId: twin.id, copiedAbilityKey: legs.implementationKey },
    ]) {
      expect(getCopiedAbilityDetails(copycatRace, entrant)).toMatchObject({ displayName: "长腿", abilityText: legs.abilityText });
    }
  });

  it("adds a landing waypoint before animating a backward special space", () => {
    const backwardRace: RaceState = {
      ...race,
      entrants: [{ ...entrants[0], position: 12 }],
    };
    const backwardGame: GameState = {
      ...game,
      activeRace: backwardRace,
      log: [{
        id: "log-backward",
        type: "movement",
        message: `Dad的${alchemist.displayName} 落到特殊格 16，后退 4 格到 12。`,
        createdAt: 1,
      }],
    };

    expect(getBackwardSpecialWaypoints(backwardGame, backwardRace, backwardGame.log)).toEqual({
      "player-1:racer-1": [16, 12],
    });
  });

  it("maps the thirty-space track around the two corners", () => {
    expect(getTrackSpacePosition(0)).toEqual({ column: 3, row: 3 });
    expect(getTrackSpacePosition(14)).toEqual({ column: 16, row: 2 });
    expect(getTrackSpacePosition(15)).toEqual({ column: 16, row: 1 });
    expect(getTrackSpacePosition(30)).toEqual({ column: 1, row: 1 });
  });
});
