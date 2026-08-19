import type { GameSettings } from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const DEFAULT_RACES_COUNT = 4;
export const DEFAULT_RACERS_PER_PLAYER_PER_RACE = 1;
export const DEFAULT_ATHLETES_PER_PLAYER = 4;
export const DEFAULT_TRACK_LENGTH = 30;

export const PLAYER_COLORS = ["red", "blue", "green", "yellow", "purple", "cyan"] as const;

export const RACE_POINTS = [
  { firstPlacePoints: 3, secondPlacePoints: 1 },
  { firstPlacePoints: 4, secondPlacePoints: 2 },
  { firstPlacePoints: 4, secondPlacePoints: 2 },
  { firstPlacePoints: 5, secondPlacePoints: 3 },
] as const;

export const STANDARD_RACER_NAMES = [
  "Alchemist",
  "Baba Yaga",
  "Banana",
  "Blimp",
  "Centaur",
  "Cheerleader",
  "Coach",
  "Copycat",
  "Dicemonger",
  "Duelist",
  "Egg",
  "Flip Flop",
  "Genius",
  "Gunk",
  "Hare",
  "Heckler",
  "Huge Baby",
  "Hypnotist",
  "Inchworm",
  "Lackey",
  "Leaptoad",
  "Legs",
  "Lovable Loser",
  "Magician",
  "Mastermind",
  "M.O.U.T.H.",
  "Party Animal",
  "Rocket Scientist",
  "Romantic",
  "Scoocher",
  "Sisyphus",
  "Skipper",
  "Stickler",
  "Suckerfish",
  "Third Wheel",
  "Twin",
] as const;

export const DEFAULT_SETTINGS: GameSettings = {
  playerCount: 2,
  playerNames: ["Player 1", "Player 2"],
  aiPlayerIds: [],
  racesCount: DEFAULT_RACES_COUNT,
  racersPerPlayerPerRace: DEFAULT_RACERS_PER_PLAYER_PER_RACE,
  athletesPerPlayer: DEFAULT_ATHLETES_PER_PLAYER,
  trackLength: DEFAULT_TRACK_LENGTH,
  teamAssignment: "snake",
  debugMode: false,
  boardMode: "alternating",
};
