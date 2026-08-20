import { STANDARD_ATHLETE_BY_ID } from "./athletes";
import { BLIMP_SECOND_CORNER_SPACE } from "./constants";
import {
  shouldAutoUseFlipFlop,
  shouldAutoUseRocketScientist,
} from "./abilityImplementations";
import { getPassedSpaces, moveEntrantBackward, moveEntrantForward } from "./movement";
import type { AbilityImplementationKey } from "./abilityTypes";
import type { GameLogEntry, GameState, Entrant, MainMoveChoice, Player, RaceState } from "./types";
import type { Rng } from "./rng";

export type AbilityLog = {
  type: GameLogEntry["type"];
  message: string;
};

export type MainMoveResolution = {
  dieRoll: number | null;
  finalMove: number;
  entrant: Entrant;
  race: RaceState;
  players: Player[];
  logs: AbilityLog[];
  usesLeaptoadMove: boolean;
  preventsOverFinish: boolean;
  extraTurnPlayerId: string | null;
  nextTurnPlayerId: string | null;
  turnStartPosition: number;
};

export type AfterMoveResolution = {
  race: RaceState;
  players: Player[];
  logs: AbilityLog[];
};

type ResolveMainMoveOptions = {
  game: GameState;
  race: RaceState;
  entrant: Entrant;
  rng: Rng;
  choice?: MainMoveChoice;
};

type ApplyBeforeRaceOptions = {
  game: GameState;
  entrants: Entrant[];
  mastermindPredictionsByAthleteId?: Record<string, string>;
  copiedAbilityAthleteIdByAthleteId?: Record<string, string>;
};

type ResolveAfterMoveOptions = {
  game: GameState;
  race: RaceState;
  players: Player[];
  moverBefore: Entrant;
  moverAfter: Entrant;
  path: number[];
  abilityTriggered: boolean;
};

export function applyBeforeRaceAbilities({
  game,
  entrants,
  mastermindPredictionsByAthleteId = {},
  copiedAbilityAthleteIdByAthleteId = {},
}: ApplyBeforeRaceOptions): {
  entrants: Entrant[];
  players: Player[];
  logs: AbilityLog[];
} {
  const logs: AbilityLog[] = [];
  let nextEntrants = entrants;
  let players = game.players;

  nextEntrants = nextEntrants.map((entrant) => {
    const key = getBaseImplementationKey(entrant);
    const name = describeEntrant(game, entrant);

    if (key === "draft_temp_power_before_race") {
      const copied = STANDARD_ATHLETE_BY_ID.get(copiedAbilityAthleteIdByAthleteId[entrant.athleteId]);

      if (copied) {
        logs.push({
          type: "ability_trigger",
          message: `${name} 使用鸡蛋，在本场复制了${copied.displayName}的能力。`,
        });
        return { ...entrant, copiedAbilityKey: copied.implementationKey };
      }
    }

    if (key === "copy_previous_winner_before_race") {
      const copied = STANDARD_ATHLETE_BY_ID.get(copiedAbilityAthleteIdByAthleteId[entrant.athleteId]);

      if (copied) {
        logs.push({
          type: "ability_trigger",
          message: `${name} 使用双胞胎，复制了此前冠军${copied.displayName}的能力。`,
        });
        return { ...entrant, copiedAbilityKey: copied.implementationKey };
      }
    }

    if (key === "predict_winner_finish_second") {
      const predictedAthleteId = mastermindPredictionsByAthleteId[entrant.athleteId];
      const predicted =
        entrants.find((candidate) => candidate.athleteId === predictedAthleteId) ??
        entrants.reduce((leader, candidate) =>
          candidate.playerId < leader.playerId ? candidate : leader,
        );

      logs.push({
        type: "ability_trigger",
        message: `${name} 使用预言家，预测${describeEntrant(game, predicted)}会夺冠。`,
      });
      return { ...entrant, predictedWinnerEntrantId: predicted.id };
    }

    return entrant;
  });

  for (const entrant of nextEntrants) {
    if (getEffectiveImplementationKey(game, { ...game, activeRace: { ...emptyRace(game), entrants: nextEntrants } }.activeRace!, entrant) === "points_then_six_warp_start") {
      players = addScore(players, entrant.playerId, 4);
      logs.push({
        type: "score_awarded",
        message: `${describeEntrant(game, entrant)} 使用西西弗斯，赛前获得 4 分。`,
      });
    }
  }

  return { entrants: nextEntrants, players, logs };
}

export function resolveMainMove({ game, race, entrant, rng, choice = {} }: ResolveMainMoveOptions): MainMoveResolution {
  const key = getEffectiveImplementationKey(game, race, entrant);
  const racerName = describeEntrant(game, entrant);
  const logs: AbilityLog[] = [];
  let players = game.players;
  let workingRace = race;
  let workingEntrant = entrant;
  const turnStartPosition = entrant.position;
  let extraTurnPlayerId: string | null = null;
  let nextTurnPlayerId: string | null = null;

  if (workingEntrant.skippedTurns > 0) {
    return {
      dieRoll: null,
      finalMove: 0,
      entrant: {
        ...workingEntrant,
        skippedTurns: workingEntrant.skippedTurns - 1,
        actionCount: workingEntrant.actionCount + 1,
      },
      race: workingRace,
      players,
      logs: [
        {
          type: "status_removed",
          message: `${racerName} 从摔倒中恢复，跳过本次主移动。`,
        },
      ],
      usesLeaptoadMove: false,
      preventsOverFinish: false,
      extraTurnPlayerId: null,
      nextTurnPlayerId: null,
      turnStartPosition,
    };
  }

  const beforeMain = applyBeforeMainMove(game, workingRace, workingEntrant, players, choice);
  workingRace = beforeMain.race;
  players = beforeMain.players;
  logs.push(...beforeMain.logs);
  workingEntrant =
    workingRace.entrants.find((candidate) => candidate.id === entrant.id) ?? workingEntrant;

  if (key === "hare_fast_unless_alone_lead" && workingRace.finishers.length === 0 && isAloneInLead(workingRace, workingEntrant)) {
    return {
      dieRoll: null,
      finalMove: 0,
      entrant: {
        ...workingEntrant,
        actionCount: workingEntrant.actionCount + 1,
      },
      race: workingRace,
      players,
      logs: [
        ...logs,
        {
          type: "ability_trigger",
          message: `${racerName} 独自领先，野兔能力使本次主移动为 0。`,
        },
      ],
      usesLeaptoadMove: false,
      preventsOverFinish: false,
      extraTurnPlayerId,
      nextTurnPlayerId,
      turnStartPosition,
    };
  }

  if (
    key === "warp_swap_instead_main_move" &&
    (choice.useFlipFlopSwap === true || ((choice.useFlipFlopSwap ?? true) && shouldAutoUseFlipFlop(workingRace, workingEntrant)))
  ) {
    const target = findEntrantById(workingRace, choice.flipFlopTargetEntrantId) ?? findLeaderOther(workingRace, workingEntrant);

    if (target && target.id !== workingEntrant.id && !target.finished && !target.eliminated) {
      workingRace = swapEntrants(workingRace, workingEntrant.id, target.id);
      workingEntrant =
        workingRace.entrants.find((candidate) => candidate.id === entrant.id) ?? workingEntrant;
      logs.push({
        type: "position_swap",
        message: `${racerName} 使用翻转者，与${describeEntrant(game, target)}交换位置。`,
      });
      workingRace = triggerScoocherOnOtherPower(game, workingRace, entrant.id, logs);
    }

    return buildResolution({
      dieRoll: null,
      finalMove: 0,
      entrant: { ...workingEntrant, actionCount: workingEntrant.actionCount + 1 },
      race: workingRace,
      players,
      logs,
      turnStartPosition,
    });
  }

  let dieRoll: number | null = null;
  let moveValue: number;
  let nextEntrant = {
    ...workingEntrant,
    actionCount: workingEntrant.actionCount + 1,
  };

  if (key === "main_move_fixed_five_optional" && (choice.useLegsFixedMove ?? true)) {
    moveValue = 5;
    logs.push({
      type: "ability_trigger",
      message: `${racerName} 使用长腿，不掷骰并将主移动设为 5。`,
    });
  } else {
    dieRoll = choice.forcedDieRoll ?? rng.rollDie(6);

    const rollReaction = applyRollReactions(game, workingRace, workingEntrant, dieRoll, players);
    workingRace = rollReaction.race;
    players = rollReaction.players;
    logs.push(...rollReaction.logs);

    if (rollReaction.skipMover) {
      return buildResolution({
        dieRoll,
        finalMove: 0,
        entrant: nextEntrant,
        race: workingRace,
        players,
        logs,
        nextTurnPlayerId: rollReaction.nextTurnPlayerId,
        turnStartPosition,
      });
    }

    moveValue = dieRoll;

    if (key === "main_roll_low_becomes_four" && dieRoll <= 2 && choice.useAlchemistFour === true) {
      moveValue = 4;
      logs.push({
        type: "ability_trigger",
        message: `${racerName} 使用炼金术士，将掷骰 ${dieRoll} 改为主移动 4。`,
      });
    }

    if (key === "points_then_six_warp_start" && dieRoll === 6) {
      nextEntrant = { ...nextEntrant, position: 0 };
      moveValue = 0;
      players = addScore(players, nextEntrant.playerId, -1);
      logs.push({
        type: "ability_trigger",
        message: `${racerName} 使用西西弗斯，掷出 6 后改为回到起点并失去 1 分。`,
      });
    }

    if (key === "optional_double_roll_then_trip" && choice.useRocketScientistDouble === true && shouldAutoUseRocketScientist(moveValue)) {
      moveValue *= 2;
      nextEntrant = {
        ...nextEntrant,
        skippedTurns: nextEntrant.skippedTurns + 1,
      };
      logs.push({
        type: "ability_trigger",
        message: `${racerName} 使用火箭科学家，将主移动翻倍为 ${moveValue}。`,
      });
      logs.push({
        type: "status_added",
        message: `${racerName} 摔倒了，下次主移动会跳过。`,
      });
    }

    if (key === "predict_roll_extra_turn" && choice.geniusGuess) {
      if (choice.geniusGuess === dieRoll) {
        extraTurnPlayerId = entrant.id;
        logs.push({
          type: "ability_trigger",
          message: `${racerName} 预测点数 ${choice.geniusGuess} 并成功命中，获得一个额外回合。`,
        });
      } else {
        logs.push({
          type: "ability_trigger",
          message: `${racerName} 预测点数 ${choice.geniusGuess}，实际为 ${dieRoll}，未命中。`,
        });
      }
    }

    if (rollReaction.nextTurnPlayerId) {
      nextTurnPlayerId = rollReaction.nextTurnPlayerId;
    }
  }

  moveValue = applyMainMoveModifiers(game, workingRace, workingEntrant, key, moveValue, logs);

  return buildResolution({
    dieRoll,
    finalMove: Math.max(0, moveValue),
    entrant: nextEntrant,
    race: workingRace,
    players,
    logs,
    usesLeaptoadMove: key === "skip_occupied_spaces_while_moving",
    preventsOverFinish: hasOtherKey(game, workingRace, workingEntrant, "others_need_exact_finish"),
    extraTurnPlayerId,
    nextTurnPlayerId,
    turnStartPosition,
  });
}

export function resolveAfterMove({
  game,
  race,
  players,
  moverBefore,
  moverAfter,
  path,
  abilityTriggered,
}: ResolveAfterMoveOptions): AfterMoveResolution {
  const logs: AbilityLog[] = [];
  let workingRace = race;
  let nextPlayers = players;
  const moverKey = getEffectiveImplementationKey(game, race, moverAfter);
  const passedSpaces = getPassedSpaces(moverBefore.position, moverAfter.position);
  const movedOutFromSharedStart = moverAfter.position > moverBefore.position;
  let didAnyAbilityTrigger = abilityTriggered;

  const hugeBaby = workingRace.entrants.find(
    (entrant) =>
      entrant.id !== moverAfter.id &&
      !entrant.finished &&
      !entrant.eliminated &&
      entrant.position > 0 &&
      entrant.position === moverAfter.position &&
      getEffectiveImplementationKey(game, workingRace, entrant) === "prevent_sharing_space_push_behind",
  );

  if (hugeBaby) {
    const pushedPosition = Math.max(0, hugeBaby.position - 1);
    workingRace = updateEntrant(workingRace, moverAfter.id, (current) => ({
      ...current,
      position: pushedPosition,
    }));
    moverAfter = { ...moverAfter, position: pushedPosition };
    logs.push({
      type: "ability_trigger",
      message: `${describeEntrant(game, hugeBaby)} 挡住格子，将${describeEntrant(game, moverAfter)}推回到 ${pushedPosition}。`,
    });
    didAnyAbilityTrigger = true;
  }

  if (moverKey === "prevent_sharing_space_push_behind" && path.length > 0) {
    const sharedEntrants = workingRace.entrants.filter(
      (entrant) =>
        entrant.id !== moverAfter.id &&
        !entrant.finished &&
        !entrant.eliminated &&
        entrant.position === moverAfter.position,
    );

    if (sharedEntrants.length > 0) {
      const pushedPosition = Math.max(0, moverAfter.position - 1);
      workingRace = {
        ...workingRace,
        entrants: workingRace.entrants.map((entrant) =>
          sharedEntrants.some((sharedEntrant) => sharedEntrant.id === entrant.id)
            ? { ...entrant, position: pushedPosition }
            : entrant,
        ),
      };
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, moverAfter)} 撞入同格，将${sharedEntrants.map((entrant) => describeEntrant(game, entrant)).join("、")}推回到 ${pushedPosition}。`,
      });
      didAnyAbilityTrigger = true;
    }
  }

  for (const entrant of workingRace.entrants) {
    if (entrant.id === moverAfter.id || entrant.finished || entrant.eliminated) {
      continue;
    }

    const key = getEffectiveImplementationKey(game, workingRace, entrant);

    if (
      key === "trip_passing_racer" &&
      (passedSpaces.includes(entrant.position) || (entrant.position === moverBefore.position && movedOutFromSharedStart))
    ) {
      workingRace = updateEntrant(workingRace, moverAfter.id, (current) => ({
        ...current,
        skippedTurns: current.skippedTurns + 1,
      }));
      logs.push({
        type: "status_added",
        message: `${describeEntrant(game, entrant)} 在经过判定中绊倒了${describeEntrant(game, moverAfter)}。`,
      });
      didAnyAbilityTrigger = true;
    }

  }

  workingRace = queueSuckerfishFollowReactions(game, workingRace, moverBefore, moverAfter, path);

  if (moverKey === "move_passed_racer_back_two") {
    for (const entrant of workingRace.entrants) {
      if (
        entrant.id !== moverAfter.id &&
        !entrant.finished &&
        !entrant.eliminated &&
        passedSpaces.includes(entrant.position)
      ) {
        const moved = moveEntrantBackward(entrant, 2).entrant;
        workingRace = replaceEntrant(workingRace, moved);
        workingRace = queueSuckerfishFollowReactions(game, workingRace, entrant, moved, [moved.position]);
      logs.push({
        type: "movement",
        message: `${describeEntrant(game, moverAfter)} 经过${describeEntrant(game, entrant)}，将其推回到 ${moved.position}。`,
      });
      didAnyAbilityTrigger = true;
    }
  }
  }

  const shared = path.length > 0 ? workingRace.entrants.filter(
    (entrant) =>
      entrant.id !== moverAfter.id &&
      !entrant.finished &&
      !entrant.eliminated &&
      entrant.position === moverAfter.position,
  ) : [];

  if (shared.length > 0) {
    const moverCurrent = workingRace.entrants.find((entrant) => entrant.id === moverAfter.id) ?? moverAfter;

    for (const entrant of shared) {
      const key = getEffectiveImplementationKey(game, workingRace, entrant);

      if (key === "trip_on_shared_stop") {
        workingRace = updateEntrant(workingRace, moverAfter.id, (current) => ({
          ...current,
          skippedTurns: current.skippedTurns + 1,
        }));
      logs.push({
        type: "status_added",
        message: `${describeEntrant(game, entrant)} 在同格停留时绊倒了${describeEntrant(game, moverCurrent)}。`,
      });
      didAnyAbilityTrigger = true;
    }
    }

    if (moverKey === "trip_on_shared_stop") {
      for (const entrant of shared) {
        workingRace = updateEntrant(workingRace, entrant.id, (current) => ({
          ...current,
          skippedTurns: current.skippedTurns + 1,
        }));
      }
      logs.push({
        type: "status_added",
        message: `${describeEntrant(game, moverCurrent)} 在同格停留时绊倒了${shared.map((entrant) => describeEntrant(game, entrant)).join("、")}。`,
      });
      didAnyAbilityTrigger = true;
    }

    if (moverKey === "eliminate_single_shared_racer" && shared.length === 1) {
      workingRace = updateEntrant(workingRace, shared[0].id, (current) => ({
        ...current,
        eliminated: true,
      }));
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, moverCurrent)} 将${describeEntrant(game, shared[0])}移出本场比赛。`,
      });
      didAnyAbilityTrigger = true;
    }
  }

  if (path.length > 0) {
    const duelists = workingRace.entrants.filter(
      (entrant) =>
        !entrant.finished &&
        !entrant.eliminated &&
        entrant.position === moverAfter.position &&
        getEffectiveImplementationKey(game, workingRace, entrant) === "duel_on_shared_space",
    );

    for (const duelist of duelists) {
      const opponents = workingRace.entrants.filter(
        (entrant) =>
          entrant.id !== duelist.id &&
          !entrant.finished &&
          !entrant.eliminated &&
          entrant.position === duelist.position,
      );

      if (opponents.length > 0 && !hasPendingDuelReaction(workingRace, duelist.id)) {
        workingRace = {
          ...workingRace,
          pendingReactions: [
            ...workingRace.pendingReactions,
            {
              id: `duel:${duelist.id}:${workingRace.round}:${workingRace.finishers.length}`,
              playerId: duelist.playerId,
              athleteId: duelist.athleteId,
              promptType: "duel",
              sourceEntrantId: duelist.id,
              title: "决斗家：是否呼喊决斗？",
              description: `${describeEntrant(game, duelist)} 可从同格的选手中选择 1 名决斗。双方掷骰，高点者移动 2 格；平局由决斗家获胜。`,
            },
          ],
        };
      }
    }
  }

  for (const romantic of workingRace.entrants) {
    if (
      getEffectiveImplementationKey(game, workingRace, romantic) === "move_two_on_pair_stop" &&
      !romantic.finished &&
      !romantic.eliminated &&
      countOthersAt(workingRace, moverAfter.id, moverAfter.position) === 1
    ) {
      workingRace = moveEntrantInRace(game, workingRace, romantic.id, 2);
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, romantic)} 看到一对选手同格，移动 2 格。`,
      });
      didAnyAbilityTrigger = true;
    }
  }

  for (const heckler of workingRace.entrants) {
    if (
      getEffectiveImplementationKey(game, workingRace, heckler) === "move_when_turn_ends_near_start" &&
      heckler.id !== moverAfter.id &&
      Math.abs(moverAfter.position - moverBefore.position) <= 1
    ) {
      workingRace = moveEntrantInRace(game, workingRace, heckler.id, 2);
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, heckler)} 嘲讽短移动回合，移动 2 格。`,
      });
      didAnyAbilityTrigger = true;
    }
  }

  if (didAnyAbilityTrigger) {
    for (const scoocher of workingRace.entrants) {
      if (
        getEffectiveImplementationKey(game, workingRace, scoocher) === "move_one_on_other_power" &&
        scoocher.id !== moverAfter.id &&
        !scoocher.finished &&
        !scoocher.eliminated
      ) {
        const movement = resolveTriggeredMove(game, workingRace, nextPlayers, scoocher.id, 1, false);
        workingRace = movement.race;
        nextPlayers = movement.players;
        logs.push(...movement.logs);
        logs.push({
          type: "ability_trigger",
          message: `${describeEntrant(game, scoocher)} 在其他选手使用能力后移动 1 格。`,
        });
      }
    }
  }

  return { race: workingRace, players: nextPlayers, logs };
}

export function describeEntrant(game: GameState, entrant: Entrant): string {
  const player = game.players.find((candidate) => candidate.id === entrant.playerId);
  const athlete = STANDARD_ATHLETE_BY_ID.get(entrant.athleteId);

  return `${player?.name ?? entrant.playerId}的${athlete?.displayName ?? athlete?.standardName ?? entrant.athleteId}`;
}

export function getEffectiveImplementationKey(
  _game: GameState,
  race: RaceState,
  entrant: Entrant,
): AbilityImplementationKey {
  if (entrant.copiedAbilityKey) {
    return entrant.copiedAbilityKey;
  }

  const baseKey = getBaseImplementationKey(entrant);

  if (baseKey !== "copy_lead_racer_power") {
    return baseKey;
  }

  const leaders = findOtherLeaders(race, entrant);
  const leader = leaders.length === 1
    ? leaders[0]
    : leaders.find((candidate) => candidate.id === entrant.copiedLeaderEntrantId);

  if (!leader) {
    return baseKey;
  }

  const copiedKey = getBaseImplementationKey(leader);

  if (copiedKey === "draft_temp_power_before_race" || copiedKey === "copy_previous_winner_before_race") {
    return baseKey;
  }

  return copiedKey;
}

function applyBeforeMainMove(
  game: GameState,
  race: RaceState,
  entrant: Entrant,
  players: Player[],
  choice: MainMoveChoice,
): { race: RaceState; players: Player[]; logs: AbilityLog[] } {
  const key = getEffectiveImplementationKey(game, race, entrant);
  const logs: AbilityLog[] = [];
  let workingRace = race;
  let nextPlayers = players;
  const name = describeEntrant(game, entrant);

  if (key === "cheer_last_place_then_self" && (choice.useCheerleader ?? true)) {
    const last = findAloneLast(workingRace);

    if (last) {
      const lastBefore = last;
      workingRace = moveEntrantInRace(game, workingRace, last.id, 2);
      const lastAfter = workingRace.entrants.find((candidate) => candidate.id === last.id) ?? last;
      const cheerleaderBefore = workingRace.entrants.find((candidate) => candidate.id === entrant.id) ?? entrant;
      workingRace = moveEntrantInRace(game, workingRace, entrant.id, 1);
      const cheerleaderAfter = workingRace.entrants.find((candidate) => candidate.id === entrant.id) ?? entrant;
      workingRace = applyBananaPassTraps(game, workingRace, lastBefore, lastAfter, logs);
      workingRace = applyBananaPassTraps(game, workingRace, cheerleaderBefore, cheerleaderAfter, logs);
      logs.push({
        type: "ability_trigger",
        message: `${name} 使用啦啦队长，让${describeEntrant(game, last)}前进 2 格，自己再移动 1 格。`,
      });
    }
  }

  if (key === "gain_point_if_alone_last_before_main" && findAloneLast(workingRace)?.id === entrant.id) {
    nextPlayers = addScore(nextPlayers, entrant.playerId, 1);
    logs.push({
      type: "score_awarded",
      message: `${name} 使用可爱输家，独自在最后一名时获得 1 分。`,
    });
  }

  if (key === "warp_racer_to_self_before_main" && choice.useHypnotist === true) {
    const target = findEntrantById(workingRace, choice.hypnotistTargetEntrantId) ?? findLeaderOther(workingRace, entrant);

    if (target && target.id !== entrant.id && !target.finished && !target.eliminated) {
      workingRace = updateEntrant(workingRace, target.id, (current) => ({
        ...current,
        position: entrant.position,
      }));
      logs.push({
        type: "position_swap",
        message: `${name} 使用催眠师，将${describeEntrant(game, target)}传送到 ${entrant.position}。`,
      });
      workingRace = triggerScoocherOnOtherPower(game, workingRace, entrant.id, logs);
    }
  }

  if (key === "warp_to_exactly_two_before_main" && choice.useThirdWheel === true) {
    const eligibleSpaces = findSpacesWithExactOthers(workingRace, entrant.id, 2);
    const targetSpace =
      (choice.thirdWheelTargetPosition !== undefined && eligibleSpaces.includes(choice.thirdWheelTargetPosition)
        ? choice.thirdWheelTargetPosition
        : eligibleSpaces[0]) ?? null;

    if (targetSpace !== null) {
      workingRace = updateEntrant(workingRace, entrant.id, (current) => ({
        ...current,
        position: targetSpace,
      }));
      logs.push({
        type: "position_swap",
        message: `${name} 使用第三者，传送到有两名其他选手的格子 ${targetSpace}。`,
      });
      workingRace = triggerScoocherOnOtherPower(game, workingRace, entrant.id, logs);
    }
  }

  if (key === "pull_all_then_bonus_per_guest" && choice.usePartyAnimal === true) {
    const party = workingRace.entrants.find((candidate) => candidate.id === entrant.id) ?? entrant;

    for (const candidate of [...workingRace.entrants]) {
      if (candidate.id === entrant.id || candidate.finished || candidate.eliminated || candidate.position === party.position) {
        continue;
      }

      const targetPosition = candidate.position < party.position ? candidate.position + 1 : Math.max(0, candidate.position - 1);
      workingRace = moveEntrantToPositionInRace(game, workingRace, candidate.id, targetPosition);
    }
    logs.push({
      type: "ability_trigger",
      message: `${name} 使用派对动物，让其他所有选手朝自己移动 1 格。`,
    });
  }

  workingRace = queueCopycatSelectionReactions(game, workingRace);
  return { race: workingRace, players: nextPlayers, logs };
}

function applyRollReactions(
  game: GameState,
  race: RaceState,
  entrant: Entrant,
  dieRoll: number,
  initialPlayers: Player[],
): { race: RaceState; players: Player[]; logs: AbilityLog[]; skipMover: boolean; nextTurnPlayerId: string | null } {
  const logs: AbilityLog[] = [];
  let workingRace = race;
  let players = initialPlayers;
  let skipMover = false;
  let nextTurnPlayerId: string | null = null;

  if (dieRoll === 1) {
    const inchworm = findOtherByKey(game, workingRace, entrant, "skip_others_one_roll_move_self");

    if (inchworm) {
      const movement = resolveTriggeredMove(game, workingRace, players, inchworm.id, 1);
      workingRace = movement.race;
      players = movement.players;
      logs.push(...movement.logs);
      skipMover = true;
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, inchworm)} 拦截点数 1，自己移动 1 格，并跳过${describeEntrant(game, entrant)}的移动。`,
      });
    }

    const skipper = findOtherByKey(game, workingRace, entrant, "take_next_turn_on_roll_one");

    if (skipper) {
      nextTurnPlayerId = skipper.id;
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, skipper)} 看到点数 1，将接手下一个回合。`,
      });
    }
  }

  if (dieRoll === 6) {
    const lackey = findOtherByKey(game, workingRace, entrant, "move_two_before_other_six");

    if (lackey) {
      const movement = resolveTriggeredMove(game, workingRace, players, lackey.id, 2);
      workingRace = movement.race;
      players = movement.players;
      logs.push(...movement.logs);
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, lackey)} 看到点数 6，在${describeEntrant(game, entrant)}移动前先移动 2 格。`,
      });
    }
  }

  return { race: workingRace, players, logs, skipMover, nextTurnPlayerId };
}

function applyMainMoveModifiers(
  game: GameState,
  race: RaceState,
  entrant: Entrant,
  key: AbilityImplementationKey,
  initialMove: number,
  logs: AbilityLog[],
): number {
  let moveValue = initialMove;

  if (key === "hare_fast_unless_alone_lead") {
    moveValue += 2;
    logs.push({
      type: "ability_trigger",
      message: `${describeEntrant(game, entrant)} 使用野兔，主移动 +2，当前为 ${moveValue}。`,
    });
  }

  if (key === "corner_based_main_move_modifier") {
    const secondCorner = Math.min(BLIMP_SECOND_CORNER_SPACE, race.trackLength);
    const modifier = entrant.position < secondCorner ? 3 : -1;
    moveValue += modifier;
    logs.push({
      type: "ability_trigger",
      message: `${describeEntrant(game, entrant)} 使用飞艇，主移动 ${modifier > 0 ? "+3" : "-1"}，当前为 ${Math.max(0, moveValue)}。`,
    });
  }

  if (key === "pull_all_then_bonus_per_guest") {
    const guests = countOthersAt(race, entrant.id, entrant.position);
    if (guests > 0) {
      moveValue += guests;
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, entrant)} 因派对来客获得 +${guests}，当前为 ${moveValue}。`,
      });
    }
  }

  const coach = findSharedCoach(race, entrant);

  if (coach) {
    moveValue += 1;
    logs.push({
      type: "ability_trigger",
      message: `${describeEntrant(game, coach)} 指导${describeEntrant(game, entrant)}，主移动 +1，当前为 ${moveValue}。`,
    });
  }

  const gunk = findOtherByKey(game, race, entrant, "others_main_move_minus_one");

  if (gunk) {
    const nextMoveValue = Math.max(0, moveValue - 1);
    moveValue -= 1;
    logs.push({
      type: "ability_trigger",
      message: `${describeEntrant(game, gunk)} 触发黏液，${describeEntrant(game, entrant)}的主移动从 ${Math.max(0, moveValue + 1)} 减为 ${nextMoveValue}，只能移动 ${nextMoveValue} 格。`,
    });
  }

  return Math.max(0, moveValue);
}

function applyBananaPassTraps(
  game: GameState,
  race: RaceState,
  moverBefore: Entrant,
  moverAfter: Entrant,
  logs: AbilityLog[],
): RaceState {
  const passedSpaces = getPassedSpaces(moverBefore.position, moverAfter.position);
  const movedOutFromSharedStart = moverAfter.position > moverBefore.position;
  let workingRace = race;

  for (const banana of race.entrants) {
    if (
      banana.id !== moverAfter.id &&
      !banana.finished &&
      !banana.eliminated &&
      getEffectiveImplementationKey(game, race, banana) === "trip_passing_racer" &&
      (passedSpaces.includes(banana.position) || (banana.position === moverBefore.position && movedOutFromSharedStart))
    ) {
      workingRace = updateEntrant(workingRace, moverAfter.id, (current) => ({
        ...current,
        skippedTurns: current.skippedTurns + 1,
      }));
      logs.push({
        type: "status_added",
        message: `${describeEntrant(game, banana)} 在经过判定中绊倒了${describeEntrant(game, moverAfter)}。`,
      });
    }
  }

  return workingRace;
}

export function triggerScoocherOnOtherPower(
  game: GameState,
  race: RaceState,
  sourceEntrantId: string,
  logs: AbilityLog[],
): RaceState {
  let workingRace = race;

  for (const scoocher of workingRace.entrants) {
    if (
      scoocher.id === sourceEntrantId ||
      scoocher.finished ||
      scoocher.eliminated ||
      getEffectiveImplementationKey(game, workingRace, scoocher) !== "move_one_on_other_power"
    ) {
      continue;
    }

    const movement = resolveTriggeredMove(game, workingRace, game.players, scoocher.id, 1, false);
    workingRace = movement.race;
    logs.push(...movement.logs);
    logs.push({
      type: "movement",
      message: `${describeEntrant(game, scoocher)} 在其他选手使用能力后移动 1 格。`,
    });
  }

  return workingRace;
}

function resolveTriggeredMove(
  game: GameState,
  race: RaceState,
  players: Player[],
  entrantId: string,
  spaces: number,
  abilityTriggered = true,
): { race: RaceState; players: Player[]; logs: AbilityLog[] } {
  const moverBefore = findEntrantById(race, entrantId);

  if (!moverBefore) {
    return { race, players, logs: [] };
  }

  const moveResult = moveEntrantForward(moverBefore, spaces, race.trackLength);
  const movedRace = moveEntrantInRace(game, race, entrantId, spaces);
  const moverAfter = findEntrantById(movedRace, entrantId);

  if (!moverAfter) {
    return { race: movedRace, players, logs: [] };
  }

  return resolveAfterMove({
    game: { ...game, players, activeRace: movedRace },
    race: movedRace,
    players,
    moverBefore,
    moverAfter,
    path: moveResult.path,
    abilityTriggered,
  });
}

function buildResolution(options: Partial<MainMoveResolution> & Pick<MainMoveResolution, "dieRoll" | "finalMove" | "entrant" | "race" | "players" | "logs" | "turnStartPosition">): MainMoveResolution {
  return {
    usesLeaptoadMove: false,
    preventsOverFinish: false,
    extraTurnPlayerId: null,
    nextTurnPlayerId: null,
    ...options,
  };
}

function getBaseImplementationKey(entrant: Entrant): AbilityImplementationKey {
  const athlete = STANDARD_ATHLETE_BY_ID.get(entrant.athleteId);

  if (!athlete) {
    throw new Error(`Unknown athlete: ${entrant.athleteId}`);
  }

  return athlete.implementationKey;
}

function findSharedCoach(race: RaceState, entrant: Entrant): Entrant | null {
  return findByKeyAt(race, "same_space_main_move_plus_one", entrant.position);
}

function findOtherByKey(
  game: GameState,
  race: RaceState,
  entrant: Entrant,
  key: AbilityImplementationKey,
): Entrant | null {
  return (
    race.entrants.find(
      (candidate) =>
        candidate.id !== entrant.id &&
        !candidate.finished &&
        !candidate.eliminated &&
        getEffectiveImplementationKey(game, race, candidate) === key,
    ) ?? null
  );
}

function hasOtherKey(game: GameState, race: RaceState, entrant: Entrant, key: AbilityImplementationKey): boolean {
  return findOtherByKey(game, race, entrant, key) !== null;
}

function findByKeyAt(race: RaceState, key: AbilityImplementationKey, position: number): Entrant | null {
  return (
    race.entrants.find(
      (candidate) =>
        !candidate.finished &&
        !candidate.eliminated &&
        candidate.position === position &&
        getBaseImplementationKey(candidate) === key,
    ) ?? null
  );
}

function isAloneInLead(race: RaceState, entrant: Entrant): boolean {
  const activeEntrants = activeEntrantsOnly(race);
  const leadPosition = Math.max(...activeEntrants.map((candidate) => candidate.position));
  const leaders = activeEntrants.filter((candidate) => candidate.position === leadPosition);

  return entrant.position === leadPosition && leaders.length === 1;
}

function findOtherLeaders(race: RaceState, except: Entrant): Entrant[] {
  const activeEntrants = activeEntrantsOnly(race);
  if (activeEntrants.length === 0) {
    return [];
  }
  const leadPosition = Math.max(...activeEntrants.map((candidate) => candidate.position));
  return activeEntrants.filter((candidate) => candidate.id !== except.id && candidate.position === leadPosition);
}

function findLeaderOther(race: RaceState, entrant: Entrant): Entrant | null {
  return [...activeEntrantsOnly(race)]
    .filter((candidate) => candidate.id !== entrant.id)
    .sort((first, second) => second.position - first.position)[0] ?? null;
}

function findAloneLast(race: RaceState): Entrant | null {
  const activeEntrants = activeEntrantsOnly(race);
  const lastPosition = Math.min(...activeEntrants.map((candidate) => candidate.position));
  const last = activeEntrants.filter((candidate) => candidate.position === lastPosition);

  return last.length === 1 ? last[0] : null;
}

function findSpacesWithExactOthers(race: RaceState, entrantId: string, count: number): number[] {
  const spaces = new Map<number, number>();

  for (const entrant of activeEntrantsOnly(race)) {
    if (entrant.id !== entrantId) {
      spaces.set(entrant.position, (spaces.get(entrant.position) ?? 0) + 1);
    }
  }

  return [...spaces.entries()]
    .filter(([, spaceCount]) => spaceCount === count)
    .map(([position]) => position)
    .sort((first, second) => first - second);
}

function findEntrantById(race: RaceState, entrantId: string | undefined): Entrant | null {
  return entrantId ? race.entrants.find((entrant) => entrant.id === entrantId) ?? null : null;
}

function hasPendingFollowReaction(race: RaceState, sourceEntrantId: string, targetEntrantId: string): boolean {
  return race.pendingReactions.some(
    (prompt) => prompt.sourceEntrantId === sourceEntrantId && prompt.targetEntrantId === targetEntrantId,
  );
}

function hasPendingDuelReaction(race: RaceState, duelistEntrantId: string): boolean {
  return race.pendingReactions.some(
    (prompt) => prompt.promptType === "duel" && prompt.sourceEntrantId === duelistEntrantId,
  );
}

export function queueCopycatSelectionReactions(game: GameState, race: RaceState): RaceState {
  let entrants = race.entrants;
  let pendingReactions = race.pendingReactions;

  for (const copycat of race.entrants) {
    if (getBaseImplementationKey(copycat) !== "copy_lead_racer_power" || copycat.finished || copycat.eliminated) {
      continue;
    }

    const leaders = findOtherLeaders({ ...race, entrants }, copycat);
    const signature = leaders.map((entrant) => entrant.id).sort().join(":");
    const current = entrants.find((entrant) => entrant.id === copycat.id) ?? copycat;
    const leadChanged = current.copyLeadSignature !== signature;

    if (leadChanged) {
      entrants = entrants.map((entrant) =>
        entrant.id === copycat.id
          ? { ...entrant, copyLeadSignature: signature, copiedLeaderEntrantId: leaders.length === 1 ? leaders[0]?.id : undefined, copyLeadDeclinedSignature: undefined }
          : entrant,
      );
    }

    const updatedCopycat = entrants.find((entrant) => entrant.id === copycat.id) ?? copycat;
    if (
      leaders.length > 1 &&
      !updatedCopycat.copiedLeaderEntrantId &&
      updatedCopycat.copyLeadDeclinedSignature !== signature &&
      !pendingReactions.some((prompt) => prompt.promptType === "copy" && prompt.sourceEntrantId === copycat.id)
    ) {
      pendingReactions = [
        ...pendingReactions,
        {
          id: `copycat:${copycat.id}:${signature}:${race.round}`,
          playerId: copycat.playerId,
          athleteId: copycat.athleteId,
          promptType: "copy",
          sourceEntrantId: copycat.id,
          title: "模仿猫：选择领先者能力",
          description: `${describeEntrant(game, copycat)} 面对并列第一，请选择本次要复制的领先者能力。`,
        },
      ];
    }
  }

  return entrants === race.entrants && pendingReactions === race.pendingReactions ? race : { ...race, entrants, pendingReactions };
}

function countOthersAt(race: RaceState, entrantId: string, position: number): number {
  return race.entrants.filter(
    (entrant) =>
      entrant.id !== entrantId &&
      !entrant.finished &&
      !entrant.eliminated &&
      entrant.position === position,
  ).length;
}

function activeEntrantsOnly(race: RaceState): Entrant[] {
  return race.entrants.filter((entrant) => !entrant.finished && !entrant.eliminated);
}

function updateEntrant(race: RaceState, entrantId: string, update: (entrant: Entrant) => Entrant): RaceState {
  return {
    ...race,
    entrants: race.entrants.map((entrant) => (entrant.id === entrantId ? update(entrant) : entrant)),
  };
}

function replaceEntrant(race: RaceState, entrant: Entrant): RaceState {
  return updateEntrant(race, entrant.id, () => entrant);
}

export function moveEntrantInRace(game: GameState, race: RaceState, entrantId: string, spaces: number): RaceState {
  const entrant = findEntrantById(race, entrantId);
  if (!entrant) {
    return race;
  }

  const moved = moveEntrantForward(entrant, spaces, race.trackLength);
  return queueSuckerfishFollowReactions(game, replaceEntrant(race, moved.entrant), entrant, moved.entrant, moved.path);
}

function moveEntrantToPositionInRace(game: GameState, race: RaceState, entrantId: string, position: number): RaceState {
  const entrant = findEntrantById(race, entrantId);
  if (!entrant || entrant.position === position) {
    return race;
  }

  const moved = { ...entrant, position };
  return queueSuckerfishFollowReactions(game, replaceEntrant(race, moved), entrant, moved, [position]);
}

function queueSuckerfishFollowReactions(
  game: GameState,
  race: RaceState,
  moverBefore: Entrant,
  moverAfter: Entrant,
  path: number[],
): RaceState {
  if (path.length === 0) {
    return race;
  }

  const pendingReactions = [...race.pendingReactions];
  for (const entrant of race.entrants) {
    if (
      entrant.id === moverAfter.id ||
      entrant.finished ||
      entrant.eliminated ||
      entrant.position !== moverBefore.position ||
      getEffectiveImplementationKey(game, race, entrant) !== "follow_same_space_mover" ||
      hasPendingFollowReaction(race, entrant.id, moverAfter.id)
    ) {
      continue;
    }

    pendingReactions.push({
      id: `follow:${entrant.id}:${moverAfter.id}:${race.round}:${race.finishers.length}:${pendingReactions.length}`,
      playerId: entrant.playerId,
      athleteId: entrant.athleteId,
      promptType: "optionalPower",
      sourceEntrantId: entrant.id,
      targetEntrantId: moverAfter.id,
      title: "吸盘鱼跟随",
      description: `${describeEntrant(game, entrant)} 可以跟随${describeEntrant(game, moverAfter)}移动到 ${moverAfter.position}。`,
    });
  }

  return pendingReactions.length === race.pendingReactions.length ? race : { ...race, pendingReactions };
}

function swapEntrants(race: RaceState, firstEntrantId: string, secondEntrantId: string): RaceState {
  const first = race.entrants.find((entrant) => entrant.id === firstEntrantId);
  const second = race.entrants.find((entrant) => entrant.id === secondEntrantId);

  if (!first || !second) {
    return race;
  }

  return {
    ...race,
    entrants: race.entrants.map((entrant) => {
      if (entrant.id === firstEntrantId) {
        return { ...entrant, position: second.position };
      }

      if (entrant.id === secondEntrantId) {
        return { ...entrant, position: first.position };
      }

      return entrant;
    }),
  };
}

function addScore(players: Player[], playerId: string, points: number): Player[] {
  return players.map((player) =>
    player.id === playerId ? { ...player, score: Math.max(0, player.score + points) } : player,
  );
}

function emptyRace(game: GameState): RaceState {
  return {
    id: "ability-preview",
    raceNumber: game.raceIndex + 1,
    trackLength: game.settings.trackLength,
    firstPlacePoints: 0,
    secondPlacePoints: 0,
    turnOrder: game.players.map((player) => player.id),
    currentTurnIndex: 0,
    entrants: [],
    finishers: [],
    round: 1,
    previousFinalMoveValue: null,
    pendingReactions: [],
    pendingTurnState: null,
    status: "active",
  };
}
