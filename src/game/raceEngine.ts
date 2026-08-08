import { beginSelection, lockPlayerSelection, selectAthleteForRace, setMastermindPrediction } from "./selection";
import { createInitialGameState } from "./setup";
import { moveEntrantForward } from "./movement";
import { applyRaceScoring, isGameComplete } from "./scoring";
import {
  applyBeforeRaceAbilities,
  getEffectiveImplementationKey,
  resolveAfterMove,
  resolveMainMove,
} from "./abilityEngine";
import type { Entrant, Finisher, GameCommand, GameLogEntry, GameState, MainMoveChoice, RaceState } from "./types";
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
    case "SET_MASTERMIND_PREDICTION":
      return setMastermindPrediction(game, command.athleteId, command.predictedAthleteId);
    case "LOCK_SELECTION":
      return lockPlayerSelection(game, command.playerId);
    case "REVEAL_RACE":
      return beginRaceFromSelection(game);
    case "ROLL_DICE":
      return rollForCurrentPlayer(game, command.playerId, rng, command.choice);
    case "CONFIRM_REACTION":
      return confirmReaction(game, command.playerId, command.reactionId, command.accepted);
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
  const mastermindPredictionsByAthleteId = selectionState.mastermindPredictionsByAthleteId ?? {};
  const missingMastermindPrediction = baseEntrants.find((entrant) => {
    const athlete = game.athletes.find((candidate) => candidate.id === entrant.athleteId);

    return athlete?.implementationKey === "predict_winner_finish_second" && !mastermindPredictionsByAthleteId[entrant.athleteId];
  });

  if (missingMastermindPrediction) {
    throw new Error("Mastermind must predict a racer before the race starts");
  }

  const prepared = applyBeforeRaceAbilities({ game, entrants: baseEntrants, mastermindPredictionsByAthleteId });
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
    pendingTurnState: null,
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
      createLog(game, "race_start", `第 ${raceSummary.raceNumber} 场比赛开始。`, 0),
      ...prepared.entrants.map((entrant, index) =>
        createLog(game, "athlete_reveal", `${describeRaceEntrant(game, entrant)} 登场。`, index + 1),
      ),
      ...prepared.logs.map((log, index) => createLog(game, log.type, log.message, prepared.entrants.length + index + 1)),
    ],
    revision: game.revision + 1,
  };
}

export function rollForCurrentPlayer(game: GameState, playerId: string, rng: Rng, choice?: MainMoveChoice): GameState {
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

  const mainMove = resolveMainMove({ game, race, entrant, rng, choice });
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
      : [{ type: "dice_roll" as const, message: `${describeRaceEntrant(game, entrant)} 掷出了 ${mainMove.dieRoll}。` }]),
    {
      type: "movement" as const,
      message:
        mainMove.finalMove === 0
          ? `${describeRaceEntrant(game, entrant)} 停在 ${moveResult.entrant.position}。`
          : `${describeRaceEntrant(game, entrant)} 移动 ${mainMove.finalMove} 格，到达 ${moveResult.entrant.position}。`,
    },
    ...afterMove.logs,
  ];
  const gameWithMove = {
    ...game,
    players: afterMove.players,
    activeRace: {
      ...raceAfterSecondaryFinishes.race,
      pendingTurnState:
        raceAfterSecondaryFinishes.race.pendingReactions.length > 0
          ? {
              extraTurnPlayerId: mainMove.extraTurnPlayerId,
              nextTurnPlayerId: mainMove.nextTurnPlayerId,
            }
          : null,
    },
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
              `${describeRaceEntrant(game, entrant)} 以第 ${finishers[finishers.length - 1].rank} 名冲线。`,
              baseLogs.length + raceAfterSecondaryFinishes.logs.length,
            ),
          ]
        : []),
    ],
    revision: game.revision + 1,
  };

  if (raceAfterSecondaryFinishes.race.pendingReactions.length > 0) {
    return gameWithMove;
  }

  if (shouldCompleteRace(gameWithMove, raceAfterSecondaryFinishes.race)) {
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

function confirmReaction(game: GameState, playerId: string, reactionId: string, accepted: boolean): GameState {
  const race = requireActiveRace(game);
  const prompt = race.pendingReactions.find((candidate) => candidate.id === reactionId);

  if (!prompt) {
    throw new Error(`Missing reaction prompt: ${reactionId}`);
  }

  if (prompt.playerId !== playerId) {
    throw new Error(`Reaction ${reactionId} belongs to ${prompt.playerId}, not ${playerId}`);
  }

  let workingRace: RaceState = {
    ...race,
    pendingReactions: race.pendingReactions.filter((candidate) => candidate.id !== reactionId),
  };
  const reactionLogs: GameLogEntry[] = [];

  if (prompt.sourceEntrantId && prompt.targetEntrantId) {
    const reactor = workingRace.entrants.find((entrant) => entrant.id === prompt.sourceEntrantId);
    const target = workingRace.entrants.find((entrant) => entrant.id === prompt.targetEntrantId);

    if (reactor && target) {
      if (accepted) {
        const reachesFinish = target.position >= workingRace.trackLength;
        const followRank = reachesFinish ? workingRace.finishers.length + 1 : null;
        workingRace = {
          ...workingRace,
          entrants: workingRace.entrants.map((entrant) =>
            entrant.id === reactor.id
              ? {
                  ...entrant,
                  position: target.position,
                  finished: reachesFinish,
                  finishRank: followRank,
                }
              : entrant,
          ),
          finishers:
            reachesFinish && !workingRace.finishers.some((finisher) => finisher.entrantId === reactor.id)
              ? [
                  ...workingRace.finishers,
                  {
                    entrantId: reactor.id,
                    playerId: reactor.playerId,
                    athleteId: reactor.athleteId,
                    rank: followRank ?? workingRace.finishers.length + 1,
                  },
                ]
              : workingRace.finishers,
        };
        reactionLogs.push(
          createLog(game, "ability_trigger", `${describeRaceEntrant(game, reactor)} 跟随${describeRaceEntrant(game, target)}移动到 ${target.position}。`, 0),
        );
        if (reachesFinish && followRank !== null) {
          reactionLogs.push(
            createLog(game, "finish", `${describeRaceEntrant(game, reactor)} 以第 ${followRank} 名冲线。`, 1),
          );
        }
      } else {
        reactionLogs.push(
          createLog(game, "ability_trigger", `${describeRaceEntrant(game, reactor)} 放弃跟随${describeRaceEntrant(game, target)}。`, 0),
        );
      }
    }
  }

  let nextGame: GameState = {
    ...game,
    activeRace: workingRace,
    log: [...game.log, ...reactionLogs],
    revision: game.revision + 1,
  };

  if (workingRace.pendingReactions.length > 0) {
    return nextGame;
  }

  const continuation = race.pendingTurnState;
  workingRace = {
    ...workingRace,
    pendingTurnState: null,
  };
  nextGame = {
    ...nextGame,
    activeRace: workingRace,
  };

  if (shouldCompleteRace(nextGame, workingRace)) {
    return completeRace(nextGame);
  }

  if (continuation?.extraTurnPlayerId) {
    return setNextTurn(nextGame, workingRace, continuation.extraTurnPlayerId);
  }

  if (continuation?.nextTurnPlayerId) {
    return setNextTurn(nextGame, workingRace, continuation.nextTurnPlayerId);
  }

  return advanceTurn(nextGame, workingRace);
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
      createLog(scoredGame, "race_end", `第 ${race.raceNumber} 场比赛结束。`, masterMindResult.logs.length),
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

function shouldCompleteRace(game: GameState, race: RaceState): boolean {
  return race.finishers.length >= getRequiredFinishers(race) || findSatisfiedMastermind(game, race) !== null;
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
      message: `选手 ${entrant.id} 以第 ${rank} 名冲线。`,
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
    (entrant) => entrant.id === findSatisfiedMastermind(game, race)?.id,
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
        message: `${describeRaceEntrant(game, mastermind)} 预测命中，自动成为第 2 名。`,
      },
    ],
  };
}

function findSatisfiedMastermind(game: GameState, race: RaceState): Entrant | null {
  const firstFinisher = race.finishers.find((finisher) => finisher.rank === 1);

  if (!firstFinisher) {
    return null;
  }

  return (
    race.entrants.find(
      (entrant) =>
        getEffectiveImplementationKey(game, race, entrant) === "predict_winner_finish_second" &&
        entrant.predictedWinnerEntrantId === firstFinisher.entrantId,
    ) ?? null
  );
}

function requireActiveRace(game: GameState): RaceState {
  if (!game.activeRace) {
    throw new Error("No active race");
  }

  return game.activeRace;
}

function describeRaceEntrant(game: GameState, entrant: Entrant): string {
  const player = game.players.find((candidate) => candidate.id === entrant.playerId);
  const athlete = game.athletes.find((candidate) => candidate.id === entrant.athleteId);

  return `${player?.name ?? entrant.playerId}的${athlete?.displayName ?? athlete?.standardName ?? entrant.athleteId}`;
}

function createLog(game: GameState, type: GameLogEntry["type"], message: string, offset: number): GameLogEntry {
  return {
    id: `log-${game.revision}-${game.log.length + offset}`,
    type,
    message,
    createdAt: game.log[0]?.createdAt ?? 0,
  };
}
