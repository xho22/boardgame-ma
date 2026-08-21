import { describe, expect, it } from "vitest";
import { ABILITY_IMPLEMENTATION_KEYS, PHASE_TWO_ACTIVE_ABILITY_KEYS } from "./abilityTypes";
import { STANDARD_RACER_NAMES } from "./constants";
import { STANDARD_ATHLETES } from "./athletes";
import { createInitialGameState } from "./setup";

const PHASE_TWO_MINIMUM_RACERS = [
  "Alchemist",
  "Coach",
  "Gunk",
  "Hare",
  "Legs",
  "Magician",
  "Rocket Scientist",
  "Banana",
] as const;

describe("STANDARD_ATHLETES", () => {
  it("contains all 36 standard racers exactly once", () => {
    const standardNames = STANDARD_ATHLETES.map((athlete) => athlete.standardName);

    expect(STANDARD_ATHLETES).toHaveLength(36);
    expect(standardNames).toEqual([...STANDARD_RACER_NAMES]);
    expect(new Set(standardNames).size).toBe(36);
  });

  it("has unique ids, source keys, and implementation keys", () => {
    expect(new Set(STANDARD_ATHLETES.map((athlete) => athlete.id)).size).toBe(36);
    expect(new Set(STANDARD_ATHLETES.map((athlete) => athlete.sourceKey)).size).toBe(36);
    expect(new Set(STANDARD_ATHLETES.map((athlete) => athlete.implementationKey)).size).toBe(36);
  });

  it("has complete display data for every racer", () => {
    for (const athlete of STANDARD_ATHLETES) {
      expect(athlete.id).toMatch(/^athlete-[a-z0-9_]+$/);
      expect(athlete.sourceKey).toMatch(/^standard_[a-z0-9_]+$/);
      expect(athlete.imagePath).toBe(`/racers/${athlete.id}.png`);
      expect(athlete.displayName.length).toBeGreaterThan(0);
      expect(athlete.abilityText.length).toBeGreaterThan(10);
      expect(athlete.abilityText).not.toMatch(/main move|before race|trip|last place|lead|warp|passing|\bmove\b/i);
      expect(athlete.abilityHooks.length).toBeGreaterThan(0);
      expect(athlete.tags).toContain("standard");
      expect(athlete.artPrompt).toContain(athlete.standardName);
      expect(ABILITY_IMPLEMENTATION_KEYS).toContain(athlete.implementationKey);
    }
  });

  it("includes the phase 2 minimum racers as active data entries", () => {
    const activeRacers = STANDARD_ATHLETES.filter((athlete) => athlete.tags.includes("phase-2-active"));
    const activeNames = activeRacers.map((athlete) => athlete.standardName);
    const activeKeys = activeRacers.map((athlete) => athlete.implementationKey);

    expect(new Set(activeNames)).toEqual(new Set(PHASE_TWO_MINIMUM_RACERS));
    expect(activeKeys).toEqual([...PHASE_TWO_ACTIVE_ABILITY_KEYS]);
  });

  it("supports assigning enough unique racers for a two player game", () => {
    const game = createInitialGameState({
      settings: { playerCount: 2 },
      seed: "athlete-data",
      now: 1_000,
    });
    const assignedAthleteIds = game.players.flatMap((player) => player.athleteIds);

    expect(assignedAthleteIds).toHaveLength(8);
    expect(new Set(assignedAthleteIds).size).toBe(8);
    expect(assignedAthleteIds.every((id) => STANDARD_ATHLETES.some((athlete) => athlete.id === id))).toBe(true);
  });
});
