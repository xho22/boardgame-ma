import { create } from "zustand";
import { reduceGameCommand } from "../game/raceEngine";
import { createRng } from "../game/rng";
import { createInitialGameState } from "../game/setup";
import type { GameSettings, GameState } from "../game/types";
import { clearSavedGame, loadSavedGame, saveGame } from "./persistence";

type AppView = "home" | "setup" | "teamReveal" | "selecting" | "raceReveal";

type GameStore = {
  view: AppView;
  game: GameState | null;
  hasSavedGame: boolean;
  openSetup: () => void;
  returnHome: () => void;
  startNewGame: (settings: Partial<GameSettings>) => void;
  continueGame: () => void;
  clearGame: () => void;
  beginSelection: () => void;
  selectAthlete: (playerId: string, athleteId: string) => void;
  lockSelection: (playerId: string) => void;
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
  beginSelection: () =>
    set((state) => {
      if (!state.game) {
        return state;
      }

      const game = reduceGameCommand(state.game, { type: "BEGIN_SELECTION" }, createRng(state.game.rngSeed));
      saveGame(game);
      return { game, hasSavedGame: true, view: "selecting" };
    }),
  selectAthlete: (playerId, athleteId) =>
    set((state) => {
      if (!state.game) {
        return state;
      }

      const game = reduceGameCommand(
        state.game,
        { type: "SELECT_ATHLETE", playerId, athleteId },
        createRng(state.game.rngSeed),
      );
      saveGame(game);
      return { game, hasSavedGame: true };
    }),
  lockSelection: (playerId) =>
    set((state) => {
      if (!state.game) {
        return state;
      }

      const game = reduceGameCommand(state.game, { type: "LOCK_SELECTION", playerId }, createRng(state.game.rngSeed));
      saveGame(game);
      return { game, hasSavedGame: true, view: game.phase === "raceReveal" ? "raceReveal" : "selecting" };
    }),
}));
