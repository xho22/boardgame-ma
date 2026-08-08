import type { AbilityImplementationKey } from "./abilityTypes";

export const PHASE_SEVEN_ABILITY_KEYS = [
  "main_roll_low_becomes_four",
  "same_space_main_move_plus_one",
  "others_main_move_minus_one",
  "hare_fast_unless_alone_lead",
  "main_move_fixed_five_optional",
  "reroll_main_move_up_to_two",
  "optional_double_roll_then_trip",
] as const satisfies readonly AbilityImplementationKey[];

export function shouldAutoRerollMagician(roll: number, rerollsUsed: number): boolean {
  return roll <= 3 && rerollsUsed < 2;
}

export function shouldAutoUseRocketScientist(moveValue: number): boolean {
  return moveValue > 0;
}

export function shouldAutoRerollDicemonger(roll: number): boolean {
  return roll <= 3;
}

export function shouldAutoUseFlipFlop(race: { entrants: { playerId: string; position: number; finished: boolean; eliminated?: boolean }[] }, entrant: { playerId: string; position: number }): boolean {
  const activeOpponents = race.entrants.filter(
    (candidate) =>
      candidate.playerId !== entrant.playerId &&
      !candidate.finished &&
      !candidate.eliminated,
  );

  if (activeOpponents.length <= 1) {
    return false;
  }

  return activeOpponents.some((candidate) => candidate.position > entrant.position);
}
