import { beginSelection, lockPlayerSelection, selectAthleteForRace } from "./selection";
import { createInitialGameState } from "./setup";
import { moveEntrantForward } from "./movement";
import { applyRaceScoring, isGameComplete } from "./scoring";
import {
  applyBeforeRaceAbilities,
  getEffectiveImplementationKey,
  resolveAfterMove,
  resolveMainMove,
} from "./abilityEngine";
import type { Entrant, Finisher, GameCommand, GameLogEntry, GameState, RaceState } from "./types";
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

  const baseEntrants = game.players.flatMap((player) => {
    const athleteIds = selectionState.selectionsByPlayerId[player.id] ?? [];

    if (athleteIds.length !== game.settings.racersPerPlayerPerRace) {
      throw new Error(`${player.name} has not selected a racer`);
    }

    return athleteIds.map((athleteId, index) => ({
      id: athleteIds.length === 1 ? player.id : `${player.id}:racer-${index + 1}`,
      playerId: player.id,
      athleteId,
      position: 0,
      finished: false,
      finishRank: null,
      skippedTurns: 0,
      actionCount: 0,
      abilityUses: {},
      temporaryEffects: [],
    }));
  });
  const prepared = applyBeforeRaceAbilities({ game, entrants: baseEntrants });
  const activeRace: RaceState = {
    id: `race-${raceSummary.raceNumber}`,
    raceNumber: raceSummary.raceNumber,
    trackLength: game.settings.trackLength,
    firstPlacePoints: raceSummary.firstPlacePoints,
    secondPlacePoints: raceSummary.secondPlacePoints,
    turnOrder: baseEntrants.map((entrant) => entrant.id),
    currentTurnIndex: 0,
    entrants: prepared.entrants,
    finishers: [],
    round: 1,
    previousFinalMoveValue: null,
    pendingReactions: [],
    status: "active",
  };

  return {
    ...game,
    phase: "racing",
    players: prepared.players.map((player) => ({
      ...player,
      usedAthleteIds: [...player.usedAthleteIds, ...(selectionState.selectionsByPlayerId[player.id] ?? [])],
    })),
    activeRace,
    selectionState: null,
    log: [
      ...game.log,
      createLog(game, "race_start", `Race ${raceSummary.raceNumber} started.`, 0),
      ...prepared.entrants.map((entrant, index) =>
        createLog(game, "athlete_reveal", `${entrant.playerId} sent ${entrant.athleteId}.`, index + 1),
      ),
      ...prepared.logs.map((log, index) => createLog(game, log.type, log.message, prepared.entrants.length + index + 1)),
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

  const entrant = race.entrants.find((candidate) => candidate.id === playerId || candidate.playerId === playerId);

  if (!entrant) {
    throw new Error(`${playerId} is not in the active race`);
  }

  if (entrant.finished) {
    return advanceTurn(game, race);
  }

  const mainMove = resolveMainMove({ game, race, entrant, rng });
  const moveResult = moveWithAbility(mainMove.race, mainMove.entrant, mainMove.finalMove, {
    leaptoad: mainMove.usesLeaptoadMove,
    preventOverFinish: mainMove.preventsOverFinish,
  });
  const moverBefore = {
    ...mainMove.entrant,
    position: mainMove.turnStartPosition,
  };
  const finishers = moveResult.finished
    ? [
        ...mainMove.race.finishers,
        {
          entrantId: entrant.id,
          playerId: entrant.playerId,
          athleteId: entrant.athleteId,
          rank: mainMove.race.finishers.length + 1,
        },
      ]
    : mainMove.race.finishers;
  const entrants = mainMove.race.entrants.map((candidate) =>
    candidate.id === entrant.id
      ? {
          ...moveResult.entrant,
          finishRank: moveResult.finished ? finishers[finishers.length - 1].rank : null,
        }
      : candidate,
  );
  const updatedRace = {
    ...mainMove.race,
    entrants,
    finishers,
    previousFinalMoveValue: mainMove.finalMove,
  };
  const afterMove = resolveAfterMove({
    game: { ...game, players: mainMove.players, activeRace: updatedRace },
    race: updatedRace,
    players: mainMove.players,
    moverBefore,
    moverAfter: moveResult.entrant,
    path: moveResult.path,
    abilityTriggered: mainMove.logs.some((log) => log.type === "ability_trigger"),
  });
  const raceAfterSecondaryFinishes = syncFinishers(afterMove.race);
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
    ...afterMove.logs,
  ];
  const gameWithMove = {
    ...game,
    players: afterMove.players,
    activeRace: raceAfterSecondaryFinishes.race,
    log: [
      ...game.log,
      ...baseLogs.map((log, index) => createLog(game, log.type, log.message, index)),
      ...raceAfterSecondaryFinishes.logs.map((log, index) =>
        createLog(game, log.type, log.message, baseLogs.length + index),
      ),
      ...(moveResult.finished
        ? [
            createLog(
              game,
              "finish",
              `${entrant.id} finished in rank ${finishers[finishers.length - 1].rank}.`,
              baseLogs.length + raceAfterSecondaryFinishes.logs.length,
            ),
          ]
        : []),
    ],
    revision: game.revision + 1,
  };

  if (raceAfterSecondaryFinishes.race.finishers.length >= getRequiredFinishers(raceAfterSecondaryFinishes.race)) {
    return completeRace(gameWithMove);
  }

  if (mainMove.extraTurnPlayerId) {
    return setNextTurn(gameWithMove, raceAfterSecondaryFinishes.race, mainMove.extraTurnPlayerId);
  }

  if (mainMove.nextTurnPlayerId) {
    return setNextTurn(gameWithMove, raceAfterSecondaryFinishes.race, mainMove.nextTurnPlayerId);
  }

  return advanceTurn(gameWithMove, raceAfterSecondaryFinishes.race);
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
  const masterMindResult = applyMastermindPredictions(game, race);
  const scoredGame = applyRaceScoring(game, masterMindResult.finishers);

  return {
    ...scoredGame,
    phase: "raceResults",
    activeRace: {
      ...race,
      finishers: masterMindResult.finishers,
      status: "complete",
    },
    log: [
      ...scoredGame.log,
      ...masterMindResult.logs.map((log, index) => createLog(scoredGame, log.type, log.message, index)),
      createLog(scoredGame, "race_end", `Race ${race.raceNumber} complete.`, masterMindResult.logs.length),
    ],
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
    const entrant = race.entrants.find((candidate) => candidate.id === playerId || candidate.playerId === playerId);

    if (entrant && !entrant.finished && !entrant.eliminated) {
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

function setNextTurn(game: GameState, race: RaceState, playerId: string): GameState {
  const nextTurnIndex = race.turnOrder.findIndex((candidate) => candidate === playerId);

  if (nextTurnIndex < 0) {
    return advanceTurn(game, race);
  }

  return {
    ...game,
    activeRace: {
      ...race,
      currentTurnIndex: nextTurnIndex,
    },
    revision: game.revision + 1,
  };
}

function getRequiredFinishers(race: RaceState): number {
  const eligibleEntrants = race.entrants.filter((entrant) => !entrant.eliminated).length;
  return Math.min(2, eligibleEntrants);
}

function syncFinishers(race: RaceState): { race: RaceState; logs: { type: GameLogEntry["type"]; message: string }[] } {
  const finishers = [...race.finishers];
  const logs: { type: GameLogEntry["type"]; message: string }[] = [];
  const entrants = race.entrants.map((entrant) => {
    if (!entrant.finished || finishers.some((finisher) => finisher.entrantId === entrant.id)) {
      return entrant;
    }

    const rank = finishers.length + 1;
    finishers.push({
      entrantId: entrant.id,
      playerId: entrant.playerId,
      athleteId: entrant.athleteId,
      rank,
    });
    logs.push({
      type: "finish",
      message: `${entrant.id} finished in rank ${rank}.`,
    });
    return {
      ...entrant,
      finishRank: rank,
    };
  });

  return {
    race: {
      ...race,
      entrants,
      finishers,
    },
    logs,
  };
}

function moveWithAbility(
  race: RaceState,
  entrant: Entrant,
  spaces: number,
  options: { leaptoad: boolean; preventOverFinish: boolean },
) {
  const maxSpaces =
    options.preventOverFinish && entrant.position + spaces > race.trackLength
      ? Math.max(0, race.trackLength - entrant.position - 1)
      : spaces;

  if (!options.leaptoad) {
    return moveEntrantForward(entrant, maxSpaces, race.trackLength);
  }

  const occupiedSpaces = new Set(
    race.entrants
      .filter((candidate) => candidate.playerId !== entrant.playerId && !candidate.finished && !candidate.eliminated)
      .map((candidate) => candidate.position),
  );
  const path: number[] = [];
  let position = entrant.position;

  while (path.length < maxSpaces && position < race.trackLength) {
    position += 1;

    if (occupiedSpaces.has(position) && position !== race.trackLength) {
      continue;
    }

    path.push(position);
  }

  const nextPosition = Math.min(position, race.trackLength);

  return {
    entrant: {
      ...entrant,
      position: nextPosition,
      finished: nextPosition >= race.trackLength,
    },
    path,
    finished: nextPosition >= race.trackLength,
  };
}

function applyMastermindPredictions(
  game: GameState,
  race: RaceState,
): { finishers: Finisher[]; logs: { type: GameLogEntry["type"]; message: string }[] } {
  const firstFinisher = race.finishers.find((finisher) => finisher.rank === 1);

  if (!firstFinisher) {
    return { finishers: race.finishers, logs: [] };
  }

  const mastermind = race.entrants.find(
    (entrant) =>
      getEffectiveImplementationKey(game, race, entrant) === "predict_winner_finish_second" &&
      entrant.predictedWinnerPlayerId === firstFinisher.playerId,
  );

  if (!mastermind) {
    return { finishers: race.finishers, logs: [] };
  }

  const withoutSecond = race.finishers.filter((finisher) => finisher.rank !== 2);
  const finishers = [
    ...withoutSecond,
    {
      entrantId: mastermind.id,
      playerId: mastermind.playerId,
      athleteId: mastermind.athleteId,
      rank: 2,
    },
  ].sort((first, second) => first.rank - second.rank);

  return {
    finishers,
    logs: [
      {
        type: "ability_trigger",
        message: `${mastermind.playerId} used Mastermind and claimed rank 2 after predicting the winner.`,
      },
    ],
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
