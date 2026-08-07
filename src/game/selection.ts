import type { GameState, SelectionState } from "./types";

export function beginSelection(game: GameState): GameState {
  const selectionState: SelectionState = {
    raceNumber: game.raceIndex + 1,
    activePlayerId: game.players[0]?.id ?? null,
    selectionsByPlayerId: Object.fromEntries(game.players.map((player) => [player.id, null])),
    lockedPlayerIds: [],
    revealed: false,
  };

  return {
    ...game,
    phase: "selecting",
    selectionState,
    revision: game.revision + 1,
  };
}

export function selectAthleteForRace(game: GameState, playerId: string, athleteId: string): GameState {
  const selectionState = requireSelectionState(game);
  const player = game.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    throw new Error(`Unknown player: ${playerId}`);
  }

  if (selectionState.lockedPlayerIds.includes(playerId)) {
    throw new Error(`${player.name} has already locked a racer`);
  }

  if (!player.athleteIds.includes(athleteId)) {
    throw new Error(`${athleteId} does not belong to ${player.name}`);
  }

  if (player.usedAthleteIds.includes(athleteId)) {
    throw new Error(`${athleteId} has already been used`);
  }

  return {
    ...game,
    selectionState: {
      ...selectionState,
      selectionsByPlayerId: {
        ...selectionState.selectionsByPlayerId,
        [playerId]: athleteId,
      },
    },
    revision: game.revision + 1,
  };
}

export function lockPlayerSelection(game: GameState, playerId: string): GameState {
  const selectionState = requireSelectionState(game);
  const playerIndex = game.players.findIndex((player) => player.id === playerId);

  if (playerIndex < 0) {
    throw new Error(`Unknown player: ${playerId}`);
  }

  const selectedAthleteId = selectionState.selectionsByPlayerId[playerId];

  if (!selectedAthleteId) {
    throw new Error(`${game.players[playerIndex].name} must select a racer before locking`);
  }

  const lockedPlayerIds = selectionState.lockedPlayerIds.includes(playerId)
    ? selectionState.lockedPlayerIds
    : [...selectionState.lockedPlayerIds, playerId];
  const nextPlayer = game.players.find((player) => !lockedPlayerIds.includes(player.id));
  const allLocked = lockedPlayerIds.length === game.players.length;

  return {
    ...game,
    phase: allLocked ? "raceReveal" : "selecting",
    selectionState: {
      ...selectionState,
      activePlayerId: nextPlayer?.id ?? null,
      lockedPlayerIds,
      revealed: allLocked,
    },
    revision: game.revision + 1,
  };
}

export function getActiveSelectionPlayer(game: GameState) {
  if (!game.selectionState?.activePlayerId) {
    return null;
  }

  return game.players.find((player) => player.id === game.selectionState?.activePlayerId) ?? null;
}

function requireSelectionState(game: GameState): SelectionState {
  if (!game.selectionState) {
    throw new Error("Selection has not started");
  }

  return game.selectionState;
}
