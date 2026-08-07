import { STANDARD_ATHLETE_BY_ID } from "./athletes";
import { shouldAutoRerollMagician, shouldAutoUseRocketScientist } from "./abilityImplementations";
import type { GameLogEntry, GameState, Entrant, RaceState } from "./types";
import type { Rng } from "./rng";

export type AbilityLog = {
  type: GameLogEntry["type"];
  message: string;
};

export type MainMoveResolution = {
  dieRoll: number | null;
  finalMove: number;
  entrant: Entrant;
  logs: AbilityLog[];
};

type ResolveMainMoveOptions = {
  game: GameState;
  race: RaceState;
  entrant: Entrant;
  rng: Rng;
};

export function resolveMainMove({ game, race, entrant, rng }: ResolveMainMoveOptions): MainMoveResolution {
  const athlete = STANDARD_ATHLETE_BY_ID.get(entrant.athleteId);
  const racerName = describeEntrant(game, entrant);
  const logs: AbilityLog[] = [];

  if (!athlete) {
    throw new Error(`Unknown athlete: ${entrant.athleteId}`);
  }

  if (entrant.skippedTurns > 0) {
    return {
      dieRoll: null,
      finalMove: 0,
      entrant: {
        ...entrant,
        skippedTurns: entrant.skippedTurns - 1,
        actionCount: entrant.actionCount + 1,
      },
      logs: [
        {
          type: "ability_trigger",
          message: `${racerName} recovered from trip and skipped this main move.`,
        },
      ],
    };
  }

  if (athlete.implementationKey === "hare_fast_unless_alone_lead" && isAloneInLead(race, entrant)) {
    return {
      dieRoll: null,
      finalMove: 0,
      entrant: {
        ...entrant,
        actionCount: entrant.actionCount + 1,
      },
      logs: [
        {
          type: "ability_trigger",
          message: `${racerName} was alone in the lead, so Hare skipped the main move.`,
        },
      ],
    };
  }

  let dieRoll: number | null = null;
  let moveValue: number;
  let nextEntrant = {
    ...entrant,
    actionCount: entrant.actionCount + 1,
  };

  if (athlete.implementationKey === "main_move_fixed_five_optional") {
    moveValue = 5;
    logs.push({
      type: "ability_trigger",
      message: `${racerName} used Legs to skip rolling and set the main move to 5.`,
    });
  } else {
    dieRoll = rng.rollDie(6);

    if (athlete.implementationKey === "reroll_main_move_up_to_two") {
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

    moveValue = dieRoll;

    if (athlete.implementationKey === "main_roll_low_becomes_four" && dieRoll <= 2) {
      moveValue = 4;
      logs.push({
        type: "ability_trigger",
        message: `${racerName} used Alchemist: roll ${dieRoll} became main move 4.`,
      });
    }

    if (athlete.implementationKey === "optional_double_roll_then_trip" && shouldAutoUseRocketScientist(moveValue)) {
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
  }

  if (athlete.implementationKey === "hare_fast_unless_alone_lead") {
    moveValue += 2;
    logs.push({
      type: "ability_trigger",
      message: `${racerName} used Hare: main move +2, now ${moveValue}.`,
    });
  }

  const coach = findSharedCoach(race, entrant);

  if (coach) {
    moveValue += 1;
    logs.push({
      type: "ability_trigger",
      message: `${describeEntrant(game, coach)} coached ${racerName}: main move +1, now ${moveValue}.`,
    });
  }

  const gunk = findOtherGunk(race, entrant);

  if (gunk) {
    moveValue -= 1;
    logs.push({
      type: "ability_trigger",
      message: `${describeEntrant(game, gunk)} slowed ${racerName}: main move -1, now ${Math.max(0, moveValue)}.`,
    });
  }

  return {
    dieRoll,
    finalMove: Math.max(0, moveValue),
    entrant: nextEntrant,
    logs,
  };
}

export function describeEntrant(game: GameState, entrant: Entrant): string {
  const player = game.players.find((candidate) => candidate.id === entrant.playerId);
  const athlete = STANDARD_ATHLETE_BY_ID.get(entrant.athleteId);

  return `${player?.name ?? entrant.playerId}'s ${athlete?.standardName ?? entrant.athleteId}`;
}

function findSharedCoach(race: RaceState, entrant: Entrant): Entrant | null {
  return (
    race.entrants.find((candidate) => {
      const athlete = STANDARD_ATHLETE_BY_ID.get(candidate.athleteId);
      return (
        !candidate.finished &&
        candidate.position === entrant.position &&
        athlete?.implementationKey === "same_space_main_move_plus_one"
      );
    }) ?? null
  );
}

function findOtherGunk(race: RaceState, entrant: Entrant): Entrant | null {
  return (
    race.entrants.find((candidate) => {
      const athlete = STANDARD_ATHLETE_BY_ID.get(candidate.athleteId);
      return (
        candidate.playerId !== entrant.playerId &&
        !candidate.finished &&
        athlete?.implementationKey === "others_main_move_minus_one"
      );
    }) ?? null
  );
}

function isAloneInLead(race: RaceState, entrant: Entrant): boolean {
  const activeEntrants = race.entrants.filter((candidate) => !candidate.finished);
  const leadPosition = Math.max(...activeEntrants.map((candidate) => candidate.position));
  const leaders = activeEntrants.filter((candidate) => candidate.position === leadPosition);

  return entrant.position === leadPosition && leaders.length === 1;
}
