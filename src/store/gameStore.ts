import { create } from "zustand";
import { reduceGameCommand } from "../game/raceEngine";
import { createRng } from "../game/rng";
import { createInitialGameState } from "../game/setup";
import type { GameSettings, GameState } from "../game/types";
import { clearSavedGame, loadSavedGame, saveGame } from "./persistence";

type AppView = "home" | "setup" | "teamReveal" | "selecting" | "raceReveal" | "racing" | "raceResults" | "finalResults";

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
  backToTeams: () => void;
  selectAthlete: (playerId: string, athleteId: string) => void;
  lockSelection: (playerId: string) => void;
  revealRace: () => void;
  rollDice: (playerId: string) => void;
  beginNextRace: () => void;
};

const initialSavedGame = loadSavedGame();

function viewFromGame(game: GameState | null): AppView {
  if (!game) {
    return "home";
  }

  if (
    game.phase === "teamReveal" ||
    game.phase === "selecting" ||
    game.phase === "raceReveal" ||
    game.phase === "racing" ||
    game.phase === "raceResults" ||
    game.phase === "finalResults"
  ) {
    return game.phase;
  }

  return "home";
}

function rngForGame(game: GameState) {
  return createRng(`${game.rngSeed}:${game.revision}`);
}

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
      view: viewFromGame(game),
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

      const game = reduceGameCommand(state.game, { type: "BEGIN_SELECTION" }, rngForGame(state.game));
      saveGame(game);
      return { game, hasSavedGame: true, view: "selecting" };
    }),
  backToTeams: () =>
    set((state) => {
      if (!state.game || (state.game.phase !== "selecting" && state.game.phase !== "raceReveal")) {
        return state;
      }

      const game: GameState = {
        ...state.game,
        phase: "teamReveal",
        selectionState: null,
        revision: state.game.revision + 1,
      };
      saveGame(game);
      return { game, hasSavedGame: true, view: "teamReveal" };
    }),
  selectAthlete: (playerId, athleteId) =>
    set((state) => {
      if (!state.game) {
        return state;
      }

      const game = reduceGameCommand(
        state.game,
        { type: "SELECT_ATHLETE", playerId, athleteId },
        rngForGame(state.game),
      );
      saveGame(game);
      return { game, hasSavedGame: true };
    }),
  lockSelection: (playerId) =>
    set((state) => {
      if (!state.game) {
        return state;
      }

      const game = reduceGameCommand(state.game, { type: "LOCK_SELECTION", playerId }, rngForGame(state.game));
      saveGame(game);
      return { game, hasSavedGame: true, view: game.phase === "raceReveal" ? "raceReveal" : "selecting" };
    }),
  revealRace: () =>
    set((state) => {
      if (!state.game) {
        return state;
      }

      const game = reduceGameCommand(state.game, { type: "REVEAL_RACE" }, rngForGame(state.game));
      saveGame(game);
      return { game, hasSavedGame: true, view: "racing" };
    }),
  rollDice: (playerId) =>
    set((state) => {
      if (!state.game) {
        return state;
      }

      const game = reduceGameCommand(state.game, { type: "ROLL_DICE", playerId }, rngForGame(state.game));
      saveGame(game);
      return { game, hasSavedGame: true, view: viewFromGame(game) };
    }),
  beginNextRace: () =>
    set((state) => {
      if (!state.game) {
        return state;
      }

      const game = reduceGameCommand(state.game, { type: "BEGIN_NEXT_RACE" }, rngForGame(state.game));
      saveGame(game);
      return { game, hasSavedGame: true, view: viewFromGame(game) };
    }),
}));
