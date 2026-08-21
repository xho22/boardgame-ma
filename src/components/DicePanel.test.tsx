import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_ATHLETES } from "../game/athletes";
import { DicePanel } from "./DicePanel";
import type { Entrant, Player, RaceState } from "../game/types";

const legs = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Legs");
const hare = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Hare");
const babaYaga = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Baba Yaga");

if (!legs || !hare || !babaYaga) {
  throw new Error("Missing DicePanel test athlete");
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
  pendingTurnState: null,
  status: "active",
};

describe("DicePanel", () => {
  it("shows both Legs choices before the main move", () => {
    const markup = renderToStaticMarkup(
      <DicePanel
        debugMode={false}
        race={race}
        currentPlayer={player}
        currentEntrant={entrant}
        effectiveAbilityKey="main_move_fixed_five_optional"
        onRoll={() => undefined}
      />,
    );

    expect(markup).toContain("掷骰移动");
    expect(markup).toContain("直接移动 5 格");
  });

  it("shows recovery state instead of roll controls for a tripped racer", () => {
    const markup = renderToStaticMarkup(
      <DicePanel
        debugMode={false}
        race={race}
        currentPlayer={player}
        currentEntrant={{ ...entrant, skippedTurns: 1 }}
        effectiveAbilityKey="main_move_fixed_five_optional"
        onRoll={() => undefined}
      />,
    );

    expect(markup).toContain("绊倒恢复中");
    expect(markup).toContain("3 秒后自动进入下一回合");
    expect(markup).not.toContain("直接移动 5 格");
  });

  it("automatically skips a Hare turn when it is alone in the lead", () => {
    const hareEntrant = { ...entrant, athleteId: hare.id, position: 4 };
    const markup = renderToStaticMarkup(
      <DicePanel
        debugMode={false}
        race={{
          ...race,
          entrants: [hareEntrant, { ...entrant, id: "player-2", playerId: "player-2", athleteId: babaYaga.id, position: 3 }],
        }}
        currentPlayer={{ ...player, athleteIds: [hare.id] }}
        currentEntrant={hareEntrant}
        effectiveAbilityKey="hare_fast_unless_alone_lead"
        onRoll={() => undefined}
      />,
    );

    expect(markup).toContain("野兔独自领先，本回合跳过");
    expect(markup).not.toContain(">掷骰<");
  });

  it("shows forced die controls in debug mode", () => {
    const markup = renderToStaticMarkup(
      <DicePanel
        debugMode
        race={race}
        currentPlayer={player}
        currentEntrant={entrant}
        effectiveAbilityKey="main_move_fixed_five_optional"
        onRoll={() => undefined}
      />,
    );

    expect(markup).toContain("本次骰点");
  });

  it("shows the copied Party Animal choice when given an effective copied ability", () => {
    const markup = renderToStaticMarkup(
      <DicePanel
        debugMode={false}
        race={race}
        currentPlayer={player}
        currentEntrant={entrant}
        effectiveAbilityKey="pull_all_then_bonus_per_guest"
        onRoll={() => undefined}
      />,
    );

    expect(markup).toContain("当前复制：派对动物");
    expect(markup).toContain("召集派对后掷骰");
  });
});
