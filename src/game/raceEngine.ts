import { beginSelection, lockPlayerSelection, selectAthleteForRace } from "./selection";
import { createInitialGameState } from "./setup";
import { moveEntrantForward } from "./movement";
import { applyRaceScoring, isGameComplete } from "./scoring";
import { resolveMainMove } from "./abilityEngine";
import type { GameCommand, GameLogEntry, GameState, RaceState } from "./types";
import type { Rng } from "./rng";

export function reduceGameCommand(game: GameState, command: GameCommand, rng: Rng): GameState {
  switch (command.type) {
    case "START_GAME":
      return createInitialGameState({ settings: command.payload });
    case "ASSIGN_TEAMS":
      return game;
    case "BEGIN_SELECTION":
      return beginSelection(game);
    case "SELECT_ATHLETE":
      return selectAthleteForRace(game, command.playerId, command.athleteId);
    case "LOCK_SELECTION":
      return lockPlayerSelection(game, command.playerId);
    case "REVEAL_RACE":
      return beginRaceFromSelection(game);
    case "ROLL_DICE":
      return rollForCurrentPlayer(game, command.playerId, rng);
    case "BEGIN_NEXT_RACE":
      return beginNextRace(game);
    case "FINISH_GAME":
      return {
        ...game,
        phase: "finalResults",
        activeRace: null,
        selectionState: null,
        revision: game.revision + 1,
      };
    case "USE_ABILITY":
    case "CONFIRM_REACTION":
      return game;
  }
}

export function beginRaceFromSelection(game: GameState): GameState {
  const selectionState = game.selectionState;

  if (!selectionState?.revealed) {
    throw new Error("All racers must be selected and revealed before the race starts");
  }

  const raceSummary = game.races[game.raceIndex];

  if (!raceSummary) {
    throw new Error(`Missing race summary for index ${game.raceIndex}`);
  }

  const entrants = game.players.map((player) => {
    const athleteId = selectionState.selectionsByPlayerId[player.id];

    if (!athleteId) {
      throw new Error(`${player.name} has not selected a racer`);
    }

    return {
      playerId: player.id,
      athleteId,
      position: 0,
      finished: false,
      finishRank: null,
      skippedTurns: 0,
      actionCount: 0,
      abilityUses: {},
      temporaryEffects: [],
    };
  });
  const activeRace: RaceState = {
    id: `race-${raceSummary.raceNumber}`,
    raceNumber: raceSummary.raceNumber,
    trackLength: game.settings.trackLength,
    firstPlacePoints: raceSummary.firstPlacePoints,
    secondPlacePoints: raceSummary.secondPlacePoints,
    turnOrder: game.players.map((player) => player.id),
    currentTurnIndex: 0,
    entrants,
    finishers: [],
    round: 1,
    previousFinalMoveValue: null,
    pendingReactions: [],
    status: "active",
  };

  return {
    ...game,
    phase: "racing",
    players: game.players.map((player) => ({
      ...player,
      usedAthleteIds: [...player.usedAthleteIds, selectionState.selectionsByPlayerId[player.id]].filter(
        (athleteId): athleteId is string => athleteId !== null,
      ),
    })),
    activeRace,
    selectionState: null,
    log: [
      ...game.log,
      createLog(game, "race_start", `Race ${raceSummary.raceNumber} started.`, 0),
      ...entrants.map((entrant, index) =>
        createLog(game, "athlete_reveal", `${entrant.playerId} sent ${entrant.athleteId}.`, index + 1),
      ),
    ],
    revision: game.revision + 1,
  };
}

export function rollForCurrentPlayer(game: GameState, playerId: string, rng: Rng): GameState {
  const race = requireActiveRace(game);

  if (race.status !== "active") {
    throw new Error("Race is not active");
  }

  const currentPlayerId = race.turnOrder[race.currentTurnIndex];

  if (currentPlayerId !== playerId) {
    throw new Error(`It is ${currentPlayerId}'s turn, not ${playerId}'s`);
  }

  const entrant = race.entrants.find((candidate) => candidate.playerId === playerId);

  if (!entrant) {
    throw new Error(`${playerId} is not in the active race`);
  }

  if (entrant.finished) {
    return advanceTurn(game, race);
  }

  const mainMove = resolveMainMove({ game, race, entrant, rng });
  const moveResult = moveEntrantForward(
    mainMove.entrant,
    mainMove.finalMove,
    race.trackLength,
  );
  const finishers = moveResult.finished
    ? [
        ...race.finishers,
        {
          playerId: entrant.playerId,
          athleteId: entrant.athleteId,
          rank: race.finishers.length + 1,
        },
      ]
    : race.finishers;
  const entrants = race.entrants.map((candidate) =>
    candidate.playerId === playerId
      ? {
          ...moveResult.entrant,
          finishRank: moveResult.finished ? finishers[finishers.length - 1].rank : null,
        }
      : candidate,
  );
  const updatedRace = {
    ...race,
    entrants,
    finishers,
    previousFinalMoveValue: mainMove.finalMove,
  };
  const baseLogs = [
    ...mainMove.logs,
    ...(mainMove.dieRoll === null
      ? []
      : [{ type: "dice_roll" as const, message: `${playerId} rolled ${mainMove.dieRoll}.` }]),
    {
      type: "movement" as const,
      message:
        mainMove.finalMove === 0
          ? `${playerId} stayed at ${moveResult.entrant.position}.`
          : `${playerId} moved ${mainMove.finalMove} spaces to ${moveResult.entrant.position}.`,
    },
  ];
  const gameWithMove = {
    ...game,
    activeRace: updatedRace,
    log: [
      ...game.log,
      ...baseLogs.map((log, index) => createLog(game, log.type, log.message, index)),
      ...(moveResult.finished
        ? [
            createLog(
              game,
              "finish",
              `${playerId} finished in rank ${finishers[finishers.length - 1].rank}.`,
              baseLogs.length,
            ),
          ]
        : []),
    ],
    revision: game.revision + 1,
  };

  if (finishers.length >= Math.min(2, race.entrants.length)) {
    return completeRace(gameWithMove);
  }

  return advanceTurn(gameWithMove, updatedRace);
}

export function beginNextRace(game: GameState): GameState {
  if (game.phase !== "raceResults") {
    throw new Error("Cannot begin next race before current race results");
  }

  if (isGameComplete(game)) {
    return {
      ...game,
      phase: "finalResults",
      activeRace: null,
      selectionState: null,
      revision: game.revision + 1,
    };
  }

  return {
    ...game,
    phase: "teamReveal",
    raceIndex: game.raceIndex + 1,
    activeRace: null,
    selectionState: null,
    revision: game.revision + 1,
  };
}

function completeRace(game: GameState): GameState {
  const race = requireActiveRace(game);
  const scoredGame = applyRaceScoring(game, race.finishers);

  return {
    ...scoredGame,
    phase: "raceResults",
    activeRace: {
      ...race,
      status: "complete",
    },
    log: [...scoredGame.log, createLog(scoredGame, "race_end", `Race ${race.raceNumber} complete.`, 0)],
    revision: scoredGame.revision + 1,
  };
}

function advanceTurn(game: GameState, race: RaceState): GameState {
  const nextTurn = findNextTurn(race);

  return {
    ...game,
    activeRace: {
      ...race,
      currentTurnIndex: nextTurn.currentTurnIndex,
      round: race.round + nextTurn.roundsAdvanced,
    },
    revision: game.revision + 1,
  };
}

function findNextTurn(race: RaceState): { currentTurnIndex: number; roundsAdvanced: number } {
  for (let offset = 1; offset <= race.turnOrder.length; offset += 1) {
    const nextTurnIndex = (race.currentTurnIndex + offset) % race.turnOrder.length;
    const playerId = race.turnOrder[nextTurnIndex];
    const entrant = race.entrants.find((candidate) => candidate.playerId === playerId);

    if (entrant && !entrant.finished) {
      return {
        currentTurnIndex: nextTurnIndex,
        roundsAdvanced: nextTurnIndex <= race.currentTurnIndex ? 1 : 0,
      };
    }
  }

  return {
    currentTurnIndex: race.currentTurnIndex,
    roundsAdvanced: 0,
  };
}

function requireActiveRace(game: GameState): RaceState {
  if (!game.activeRace) {
    throw new Error("No active race");
  }

  return game.activeRace;
}

function createLog(game: GameState, type: GameLogEntry["type"], message: string, offset: number): GameLogEntry {
  return {
    id: `log-${game.revision}-${game.log.length + offset}`,
    type,
    message,
    createdAt: game.log[0]?.createdAt ?? 0,
  };
}
