import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialGameState } from "../game/setup";
import { clearSavedGame, loadSavedGame, saveGame } from "./persistence";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves and loads a game state", () => {
    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
    const game = createInitialGameState({
      settings: { playerCount: 2, playerNames: ["Dad", "Kid"] },
      seed: "persisted",
      now: 1_000,
    });

    saveGame(game);

    expect(loadSavedGame()).toEqual(game);
  });

  it("clears a saved game", () => {
    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
    const game = createInitialGameState({ settings: { playerCount: 2 }, seed: "clear", now: 1_000 });

    saveGame(game);
    clearSavedGame();

    expect(loadSavedGame()).toBeNull();
  });
});
