import { STANDARD_ATHLETE_BY_ID, STANDARD_ATHLETES } from "./athletes";
import {
  shouldAutoRerollDicemonger,
  shouldAutoRerollMagician,
  shouldAutoUseFlipFlop,
  shouldAutoUseRocketScientist,
} from "./abilityImplementations";
import { getPassedSpaces, moveEntrantBackward, moveEntrantForward } from "./movement";
import type { AbilityImplementationKey } from "./abilityTypes";
import type { GameLogEntry, GameState, Entrant, Player, RaceState } from "./types";
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
          message: `${name} used Egg and copied ${copied.standardName}'s ability for this race.`,
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
          message: `${name} used Twin and copied previous winner ${copied.standardName}'s ability.`,
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
        message: `${name} used Mastermind and predicted ${describeEntrant(game, predicted)} as winner.`,
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
        message: `${describeEntrant(game, entrant)} used Sisyphus and gained 4 points before the race.`,
      });
    }
  }

  return { entrants: nextEntrants, players, logs };
}

export function resolveMainMove({ game, race, entrant, rng }: ResolveMainMoveOptions): MainMoveResolution {
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
          message: `${racerName} recovered from trip and skipped this main move.`,
        },
      ],
      usesLeaptoadMove: false,
      preventsOverFinish: false,
      extraTurnPlayerId: null,
      nextTurnPlayerId: null,
      turnStartPosition,
    };
  }

  const beforeMain = applyBeforeMainMove(game, workingRace, workingEntrant, players);
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
          message: `${racerName} was alone in the lead, so Hare skipped the main move.`,
        },
      ],
      usesLeaptoadMove: false,
      preventsOverFinish: false,
      extraTurnPlayerId,
      nextTurnPlayerId,
      turnStartPosition,
    };
  }

  if (key === "warp_swap_instead_main_move" && shouldAutoUseFlipFlop(workingRace, workingEntrant)) {
    const target = findLeaderOther(workingRace, workingEntrant);

    if (target) {
      workingRace = swapEntrants(workingRace, workingEntrant.id, target.id);
      workingEntrant =
        workingRace.entrants.find((candidate) => candidate.id === entrant.id) ?? workingEntrant;
      logs.push({
        type: "position_swap",
        message: `${racerName} used Flip Flop to swap positions with ${describeEntrant(game, target)}.`,
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

  if (key === "main_move_fixed_five_optional") {
    moveValue = 5;
    logs.push({
      type: "ability_trigger",
      message: `${racerName} used Legs to skip rolling and set the main move to 5.`,
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

      while (shouldAutoRerollMagician(rolls[rolls.length - 1], rolls.length - 1)) {
        rolls.push(rng.rollDie(6));
      }

      dieRoll = rolls[rolls.length - 1];

      if (rolls.length > 1) {
        logs.push({
          type: "ability_trigger",
          message: `${racerName} used Magician to reroll ${rolls.length - 1} time(s): ${rolls.join(" -> ")}; final roll ${dieRoll}.`,
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
        message: `${describeEntrant(game, dicemonger)} granted a reroll: ${firstRoll} -> ${dieRoll}, then moved 1.`,
      });
    }

    moveValue = dieRoll;

    if (key === "main_roll_low_becomes_four" && dieRoll <= 2) {
      moveValue = 4;
      logs.push({
        type: "ability_trigger",
        message: `${racerName} used Alchemist: roll ${dieRoll} became main move 4.`,
      });
    }

    if (key === "points_then_six_warp_start" && dieRoll === 6) {
      nextEntrant = { ...nextEntrant, position: 0 };
      players = addScore(players, nextEntrant.playerId, -1);
      logs.push({
        type: "ability_trigger",
        message: `${racerName} used Sisyphus: roll 6 warped to Start and lost 1 point before moving.`,
      });
    }

    if (key === "optional_double_roll_then_trip" && shouldAutoUseRocketScientist(moveValue)) {
      moveValue *= 2;
      nextEntrant = {
        ...nextEntrant,
        skippedTurns: nextEntrant.skippedTurns + 1,
      };
      logs.push({
        type: "ability_trigger",
        message: `${racerName} used Rocket Scientist to double the main move to ${moveValue}.`,
      });
      logs.push({
        type: "status_added",
        message: `${racerName} tripped and will skip the next main move.`,
      });
    }

    if (key === "predict_roll_extra_turn" && dieRoll === 4) {
      extraTurnPlayerId = entrant.id;
      logs.push({
        type: "ability_trigger",
        message: `${racerName} used Genius and correctly predicted 4, earning another turn.`,
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
      message: `${describeEntrant(game, hugeBaby)} blocked the space and pushed ${describeEntrant(game, moverAfter)} to ${pushedPosition}.`,
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
        message: `${describeEntrant(game, entrant)} tripped ${describeEntrant(game, moverAfter)} while being passed.`,
      });
    }

    if (key === "follow_same_space_mover" && entrant.position === moverBefore.position && path.length > 0) {
      workingRace = updateEntrant(workingRace, entrant.id, (current) => ({
        ...current,
        position: moverAfter.position,
      }));
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, entrant)} followed ${describeEntrant(game, moverAfter)} to ${moverAfter.position}.`,
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
          message: `${describeEntrant(game, moverAfter)} passed ${describeEntrant(game, entrant)} and pushed them back to ${moved.position}.`,
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
          message: `${describeEntrant(game, entrant)} tripped ${describeEntrant(game, moverCurrent)} on shared stop.`,
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
        message: `${describeEntrant(game, moverCurrent)} tripped ${shared.map((entrant) => describeEntrant(game, entrant)).join(", ")} on shared stop.`,
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
        message: `${describeEntrant(game, moverCurrent)} won an automatic duel, moved 2, and tripped ${describeEntrant(game, opponent)}.`,
      });
    }

    if (moverKey === "eliminate_single_shared_racer" && shared.length === 1) {
      workingRace = updateEntrant(workingRace, shared[0].id, (current) => ({
        ...current,
        eliminated: true,
      }));
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, moverCurrent)} removed ${describeEntrant(game, shared[0])} from this race.`,
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
        message: `${describeEntrant(game, romantic)} saw a pair sharing space and moved 2.`,
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
        message: `${describeEntrant(game, heckler)} heckled a short turn and moved 2.`,
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
          message: `${describeEntrant(game, scoocher)} scooched 1 after another racer used a power.`,
        });
      }
    }
  }

  return { race: workingRace, players: nextPlayers, logs };
}

export function describeEntrant(game: GameState, entrant: Entrant): string {
  const player = game.players.find((candidate) => candidate.id === entrant.playerId);
  const athlete = STANDARD_ATHLETE_BY_ID.get(entrant.athleteId);

  return `${player?.name ?? entrant.playerId}'s ${athlete?.standardName ?? entrant.athleteId}`;
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
): { race: RaceState; players: Player[]; logs: AbilityLog[] } {
  const key = getEffectiveImplementationKey(game, race, entrant);
  const logs: AbilityLog[] = [];
  let workingRace = race;
  let nextPlayers = players;
  const name = describeEntrant(game, entrant);

  if (key === "cheer_last_place_then_self") {
    const last = findAloneLast(workingRace);

    if (last && last.id !== entrant.id) {
      workingRace = moveEntrantInRace(workingRace, last.id, 2);
      workingRace = moveEntrantInRace(workingRace, entrant.id, 1);
      logs.push({
        type: "ability_trigger",
        message: `${name} cheered ${describeEntrant(game, last)} forward 2, then moved 1.`,
      });
    }
  }

  if (key === "gain_point_if_alone_last_before_main" && findAloneLast(workingRace)?.id === entrant.id) {
    nextPlayers = addScore(nextPlayers, entrant.playerId, 1);
    logs.push({
      type: "score_awarded",
      message: `${name} used Lovable Loser and gained 1 point while alone in last place.`,
    });
  }

  if (key === "warp_racer_to_self_before_main") {
    const target = findLeaderOther(workingRace, entrant);

    if (target) {
      workingRace = updateEntrant(workingRace, target.id, (current) => ({
        ...current,
        position: entrant.position,
      }));
      logs.push({
        type: "position_swap",
        message: `${name} used Hypnotist to warp ${describeEntrant(game, target)} to ${entrant.position}.`,
      });
    }
  }

  if (key === "warp_to_exactly_two_before_main") {
    const targetSpace = findSpaceWithExactOthers(workingRace, entrant.id, 2);

    if (targetSpace !== null) {
      workingRace = updateEntrant(workingRace, entrant.id, (current) => ({
        ...current,
        position: targetSpace,
      }));
      logs.push({
        type: "position_swap",
        message: `${name} used Third Wheel to warp to a two-racer space at ${targetSpace}.`,
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
      message: `${name} used Party Animal to pull every other racer 1 space toward the party.`,
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
        message: `${describeEntrant(game, inchworm)} intercepted roll 1, moved 1, and skipped ${describeEntrant(game, entrant)}'s move.`,
      });
    }

    const skipper = findOtherByKey(game, workingRace, entrant, "take_next_turn_on_roll_one");

    if (skipper) {
      nextTurnPlayerId = skipper.id;
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, skipper)} saw roll 1 and will take the next turn.`,
      });
    }
  }

  if (dieRoll === 6) {
    const lackey = findOtherByKey(game, workingRace, entrant, "move_two_before_other_six");

    if (lackey) {
      workingRace = moveEntrantInRace(workingRace, lackey.id, 2);
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, lackey)} saw roll 6 and moved 2 before ${describeEntrant(game, entrant)}.`,
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
      message: `${describeEntrant(game, entrant)} used Hare: main move +2, now ${moveValue}.`,
    });
  }

  if (key === "corner_based_main_move_modifier") {
    const secondCorner = Math.floor(race.trackLength * 0.66);
    const modifier = entrant.position < secondCorner ? 3 : -1;
    moveValue += modifier;
    logs.push({
      type: "ability_trigger",
      message: `${describeEntrant(game, entrant)} used Blimp: main move ${modifier > 0 ? "+3" : "-1"}, now ${Math.max(0, moveValue)}.`,
    });
  }

  if (key === "pull_all_then_bonus_per_guest") {
    const guests = countOthersAt(race, entrant.id, entrant.position);
    if (guests > 0) {
      moveValue += guests;
      logs.push({
        type: "ability_trigger",
        message: `${describeEntrant(game, entrant)} gained +${guests} from Party Animal guests, now ${moveValue}.`,
      });
    }
  }

  const coach = findSharedCoach(race, entrant);

  if (coach) {
    moveValue += 1;
    logs.push({
      type: "ability_trigger",
      message: `${describeEntrant(game, coach)} coached ${describeEntrant(game, entrant)}: main move +1, now ${moveValue}.`,
    });
  }

  const gunk = findOtherByKey(game, race, entrant, "others_main_move_minus_one");

  if (gunk) {
    moveValue -= 1;
    logs.push({
      type: "ability_trigger",
      message: `${describeEntrant(game, gunk)} slowed ${describeEntrant(game, entrant)}: main move -1, now ${Math.max(0, moveValue)}.`,
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
