import {
  beginSelection,
  lockPlayerSelection,
  selectAthleteForRace,
  setBeforeRaceCopyChoice,
  setMastermindPrediction,
} from "./selection";
import { createInitialGameState } from "./setup";
import { moveEntrantBackward, moveEntrantForward } from "./movement";
import { getBoardKind, getSpecialTrackEffect } from "./specialTrack";
import { applyRaceScoring, isGameComplete } from "./scoring";
import {
  applyBeforeRaceAbilities,
  getEffectiveImplementationKey,
  moveEntrantInRace,
  queueCopycatSelectionReactions,
  resolveAfterMove,
  resolveMainMove,
  triggerScoocherOnOtherPower,
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
    case "SET_BEFORE_RACE_COPY_CHOICE":
      return setBeforeRaceCopyChoice(game, command.athleteId, command.copiedAthleteId);
    case "LOCK_SELECTION":
      return lockPlayerSelection(game, command.playerId, rng);
    case "REVEAL_RACE":
      return beginRaceFromSelection(game);
    case "ROLL_DICE":
      return rollForCurrentPlayer(game, command.playerId, rng, command.choice);
    case "CONFIRM_REACTION":
      return confirmReaction(game, command.playerId, command.reactionId, command.accepted, rng, command.targetEntrantId);
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
  const copiedAbilityAthleteIdByAthleteId = selectionState.copiedAbilityAthleteIdByAthleteId ?? {};
  const missingMastermindPrediction = baseEntrants.find((entrant) => {
    const athlete = game.athletes.find((candidate) => candidate.id === entrant.athleteId);

    return athlete?.implementationKey === "predict_winner_finish_second" && !mastermindPredictionsByAthleteId[entrant.athleteId];
  });

  if (missingMastermindPrediction) {
    throw new Error("Mastermind must predict a racer before the race starts");
  }

  const missingCopyChoice = baseEntrants.find((entrant) => {
    const athlete = game.athletes.find((candidate) => candidate.id === entrant.athleteId);

    if (athlete?.implementationKey === "draft_temp_power_before_race") {
      return !copiedAbilityAthleteIdByAthleteId[entrant.athleteId];
    }

    if (athlete?.implementationKey === "copy_previous_winner_before_race") {
      const hasPreviousWinner = game.races
        .slice(0, game.raceIndex)
        .some((race) => race.finishers.some((finisher) => finisher.rank === 1));
      return hasPreviousWinner && !copiedAbilityAthleteIdByAthleteId[entrant.athleteId];
    }

    return false;
  });

  if (missingCopyChoice) {
    throw new Error("All required before-race copy choices must be made before the race starts");
  }

  const prepared = applyBeforeRaceAbilities({
    game,
    entrants: baseEntrants,
    mastermindPredictionsByAthleteId,
    copiedAbilityAthleteIdByAthleteId,
  });
  const activeRace: RaceState = {
    id: `race-${raceSummary.raceNumber}`,
    raceNumber: raceSummary.raceNumber,
    trackLength: game.settings.trackLength,
    boardKind: getBoardKind(raceSummary.raceNumber, game.settings.boardMode),
    firstPlacePoints: raceSummary.firstPlacePoints,
    secondPlacePoints: raceSummary.secondPlacePoints,
    turnOrder: createPlayerInterleavedTurnOrder(game, baseEntrants),
    currentTurnIndex: 0,
    entrants: prepared.entrants,
    finishers: [],
    round: 1,
    previousDieRoll: null,
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

function createPlayerInterleavedTurnOrder(game: GameState, entrants: Entrant[]): string[] {
  const entrantsByPlayerId = new Map(game.players.map((player) => [player.id, entrants.filter((entrant) => entrant.playerId === player.id)]));
  const racersPerPlayer = Math.max(...[...entrantsByPlayerId.values()].map((playerEntrants) => playerEntrants.length));

  return Array.from({ length: racersPerPlayer }, (_, racerIndex) =>
    game.players.map((player) => entrantsByPlayerId.get(player.id)?.[racerIndex]?.id).filter((entrantId): entrantId is string => Boolean(entrantId)),
  ).flat();
}

export function rollForCurrentPlayer(game: GameState, playerId: string, rng: Rng, choice?: MainMoveChoice): GameState {
  let race = requireActiveRace(game);

  const copycatRace = queueCopycatSelectionReactions(game, race);
  if (copycatRace.pendingReactions.length > race.pendingReactions.length) {
    return {
      ...game,
      activeRace: {
        ...copycatRace,
        pendingTurnState: { extraTurnPlayerId: null, nextTurnPlayerId: null, resumeCurrentTurn: true },
      },
      revision: game.revision + 1,
    };
  }
  race = copycatRace;

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

  // A tripped racer recovers without rolling, so no after-roll powers may interrupt that turn.
  if (entrant.skippedTurns > 0) {
    const mainMove = resolveMainMove({ game, race, entrant, rng, choice });
    return finishResolvedMove(game, entrant, mainMove);
  }

  const dicemonger = findOtherDicemonger(game, race, entrant);
  const usesDie = !choice?.useLegsFixedMove && !choice?.useFlipFlopSwap;

  if (dicemonger && usesDie && !choice?.skipDicemongerPrompt) {
    const dieRoll = (choice?.forcedDieRoll ?? rng.rollDie(6)) as 1 | 2 | 3 | 4 | 5 | 6;
    const promptId = `dicemonger:${entrant.id}:${race.round}:${entrant.actionCount}`;

    return {
      ...game,
      activeRace: {
        ...race,
        previousDieRoll: dieRoll,
        previousFinalMoveValue: dieRoll,
        pendingDiceDecision: {
          kind: "dicemonger",
          playerId: entrant.playerId,
          entrantId: entrant.id,
          dieRoll,
          choice: choice ?? {},
          dicemongerEntrantId: dicemonger.id,
        },
        pendingReactions: [
          ...race.pendingReactions,
          {
            id: promptId,
            playerId: entrant.playerId,
            athleteId: entrant.athleteId,
            promptType: "reroll",
            sourceEntrantId: dicemonger.id,
            targetEntrantId: entrant.id,
            title: "骰子商人：是否重投？",
            description: `${describeRaceEntrant(game, entrant)} 掷出了 ${dieRoll}。你可以保留这个点数，或重投一次；只有重投时${describeRaceEntrant(game, dicemonger)}才移动 1 格。`,
          },
        ],
      },
      log: [
        ...game.log,
        createLog(game, "dice_roll", `${describeRaceEntrant(game, entrant)} 掷出了 ${dieRoll}。`, 0),
        createLog(game, "ability_trigger", `${describeRaceEntrant(game, dicemonger)} 提供一次可选重投。`, 1),
      ],
      revision: game.revision + 1,
    };
  }

  if (usesDie && !choice?.skipAfterRollPrompt) {
    const dieRoll = (choice?.forcedDieRoll ?? rng.rollDie(6)) as 1 | 2 | 3 | 4 | 5 | 6;
    const postRollPrompt = createPostRollPrompt(game, race, entrant, dieRoll, choice ?? {});

    if (postRollPrompt) {
      return {
        ...game,
        activeRace: {
          ...race,
          previousDieRoll: dieRoll,
          previousFinalMoveValue: dieRoll,
          pendingDiceDecision: postRollPrompt.decision,
          pendingReactions: [...race.pendingReactions, postRollPrompt.prompt],
        },
        log: [...game.log, createLog(game, "dice_roll", `${describeRaceEntrant(game, entrant)} 掷出了 ${dieRoll}。`, 0)],
        revision: game.revision + 1,
      };
    }

    choice = { ...choice, forcedDieRoll: dieRoll };
  }

  const mainMove = resolveMainMove({ game, race, entrant, rng, choice });
  return finishResolvedMove(game, entrant, mainMove);
}

function finishResolvedMove(
  game: GameState,
  entrant: Entrant,
  mainMove: ReturnType<typeof resolveMainMove>,
): GameState {
  const moveResult = moveWithAbility(mainMove.race, mainMove.entrant, mainMove.finalMove, {
    leaptoad: mainMove.usesLeaptoadMove,
    preventOverFinish: mainMove.preventsOverFinish,
  });
  const exactFinishBlocked =
    mainMove.preventsOverFinish &&
    mainMove.entrant.position + mainMove.finalMove > mainMove.race.trackLength;
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
    previousDieRoll: mainMove.dieRoll,
    previousFinalMoveValue: mainMove.finalMove,
  };
  let raceAfterLeaptoadJumps: RaceState = updatedRace;
  const leaptoadLogs: { type: GameLogEntry["type"]; message: string }[] = [];

  for (let jumpIndex = 0; jumpIndex < moveResult.skippedEntrantIds.length; jumpIndex += 1) {
    raceAfterLeaptoadJumps = triggerScoocherOnOtherPower(
      { ...game, players: mainMove.players, activeRace: raceAfterLeaptoadJumps },
      raceAfterLeaptoadJumps,
      entrant.id,
      leaptoadLogs,
    );
  }
  const afterMove = resolveAfterMove({
    game: { ...game, players: mainMove.players, activeRace: raceAfterLeaptoadJumps },
    race: raceAfterLeaptoadJumps,
    players: mainMove.players,
    moverBefore,
    moverAfter: moveResult.entrant,
    path: moveResult.path,
    abilityTriggered: mainMove.logs.some((log) => log.type === "ability_trigger"),
  });
  const specialResolution = resolveSpecialTrackEffects(
    { ...game, players: afterMove.players, activeRace: afterMove.race },
    afterMove.race,
    afterMove.players,
  );
  const raceAfterSecondaryFinishes = syncFinishers(specialResolution.race);
  const baseLogs = [
    ...mainMove.logs,
    ...(mainMove.dieRoll === null
      ? []
      : [{ type: "dice_roll" as const, message: `${describeRaceEntrant(game, entrant)} 掷出了 ${mainMove.dieRoll}。` }]),
    ...(exactFinishBlocked
      ? [
          {
            type: "ability_trigger" as const,
            message: `较真者在场，${describeRaceEntrant(game, entrant)}需要刚好冲线；本应移动 ${mainMove.finalMove} 格，改为停在终点前一格。`,
          },
        ]
      : []),
    {
      type: "movement" as const,
      message:
        mainMove.finalMove === 0
          ? `${describeRaceEntrant(game, entrant)} 停在 ${moveResult.entrant.position}。`
          : `${describeRaceEntrant(game, entrant)} 移动 ${mainMove.finalMove} 格，到达 ${moveResult.entrant.position}。`,
    },
    ...afterMove.logs,
    ...leaptoadLogs,
    ...specialResolution.logs,
  ];
  const gameWithMove = {
    ...game,
    players: specialResolution.players,
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

function resolveSpecialTrackEffects(
  game: GameState,
  race: RaceState,
  players: GameState["players"],
): { race: RaceState; players: GameState["players"]; logs: { type: GameLogEntry["type"]; message: string }[] } {
  // Reactions to the landing (notably Suckerfish) happen before the space resolves.
  // Once every pending reaction is answered, this resolver runs again and each racer
  // standing on the space receives its own special-space effect.
  if (race.boardKind !== "special" || race.pendingReactions.length > 0) {
    return { race, players, logs: [] };
  }

  let workingRace: RaceState = {
    ...race,
    entrants: race.entrants.map((entrant) =>
      entrant.resolvedSpecialSpace !== undefined && entrant.resolvedSpecialSpace !== entrant.position
        ? { ...entrant, resolvedSpecialSpace: undefined }
        : entrant,
    ),
  };
  let nextPlayers = players;
  const logs: { type: GameLogEntry["type"]; message: string }[] = [];

  // A special move can land on another special space. The guard protects malformed custom tracks.
  for (let resolutionCount = 0; resolutionCount < 40; resolutionCount += 1) {
    const entrant = workingRace.entrants.find((candidate) =>
      !candidate.finished &&
      !candidate.eliminated &&
      candidate.resolvedSpecialSpace !== candidate.position &&
      getSpecialTrackEffect(candidate.position),
    );

    if (!entrant) {
      break;
    }

    const effect = getSpecialTrackEffect(entrant.position)!;
    workingRace = {
      ...workingRace,
      entrants: workingRace.entrants.map((candidate) =>
        candidate.id === entrant.id ? { ...candidate, resolvedSpecialSpace: entrant.position } : candidate,
      ),
    };

    if (effect.type === "score") {
      nextPlayers = nextPlayers.map((player) =>
        player.id === entrant.playerId ? { ...player, score: Math.max(0, player.score + effect.points) } : player,
      );
      logs.push({ type: "score_awarded", message: `${describeRaceEntrant(game, entrant)} 落到特殊格 ${entrant.position}，获得 ${effect.points} 分。` });
      continue;
    }

    if (effect.type === "trip") {
      workingRace = {
        ...workingRace,
        entrants: workingRace.entrants.map((candidate) =>
          candidate.id === entrant.id ? { ...candidate, skippedTurns: candidate.skippedTurns + 1 } : candidate,
        ),
      };
      logs.push({ type: "status_added", message: `${describeRaceEntrant(game, entrant)} 落到特殊格 ${entrant.position}，绊倒并跳过下一次主移动。` });
      continue;
    }

    const moveResult = effect.spaces > 0
      ? moveEntrantForward(entrant, effect.spaces, workingRace.trackLength)
      : moveEntrantBackward(entrant, Math.abs(effect.spaces));
    // Keep the source space marked as resolved in case another effect sends this racer back to it.
    // A different special destination still has a different position and will resolve normally.
    const movedEntrant = { ...moveResult.entrant, resolvedSpecialSpace: entrant.position };
    workingRace = {
      ...workingRace,
      entrants: workingRace.entrants.map((candidate) =>
        candidate.id === entrant.id ? movedEntrant : candidate,
      ),
    };
    logs.push({
      type: "movement",
      message: `${describeRaceEntrant(game, entrant)} 落到特殊格 ${entrant.position}，${effect.spaces > 0 ? "前进" : "后退"} ${Math.abs(effect.spaces)} 格到 ${movedEntrant.position}。`,
    });

    const afterMove = resolveAfterMove({
      game: { ...game, players: nextPlayers, activeRace: workingRace },
      race: workingRace,
      players: nextPlayers,
      moverBefore: entrant,
      moverAfter: movedEntrant,
      path: moveResult.path,
      abilityTriggered: true,
    });
    workingRace = afterMove.race;
    nextPlayers = afterMove.players;
    logs.push(...afterMove.logs);
  }

  return { race: workingRace, players: nextPlayers, logs };
}

function confirmReaction(
  game: GameState,
  playerId: string,
  reactionId: string,
  accepted: boolean,
  rng: Rng,
  targetEntrantId?: string,
): GameState {
  const race = requireActiveRace(game);
  const prompt = race.pendingReactions.find((candidate) => candidate.id === reactionId);

  if (!prompt) {
    throw new Error(`Missing reaction prompt: ${reactionId}`);
  }

  if (prompt.playerId !== playerId) {
    throw new Error(`Reaction ${reactionId} belongs to ${prompt.playerId}, not ${playerId}`);
  }

  if (prompt.promptType === "reroll") {
    return confirmDicemongerReroll(game, race, prompt, playerId, accepted, rng);
  }

  if (prompt.promptType === "duel") {
    return confirmDuel(game, race, prompt, accepted, targetEntrantId, rng);
  }

  if (prompt.promptType === "copy") {
    return confirmCopycatChoice(game, race, prompt, accepted, targetEntrantId, rng);
  }

  if (prompt.promptType === "optionalPower" && race.pendingDiceDecision?.kind) {
    return confirmAfterRollDecision(game, race, prompt, playerId, accepted, rng);
  }

  let workingRace: RaceState = {
    ...race,
    pendingReactions: race.pendingReactions.filter((candidate) => candidate.id !== reactionId),
  };
  const reactionLogs: GameLogEntry[] = [];
  let reactionPlayers = game.players;

  if (prompt.sourceEntrantId && prompt.targetEntrantId) {
    const reactor = workingRace.entrants.find((entrant) => entrant.id === prompt.sourceEntrantId);
    const target = workingRace.entrants.find((entrant) => entrant.id === prompt.targetEntrantId);

    if (reactor && target) {
      if (accepted) {
        const reachesFinish = target.position >= workingRace.trackLength;
        const followRank = reachesFinish ? workingRace.finishers.length + 1 : null;
        const reactorBefore = reactor;
        const followPath = Array.from(
          { length: Math.max(0, target.position - reactor.position) },
          (_, index) => reactor.position + index + 1,
        );
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

        const reactorAfter = workingRace.entrants.find((entrant) => entrant.id === reactor.id) ?? reactor;
        const afterFollow = resolveAfterMove({
          game: { ...game, players: reactionPlayers, activeRace: workingRace },
          race: workingRace,
          players: reactionPlayers,
          moverBefore: reactorBefore,
          moverAfter: reactorAfter,
          path: followPath,
          abilityTriggered: true,
        });
        workingRace = afterFollow.race;
        reactionPlayers = afterFollow.players;
        reactionLogs.push(
          ...afterFollow.logs.map((log, index) => createLog(game, log.type, log.message, reactionLogs.length + index)),
        );
      } else {
        reactionLogs.push(
          createLog(game, "ability_trigger", `${describeRaceEntrant(game, reactor)} 放弃跟随${describeRaceEntrant(game, target)}。`, 0),
        );
      }
    }
  }

  const specialFollowResolution = resolveSpecialTrackEffects(
    { ...game, players: reactionPlayers, activeRace: workingRace },
    workingRace,
    reactionPlayers,
  );
  workingRace = specialFollowResolution.race;
  reactionPlayers = specialFollowResolution.players;
  reactionLogs.push(
    ...specialFollowResolution.logs.map((log, index) => createLog(game, log.type, log.message, reactionLogs.length + index)),
  );
  const syncedFollowRace = syncFinishers(workingRace);
  workingRace = syncedFollowRace.race;
  reactionLogs.push(
    ...syncedFollowRace.logs.map((log, index) => createLog(game, log.type, log.message, reactionLogs.length + index)),
  );

  let nextGame: GameState = {
    ...game,
    players: reactionPlayers,
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

  if (continuation?.resumeDiceRoll) {
    return rollForCurrentPlayer(nextGame, continuation.resumeDiceRoll.playerId, rng, {
      ...continuation.resumeDiceRoll.choice,
      forcedDieRoll: continuation.resumeDiceRoll.dieRoll,
      skipDicemongerPrompt: true,
    });
  }

  if (continuation?.extraTurnPlayerId) {
    return setNextTurn(nextGame, workingRace, continuation.extraTurnPlayerId);
  }

  if (continuation?.nextTurnPlayerId) {
    return setNextTurn(nextGame, workingRace, continuation.nextTurnPlayerId);
  }

  return advanceTurn(nextGame, workingRace);
}

function confirmDuel(
  game: GameState,
  race: RaceState,
  prompt: { id: string; sourceEntrantId?: string },
  accepted: boolean,
  targetEntrantId: string | undefined,
  rng: Rng,
): GameState {
  let workingRace: RaceState = {
    ...race,
    pendingReactions: race.pendingReactions.filter((candidate) => candidate.id !== prompt.id),
  };
  const logs: GameLogEntry[] = [];
  let nextPlayers = game.players;
  const duelist = prompt.sourceEntrantId ? workingRace.entrants.find((entrant) => entrant.id === prompt.sourceEntrantId) : null;

  if (!duelist) {
    throw new Error("Missing Duelist for duel reaction");
  }

  if (!accepted) {
    logs.push(createLog(game, "ability_trigger", `${describeRaceEntrant(game, duelist)} 放弃发起决斗。`, 0));
  } else {
    const opponent = targetEntrantId ? workingRace.entrants.find((entrant) => entrant.id === targetEntrantId) : null;
    if (!opponent || opponent.id === duelist.id || opponent.finished || opponent.eliminated || opponent.position !== duelist.position) {
      throw new Error("Duelist must choose another active racer sharing its space");
    }

    const duelistRoll = rng.rollDie(6);
    const opponentRoll = rng.rollDie(6);
    const winner = duelistRoll >= opponentRoll ? duelist : opponent;
    const rewardMove = moveEntrantForward(winner, 2, workingRace.trackLength);
    workingRace = moveEntrantInRace(game, workingRace, winner.id, 2);
    logs.push(
      createLog(
        game,
        "ability_trigger",
        `${describeRaceEntrant(game, duelist)} 向${describeRaceEntrant(game, opponent)}发起决斗；双方掷出 ${duelistRoll} 比 ${opponentRoll}，${describeRaceEntrant(game, winner)}获胜并前进 2 格。`,
        0,
      ),
    );
    const winnerAfter = workingRace.entrants.find((entrant) => entrant.id === winner.id);
    if (winnerAfter) {
      const afterMove = resolveAfterMove({
        game: { ...game, activeRace: workingRace },
        race: workingRace,
        players: nextPlayers,
        moverBefore: winner,
        moverAfter: winnerAfter,
        path: rewardMove.path,
        abilityTriggered: true,
      });
      workingRace = afterMove.race;
      nextPlayers = afterMove.players;
      logs.push(...afterMove.logs.map((log, index) => createLog(game, log.type, log.message, index + 1)));
    }
  }

  return finalizeReaction(game, race, workingRace, nextPlayers, logs, rng);
}

function confirmCopycatChoice(
  game: GameState,
  race: RaceState,
  prompt: { id: string; sourceEntrantId?: string },
  accepted: boolean,
  targetEntrantId: string | undefined,
  rng: Rng,
): GameState {
  const copycat = prompt.sourceEntrantId ? race.entrants.find((entrant) => entrant.id === prompt.sourceEntrantId) : null;
  if (!copycat) {
    throw new Error("Missing Copycat for copy reaction");
  }

  const activeEntrants = race.entrants.filter((entrant) => !entrant.finished && !entrant.eliminated);
  const leadPosition = Math.max(...activeEntrants.map((entrant) => entrant.position));
  const eligibleLeaders = activeEntrants.filter((entrant) => entrant.id !== copycat.id && entrant.position === leadPosition);
  const signature = eligibleLeaders.map((entrant) => entrant.id).sort().join(":");
  const selectedLeader = targetEntrantId ? eligibleLeaders.find((entrant) => entrant.id === targetEntrantId) : null;

  if (accepted && !selectedLeader) {
    throw new Error("Copycat must choose a current leading racer");
  }

  const workingRace: RaceState = {
    ...race,
    pendingReactions: race.pendingReactions.filter((candidate) => candidate.id !== prompt.id),
    entrants: race.entrants.map((entrant) =>
      entrant.id === copycat.id
        ? {
            ...entrant,
            copyLeadSignature: signature,
            copiedLeaderEntrantId: selectedLeader?.id,
            copyLeadDeclinedSignature: accepted ? undefined : signature,
          }
        : entrant,
    ),
  };
  const message = accepted
    ? `${describeRaceEntrant(game, copycat)} 选择复制${describeRaceEntrant(game, selectedLeader!)}的能力。`
    : `${describeRaceEntrant(game, copycat)} 暂不复制本次并列领先者的能力。`;

  return finalizeReaction(game, race, workingRace, game.players, [createLog(game, "ability_trigger", message, 0)], rng);
}

function finalizeReaction(
  game: GameState,
  originalRace: RaceState,
  race: RaceState,
  players: GameState["players"],
  logs: GameLogEntry[],
  rng: Rng,
): GameState {
  const specialResolution = resolveSpecialTrackEffects({ ...game, players, activeRace: race }, race, players);
  const synced = syncFinishers(specialResolution.race);
  const workingRace = synced.race;
  const nextGame: GameState = {
    ...game,
    players: specialResolution.players,
    activeRace: workingRace,
    log: [
      ...game.log,
      ...logs,
      ...specialResolution.logs.map((log, index) => createLog(game, log.type, log.message, logs.length + index)),
      ...synced.logs.map((log, index) => createLog(game, log.type, log.message, logs.length + specialResolution.logs.length + index)),
    ],
    revision: game.revision + 1,
  };

  if (workingRace.pendingReactions.length > 0) {
    return nextGame;
  }

  const continuation = originalRace.pendingTurnState;
  const clearedRace = { ...workingRace, pendingTurnState: null };
  const continuedGame = { ...nextGame, activeRace: clearedRace };

  if (shouldCompleteRace(continuedGame, clearedRace)) {
    return completeRace(continuedGame);
  }

  if (continuation?.resumeDiceRoll) {
    return rollForCurrentPlayer(continuedGame, continuation.resumeDiceRoll.playerId, rng, {
      ...continuation.resumeDiceRoll.choice,
      forcedDieRoll: continuation.resumeDiceRoll.dieRoll,
      skipDicemongerPrompt: true,
    });
  }

  if (continuation?.resumeCurrentTurn) {
    return continuedGame;
  }

  if (continuation?.extraTurnPlayerId) {
    return setNextTurn(continuedGame, clearedRace, continuation.extraTurnPlayerId);
  }

  if (continuation?.nextTurnPlayerId) {
    return setNextTurn(continuedGame, clearedRace, continuation.nextTurnPlayerId);
  }

  return advanceTurn(continuedGame, clearedRace);
}

function confirmDicemongerReroll(
  game: GameState,
  race: RaceState,
  prompt: { id: string },
  playerId: string,
  accepted: boolean,
  rng: Rng,
): GameState {
  const decision = race.pendingDiceDecision;

  if (!decision || decision.kind !== "dicemonger" || decision.playerId !== playerId) {
    throw new Error("Missing DiceMonger decision");
  }

  const finalRoll = (accepted ? rng.rollDie(6) : decision.dieRoll) as 1 | 2 | 3 | 4 | 5 | 6;
  const dicemonger = race.entrants.find((entrant) => entrant.id === decision.dicemongerEntrantId);
  let continuedRace: RaceState = {
    ...race,
    previousDieRoll: finalRoll,
    pendingDiceDecision: null,
    pendingReactions: race.pendingReactions.filter((candidate) => candidate.id !== prompt.id),
  };

  if (accepted && dicemonger) {
    continuedRace = moveEntrantInRace(game, continuedRace, dicemonger.id, 1);
  }

  const decisionLog = accepted
    ? `${describeRaceEntrant(game, race.entrants.find((entrant) => entrant.id === decision.entrantId) ?? race.entrants[0])} 选择重投：${decision.dieRoll} -> ${finalRoll}；${dicemonger ? describeRaceEntrant(game, dicemonger) : "骰子商人"}移动 1 格。`
    : `${describeRaceEntrant(game, race.entrants.find((entrant) => entrant.id === decision.entrantId) ?? race.entrants[0])} 保留点数 ${decision.dieRoll}。`;
  const gameAfterDecision: GameState = {
    ...game,
    activeRace: continuedRace,
    log: [...game.log, createLog(game, "ability_trigger", decisionLog, 0)],
    revision: game.revision + 1,
  };

  const rerollChoice: MainMoveChoice = {
    ...decision.choice,
    forcedDieRoll: finalRoll,
    skipDicemongerPrompt: true,
  };

  if (continuedRace.pendingReactions.length > 0) {
    return {
      ...gameAfterDecision,
      activeRace: {
        ...continuedRace,
        pendingTurnState: {
          extraTurnPlayerId: null,
          nextTurnPlayerId: null,
          resumeDiceRoll: { playerId: decision.entrantId, dieRoll: finalRoll, choice: decision.choice },
        },
      },
    };
  }

  return rollForCurrentPlayer(gameAfterDecision, decision.entrantId, rng, rerollChoice);
}

function confirmAfterRollDecision(
  game: GameState,
  race: RaceState,
  prompt: { id: string },
  playerId: string,
  accepted: boolean,
  rng: Rng,
): GameState {
  const decision = race.pendingDiceDecision;

  if (!decision || decision.playerId !== playerId) {
    throw new Error("Missing after-roll decision");
  }

  const continuedRace: RaceState = {
    ...race,
    pendingDiceDecision: null,
    pendingReactions: race.pendingReactions.filter((candidate) => candidate.id !== prompt.id),
  };
  const actor = race.entrants.find((entrant) => entrant.id === decision.entrantId) ?? race.entrants[0];
  let choice: MainMoveChoice = { ...decision.choice, forcedDieRoll: decision.dieRoll, skipDicemongerPrompt: true };
  let message: string;

  if (decision.kind === "alchemist") {
    choice = { ...choice, useAlchemistFour: accepted, skipAfterRollPrompt: true };
    message = accepted
      ? `${describeRaceEntrant(game, actor)} 选择将点数 ${decision.dieRoll} 改为移动 4 格。`
      : `${describeRaceEntrant(game, actor)} 保留点数 ${decision.dieRoll}。`;
  } else if (decision.kind === "rocketScientist") {
    choice = { ...choice, useRocketScientistDouble: accepted, skipAfterRollPrompt: true };
    message = accepted
      ? `${describeRaceEntrant(game, actor)} 选择将点数 ${decision.dieRoll} 加倍，并会在移动后绊倒。`
      : `${describeRaceEntrant(game, actor)} 放弃火箭加倍，保留点数 ${decision.dieRoll}。`;
  } else {
    if (!accepted) {
      choice = { ...choice, skipAfterRollPrompt: true };
      message = `${describeRaceEntrant(game, actor)} 保留魔术师点数 ${decision.dieRoll}。`;
    } else {
      const nextRoll = rng.rollDie(6) as 1 | 2 | 3 | 4 | 5 | 6;
      choice = {
        ...choice,
        forcedDieRoll: nextRoll,
        magicianRerollsUsed: 1,
      };
      message = `${describeRaceEntrant(game, actor)} 使用魔术师重投：${decision.dieRoll} -> ${nextRoll}。`;
    }
  }

  const gameAfterDecision: GameState = {
    ...game,
    activeRace: continuedRace,
    log: [...game.log, createLog(game, "ability_trigger", message, 0)],
    revision: game.revision + 1,
  };

  return rollForCurrentPlayer(gameAfterDecision, decision.entrantId, rng, choice);
}

function createPostRollPrompt(
  game: GameState,
  race: RaceState,
  entrant: Entrant,
  dieRoll: 1 | 2 | 3 | 4 | 5 | 6,
  choice: MainMoveChoice,
): { decision: NonNullable<RaceState["pendingDiceDecision"]>; prompt: RaceState["pendingReactions"][number] } | null {
  const key = getEffectiveImplementationKey(game, race, entrant);
  const actor = describeRaceEntrant(game, entrant);
  const base = { playerId: entrant.playerId, entrantId: entrant.id, dieRoll, choice };

  if (key === "main_roll_low_becomes_four" && dieRoll <= 2) {
    return {
      decision: { ...base, kind: "alchemist" },
      prompt: {
        id: `alchemist:${entrant.id}:${race.round}:${entrant.actionCount}`,
        playerId: entrant.playerId,
        athleteId: entrant.athleteId,
        promptType: "optionalPower",
        title: "炼金师：是否改为移动 4 格？",
        description: `${actor} 掷出了 ${dieRoll}。可以保留点数，或使用炼金师改为移动 4 格。`,
      },
    };
  }

  if (key === "reroll_main_move_up_to_two" && (choice.magicianRerollsUsed ?? 0) < 1) {
    return {
      decision: { ...base, kind: "magician", rerollsUsed: choice.magicianRerollsUsed ?? 0 },
      prompt: {
        id: `magician:${entrant.id}:${race.round}:${entrant.actionCount}:${choice.magicianRerollsUsed ?? 0}`,
        playerId: entrant.playerId,
        athleteId: entrant.athleteId,
        promptType: "optionalPower",
        title: "魔术师：是否重投？",
        description: `${actor} 掷出了 ${dieRoll}。可重投 1 次；必须使用最后一次结果。`,
      },
    };
  }

  if (key === "optional_double_roll_then_trip" && dieRoll > 0) {
    return {
      decision: { ...base, kind: "rocketScientist" },
      prompt: {
        id: `rocket:${entrant.id}:${race.round}:${entrant.actionCount}`,
        playerId: entrant.playerId,
        athleteId: entrant.athleteId,
        promptType: "optionalPower",
        title: "火箭科学家：是否加倍？",
        description: `${actor} 掷出了 ${dieRoll}。可改为移动 ${dieRoll * 2} 格，但下回合会绊倒。`,
      },
    };
  }

  return null;
}

function findOtherDicemonger(game: GameState, race: RaceState, entrant: Entrant): Entrant | null {
  return race.entrants.find((candidate) => {
    return (
      candidate.id !== entrant.id &&
      !candidate.finished &&
      !candidate.eliminated &&
      getEffectiveImplementationKey(game, race, candidate) === "grant_reroll_move_on_use"
    );
  }) ?? null;
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
    return { ...moveEntrantForward(entrant, maxSpaces, race.trackLength), skippedEntrantIds: [] };
  }

  const occupantsBySpace = new Map<number, string[]>();
  for (const candidate of race.entrants) {
    if (candidate.id === entrant.id || candidate.finished || candidate.eliminated) {
      continue;
    }

    occupantsBySpace.set(candidate.position, [...(occupantsBySpace.get(candidate.position) ?? []), candidate.id]);
  }
  const skippedEntrantIds: string[] = [];
  const path: number[] = [];
  let position = entrant.position;

  while (path.length < maxSpaces && position < race.trackLength) {
    position += 1;

    const occupants = occupantsBySpace.get(position) ?? [];
    if (occupants.length > 0 && position !== race.trackLength) {
      skippedEntrantIds.push(...occupants);
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
    skippedEntrantIds,
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
