import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_ATHLETES } from "../game/athletes";
import { DicePanel } from "./DicePanel";
import type { Entrant, Player, RaceState } from "../game/types";

const legs = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Legs");

if (!legs) {
  throw new Error("Missing Legs test athlete");
}

const player: Player = {
  id: "player-1",
  name: "Dad",
  color: "#1d6258",
  score: 0,
  athleteIds: [legs.id],
  usedAthleteIds: [],
  firstPlaces: 0,
  secondPlaces: 0,
  isAI: false,
};

const entrant: Entrant = {
  id: "player-1",
  playerId: "player-1",
  athleteId: legs.id,
  position: 0,
  finished: false,
  finishRank: null,
  skippedTurns: 0,
  actionCount: 0,
  abilityUses: {},
  temporaryEffects: [],
};

const race: RaceState = {
  id: "race-1",
  raceNumber: 1,
  trackLength: 30,
  firstPlacePoints: 5,
  secondPlacePoints: 2,
  turnOrder: ["player-1"],
  currentTurnIndex: 0,
  entrants: [entrant],
  finishers: [],
  round: 1,
  previousFinalMoveValue: null,
  pendingReactions: [],
  status: "active",
};

describe("DicePanel", () => {
  it("shows both Legs choices before the main move", () => {
    const markup = renderToStaticMarkup(
      <DicePanel race={race} currentPlayer={player} currentEntrant={entrant} onRoll={() => undefined} />,
    );

    expect(markup).toContain("掷骰移动");
    expect(markup).toContain("直接移动 5 格");
  });

  it("shows recovery state instead of roll controls for a tripped racer", () => {
    const markup = renderToStaticMarkup(
      <DicePanel
        race={race}
        currentPlayer={player}
        currentEntrant={{ ...entrant, skippedTurns: 1 }}
        onRoll={() => undefined}
      />,
    );

    expect(markup).toContain("绊倒恢复中");
    expect(markup).toContain("3 秒后自动进入下一回合");
    expect(markup).not.toContain("直接移动 5 格");
  });
});
