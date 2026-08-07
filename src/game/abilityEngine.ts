import { STANDARD_ATHLETE_BY_ID, STANDARD_ATHLETES } from "./athletes";
import {
  shouldAutoRerollDicemonger,
  shouldAutoRerollMagician,
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

export function applyBeforeRaceAbilities({ game, entrants }: ApplyBeforeRaceOptions): {
  entrants: Entrant[];
  players: Player[];
  logs: AbilityLog[];
} {
  const logs: AbilityLog[] = [];
  let nextEntrants = entrants;
  let players = game.players;
  const raceAthleteIds = new Set(entrants.map((entrant) => entrant.athleteId));

  nextEntrants = nextEntrants.map((entrant) => {
    const key = getBaseImplementationKey(entrant);
    const name = describeEntrant(game, entrant);

    if (key === "draft_temp_power_before_race") {
      const copied = STANDARD_ATHLETES.find(
        (athlete) => athlete.id !== entrant.athleteId && !raceAthleteIds.has(athlete.id),
      );

      if (copied) {
        logs.push({
          type: "ability_trigger",
          message: `${name} 使用蛋，在本场复制了${copied.displayName}的能力。`,
        });
        return { ...entrant, copiedAbilityKey: copied.implementationKey };
      }
    }

    if (key === "copy_previous_winner_before_race") {
      const previousWinner = game.races
        .slice(0, game.raceIndex)
        .flatMap((race) => race.finishers)
        .find((finisher) => finisher.rank === 1);
      const copied = previousWinner ? STANDARD_ATHLETE_BY_ID.get(previousWinner.athleteId) : null;

      if (copied) {
        logs.push({
          type: "ability_trigger",
          message: `${name} 使用双子，复制了上一场冠军${copied.displayName}的能力。`,
        });
        return { ...entrant, copiedAbilityKey: copied.implementationKey };
      }
    }

    if (key === "predict_winner_finish_second") {
      const predicted = entrants.reduce((leader, candidate) =>
        candidate.playerId < leader.playerId ? candidate : leader,
      );

      logs.push({
        type: "ability_trigger",
        message: `${name} 使用预言家，预测${describeEntrant(game, predicted)}会夺冠。`,
      });
      return { ...entrant, predictedWinnerPlayerId: predicted.playerId };
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
          type: "ability_trigger",
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

  if (key === "warp_swap_instead_main_move" && (choice.useFlipFlopSwap ?? true) && shouldAutoUseFlipFlop(workingRace, workingEntrant)) {
    const target = findLeaderOther(workingRace, workingEntrant);

    if (target) {
      workingRace = swapEntrants(workingRace, workingEntrant.id, target.id);
      workingEntrant =
        workingRace.entrants.find((candidate) => candidate.id === entrant.id) ?? workingEntrant;
      logs.push({
        type: "position_swap",
        message: `${racerName} 使用翻转者，与${describeEntrant(game, target)}交换位置。`,
      });
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
    dieRoll = rng.rollDie(6);

    const rollReaction = applyRollReactions(game, workingRace, workingEntrant, dieRoll);
    workingRace = rollReaction.race;
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

    if (key === "reroll_main_move_up_to_two") {
      const rolls = [dieRoll];

      const maxRerolls = choice.magicianMaxRerolls ?? 2;

      while (rolls.length - 1 < maxRerolls && shouldAutoRerollMagician(rolls[rolls.length - 1], rolls.length - 1)) {
        rolls.push(rng.rollDie(6));
      }

      dieRoll = rolls[rolls.length - 1];

      if (rolls.length > 1) {
        logs.push({
          type: "ability_trigger",
          message: `${racerName} 使用魔术师重掷 ${rolls.length - 1} 次：${rolls.join(" -> ")}，最终点数 ${dieRoll}。`,
        });
      }
    }

    const dicemonger = findOtherByKey(game, workingRace, workingEntrant, "grant_reroll_move_on_use");

    if (dieRoll !== null && dicemonger && shouldAutoRerollDicemonger(dieRoll)) {
      const firstRoll = dieRoll;
      dieRoll = rng.rollDie(6);
      workingRace = moveEntrantInRace(workingRace, dicemonger.id, 1);
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, dicemonger)} 发动骰商，让点数 ${firstRoll} 重掷为 ${dieRoll}，随后自己移动 1 格。`,
      });
    }

    moveValue = dieRoll;

    if (key === "main_roll_low_becomes_four" && dieRoll <= 2) {
      moveValue = 4;
      logs.push({
        type: "ability_trigger",
        message: `${racerName} 使用炼金术士，将掷骰 ${dieRoll} 改为主移动 4。`,
      });
    }

    if (key === "points_then_six_warp_start" && dieRoll === 6) {
      nextEntrant = { ...nextEntrant, position: 0 };
      players = addScore(players, nextEntrant.playerId, -1);
      logs.push({
        type: "ability_trigger",
        message: `${racerName} 使用西西弗斯，掷出 6 后回到起点并先失去 1 分。`,
      });
    }

    if (key === "optional_double_roll_then_trip" && (choice.useRocketScientistDouble ?? true) && shouldAutoUseRocketScientist(moveValue)) {
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

    if (key === "predict_roll_extra_turn" && dieRoll === 4) {
      extraTurnPlayerId = entrant.id;
      logs.push({
        type: "ability_trigger",
        message: `${racerName} 使用天才并猜中 4，获得一个额外回合。`,
      });
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
  }

  for (const entrant of workingRace.entrants) {
    if (entrant.id === moverAfter.id || entrant.finished || entrant.eliminated) {
      continue;
    }

    const key = getEffectiveImplementationKey(game, workingRace, entrant);

    if (key === "trip_passing_racer" && passedSpaces.includes(entrant.position)) {
      workingRace = updateEntrant(workingRace, moverAfter.id, (current) => ({
        ...current,
        skippedTurns: current.skippedTurns + 1,
      }));
      logs.push({
        type: "status_added",
        message: `${describeEntrant(game, entrant)} 在被经过时绊倒了${describeEntrant(game, moverAfter)}。`,
      });
    }

    if (key === "follow_same_space_mover" && entrant.position === moverBefore.position && path.length > 0) {
      workingRace = updateEntrant(workingRace, entrant.id, (current) => ({
        ...current,
        position: moverAfter.position,
      }));
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, entrant)} 跟随${describeEntrant(game, moverAfter)}移动到 ${moverAfter.position}。`,
      });
    }
  }

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
        logs.push({
          type: "movement",
          message: `${describeEntrant(game, moverAfter)} 经过${describeEntrant(game, entrant)}，将其推回到 ${moved.position}。`,
        });
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
    }

    if (moverKey === "duel_on_shared_space") {
      const opponent = shared[0];
      workingRace = updateEntrant(workingRace, opponent.id, (current) => ({
        ...current,
        skippedTurns: current.skippedTurns + 1,
      }));
      workingRace = moveEntrantInRace(workingRace, moverAfter.id, 2);
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, moverCurrent)} 赢得自动决斗，移动 2 格，并绊倒${describeEntrant(game, opponent)}。`,
      });
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
    }
  }

  for (const romantic of workingRace.entrants) {
    if (
      getEffectiveImplementationKey(game, workingRace, romantic) === "move_two_on_pair_stop" &&
      !romantic.finished &&
      !romantic.eliminated &&
      countOthersAt(workingRace, moverAfter.id, moverAfter.position) === 1
    ) {
      workingRace = moveEntrantInRace(workingRace, romantic.id, 2);
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, romantic)} 看到一对选手同格，移动 2 格。`,
      });
    }
  }

  for (const heckler of workingRace.entrants) {
    if (
      getEffectiveImplementationKey(game, workingRace, heckler) === "move_when_turn_ends_near_start" &&
      heckler.id !== moverAfter.id &&
      Math.abs(moverAfter.position - moverBefore.position) <= 1
    ) {
      workingRace = moveEntrantInRace(workingRace, heckler.id, 2);
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, heckler)} 嘲讽短移动回合，移动 2 格。`,
      });
    }
  }

  if (abilityTriggered) {
    for (const scoocher of workingRace.entrants) {
      if (
        getEffectiveImplementationKey(game, workingRace, scoocher) === "move_one_on_other_power" &&
        scoocher.id !== moverAfter.id &&
        !scoocher.finished &&
        !scoocher.eliminated
      ) {
        workingRace = moveEntrantInRace(workingRace, scoocher.id, 1);
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

  const leader = findUniqueLeader(race, entrant);

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

    if (last && last.id !== entrant.id) {
      workingRace = moveEntrantInRace(workingRace, last.id, 2);
      workingRace = moveEntrantInRace(workingRace, entrant.id, 1);
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

  if (key === "warp_racer_to_self_before_main" && (choice.useHypnotist ?? true)) {
    const target = findLeaderOther(workingRace, entrant);

    if (target) {
      workingRace = updateEntrant(workingRace, target.id, (current) => ({
        ...current,
        position: entrant.position,
      }));
      logs.push({
        type: "position_swap",
        message: `${name} 使用催眠师，将${describeEntrant(game, target)}传送到 ${entrant.position}。`,
      });
    }
  }

  if (key === "warp_to_exactly_two_before_main" && (choice.useThirdWheel ?? true)) {
    const targetSpace = findSpaceWithExactOthers(workingRace, entrant.id, 2);

    if (targetSpace !== null) {
      workingRace = updateEntrant(workingRace, entrant.id, (current) => ({
        ...current,
        position: targetSpace,
      }));
      logs.push({
        type: "position_swap",
        message: `${name} 使用第三者，传送到有两名其他选手的格子 ${targetSpace}。`,
      });
    }
  }

  if (key === "pull_all_then_bonus_per_guest") {
    const party = workingRace.entrants.find((candidate) => candidate.id === entrant.id) ?? entrant;

    workingRace = {
      ...workingRace,
      entrants: workingRace.entrants.map((candidate) => {
        if (candidate.id === entrant.id || candidate.finished || candidate.eliminated) {
          return candidate;
        }

        return {
          ...candidate,
          position:
            candidate.position < party.position
              ? candidate.position + 1
              : Math.max(0, candidate.position - 1),
        };
      }),
    };
    logs.push({
      type: "ability_trigger",
      message: `${name} 使用派对动物，让其他所有选手朝自己移动 1 格。`,
    });
  }

  return { race: workingRace, players: nextPlayers, logs };
}

function applyRollReactions(
  game: GameState,
  race: RaceState,
  entrant: Entrant,
  dieRoll: number,
): { race: RaceState; logs: AbilityLog[]; skipMover: boolean; nextTurnPlayerId: string | null } {
  const logs: AbilityLog[] = [];
  let workingRace = race;
  let skipMover = false;
  let nextTurnPlayerId: string | null = null;

  if (dieRoll === 1) {
    const inchworm = findOtherByKey(game, workingRace, entrant, "skip_others_one_roll_move_self");

    if (inchworm) {
      workingRace = moveEntrantInRace(workingRace, inchworm.id, 1);
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
      workingRace = moveEntrantInRace(workingRace, lackey.id, 2);
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, lackey)} 看到点数 6，在${describeEntrant(game, entrant)}移动前先移动 2 格。`,
      });
    }
  }

  return { race: workingRace, logs, skipMover, nextTurnPlayerId };
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
    const secondCorner = Math.floor(race.trackLength * 0.66);
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
    moveValue -= 1;
    logs.push({
      type: "ability_trigger",
      message: `${describeEntrant(game, gunk)} 拖慢${describeEntrant(game, entrant)}，主移动 -1，当前为 ${Math.max(0, moveValue)}。`,
    });
  }

  return Math.max(0, moveValue);
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

function findUniqueLeader(race: RaceState, except: Entrant): Entrant | null {
  const activeEntrants = activeEntrantsOnly(race).filter((candidate) => candidate.id !== except.id);
  const leadPosition = Math.max(...activeEntrants.map((candidate) => candidate.position));
  const leaders = activeEntrants.filter((candidate) => candidate.position === leadPosition);

  return leaders.length === 1 ? leaders[0] : null;
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

function findSpaceWithExactOthers(race: RaceState, entrantId: string, count: number): number | null {
  const spaces = new Map<number, number>();

  for (const entrant of activeEntrantsOnly(race)) {
    if (entrant.id !== entrantId) {
      spaces.set(entrant.position, (spaces.get(entrant.position) ?? 0) + 1);
    }
  }

  return [...spaces.entries()].find(([, spaceCount]) => spaceCount === count)?.[0] ?? null;
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

function moveEntrantInRace(race: RaceState, entrantId: string, spaces: number): RaceState {
  return updateEntrant(race, entrantId, (entrant) => moveEntrantForward(entrant, spaces, race.trackLength).entrant);
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
    status: "active",
  };
}
