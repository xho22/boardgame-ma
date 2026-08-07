import { create } from "zustand";
import { createInitialGameState } from "../game/setup";
import type { GameSettings, GameState } from "../game/types";
import { clearSavedGame, loadSavedGame, saveGame } from "./persistence";

type AppView = "home" | "setup" | "teamReveal";

type GameStore = {
  view: AppView;
  game: GameState | null;
  hasSavedGame: boolean;
  openSetup: () => void;
  returnHome: () => void;
  startNewGame: (settings: Partial<GameSettings>) => void;
  continueGame: () => void;
  clearGame: () => void;
};

const initialSavedGame = loadSavedGame();

export const useGameStore = create<GameStore>((set) => ({
  view: initialSavedGame ? "home" : "home",
  game: initialSavedGame,
  hasSavedGame: initialSavedGame !== null,
  openSetup: () => set({ view: "setup" }),
  returnHome: () => set({ view: "home" }),
  startNewGame: (settings) => {
    const game = createInitialGameState({ settings });
    saveGame(game);
    set({ game, hasSavedGame: true, view: "teamReveal" });
  },
  continueGame: () => {
    const game = loadSavedGame();
    set({
      game,
      hasSavedGame: game !== null,
      view: game ? "teamReveal" : "home",
    });
  },
  clearGame: () => {
    clearSavedGame();
    set({ game: null, hasSavedGame: false, view: "home" });
  },
}));
