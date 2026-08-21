import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_ATHLETES } from "../game/athletes";
import { GameLog } from "./GameLog";
import type { GameLogEntry, Player } from "../game/types";

describe("GameLog", () => {
  it("shows newest entries first while preserving original log numbers", () => {
    const entries: GameLogEntry[] = Array.from({ length: 12 }, (_, index) => ({
      id: `log-${index + 1}`,
      type: "movement",
      message: `Event ${index + 1}`,
      createdAt: index,
    }));

    const markup = renderToStaticMarkup(<GameLog entries={entries} />);

    expect(markup.indexOf(">12<")).toBeLessThan(markup.indexOf(">11<"));
    expect(markup.indexOf(">11<")).toBeLessThan(markup.indexOf(">1<"));
    expect(markup).toContain("Event 1");
    expect(markup).toContain("Event 12");
    expect(markup).toContain("game-log-list");
  });

  it("highlights racers, abilities, and die results when race context is available", () => {
    const rocketScientist = STANDARD_ATHLETES.find((athlete) => athlete.standardName === "Rocket Scientist");
    if (!rocketScientist) {
      throw new Error("Missing Rocket Scientist test athlete");
    }
    const players: Player[] = [{
      id: "player-1",
      name: "Dad",
      color: "#1d6258",
      score: 0,
      athleteIds: [rocketScientist.id],
      usedAthleteIds: [],
      firstPlaces: 0,
      secondPlaces: 0,
      isAI: false,
    }];
    const entries: GameLogEntry[] = [{
      id: "log-1",
      type: "ability_trigger",
      message: "Dad的火箭科学家 掷出了 3，并使用火箭科学家加倍。",
      createdAt: 0,
    }];

    const markup = renderToStaticMarkup(<GameLog entries={entries} players={players} athletes={[rocketScientist]} />);

    expect(markup).toContain("log-highlight racer");
    expect(markup).toContain("log-highlight dice");
    expect(markup).toContain("log-highlight ability");
    expect(markup).toContain("--log-entry-color:#1d6258");
  });
});
