import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_ATHLETES } from "../game/athletes";
import type { GameState, RaceState } from "../game/types";
import { getUpcomingEntrantIds, TurnOrder } from "./TurnOrder";

const [firstAthlete, secondAthlete, thirdAthlete] = STANDARD_ATHLETES;

const race: RaceState = {
  id: "race-1",
  raceNumber: 2,
  trackLength: 30,
  firstPlacePoints: 4,
  secondPlacePoints: 2,
  turnOrder: ["entrant-1", "entrant-2", "entrant-3"],
  currentTurnIndex: 1,
  entrants: [
    { id: "entrant-1", playerId: "player-1", athleteId: firstAthlete.id, position: 4, finished: true, finishRank: 1, skippedTurns: 0, actionCount: 1, abilityUses: {}, temporaryEffects: [] },
    { id: "entrant-2", playerId: "player-2", athleteId: secondAthlete.id, position: 3, finished: false, finishRank: null, skippedTurns: 1, actionCount: 0, abilityUses: {}, temporaryEffects: [] },
    { id: "entrant-3", playerId: "player-1", athleteId: thirdAthlete.id, position: 2, finished: false, finishRank: null, skippedTurns: 0, actionCount: 0, abilityUses: {}, temporaryEffects: [] },
  ],
  finishers: [{ entrantId: "entrant-1", playerId: "player-1", athleteId: firstAthlete.id, rank: 1 }],
  round: 1,
  previousDieRoll: null,
  previousFinalMoveValue: null,
  pendingReactions: [],
  pendingTurnState: null,
  status: "active",
};

const game: Pick<GameState, "players"> = {
  players: [
    { id: "player-1", name: "Dad", color: "#1d6258", score: 0, athleteIds: [], usedAthleteIds: [], firstPlaces: 0, secondPlaces: 0, isAI: false },
    { id: "player-2", name: "Kid", color: "#e94f2f", score: 0, athleteIds: [], usedAthleteIds: [], firstPlaces: 0, secondPlaces: 0, isAI: false },
  ],
};

describe("TurnOrder", () => {
  it("starts at the current racer, excludes finished racers, and marks recovery", () => {
    expect(getUpcomingEntrantIds(race)).toEqual(["entrant-2", "entrant-3"]);

    const markup = renderToStaticMarkup(<TurnOrder game={game} race={race} />);

    expect(markup).toContain("turn-order-item current tripped");
    expect(markup).toContain("绊倒");
    expect(markup).toContain("已冲线");
    expect(markup).toContain(`1. ${firstAthlete.displayName}`);
  });
});
