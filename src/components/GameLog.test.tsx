import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameLog } from "./GameLog";
import type { GameLogEntry } from "../game/types";

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
});
