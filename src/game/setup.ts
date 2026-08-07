import {
  DEFAULT_RACERS_PER_PLAYER_PER_RACE,
  DEFAULT_RACES_COUNT,
  DEFAULT_SETTINGS,
  DEFAULT_TRACK_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  RACE_POINTS,
} from "./constants";
import { STANDARD_ATHLETES } from "./athletes";
import { createRng } from "./rng";
import type { GameSettings, GameState, Player, RaceSummary } from "./types";

export type CreateGameOptions = {
  settings?: Partial<GameSettings>;
  seed?: string;
  now?: number;
};

export function createInitialGameState(options: CreateGameOptions = {}): GameState {
  const settings = normalizeSettings(options.settings);
  const seed = options.seed ?? createDefaultSeed(options.now ?? Date.now());
  const rng = createRng(seed);
  const players = createPlayers(settings);
  const athletes = STANDARD_ATHLETES;
  const shuffledAthleteIds = rng.shuffle(athletes.map((athlete) => athlete.id));

  assignAthletes(players, shuffledAthleteIds, settings);

  return {
    phase: "teamReveal",
    gameId: `game-${seed}`,
    settings,
    players,
    athletes,
    raceIndex: 0,
    races: createRaceSummaries(settings),
    activeRace: null,
    selectionState: null,
    log: [
      {
        id: "log-game-start",
        type: "game_start",
        message: `Created a ${settings.playerCount} player game.`,
        createdAt: options.now ?? Date.now(),
      },
    ],
    rngSeed: seed,
    revision: 1,
  };
}

export function normalizeSettings(settings: Partial<GameSettings> = {}): GameSettings {
  const playerCount = settings.playerCount ?? DEFAULT_SETTINGS.playerCount;

  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`playerCount must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
  }

  const playerNames = Array.from({ length: playerCount }, (_, index) => {
    const name = settings.playerNames?.[index]?.trim();
    return name && name.length > 0 ? name : `Player ${index + 1}`;
  });
  const racersPerPlayerPerRace = settings.racersPerPlayerPerRace ?? DEFAULT_RACERS_PER_PLAYER_PER_RACE;

  if (racersPerPlayerPerRace !== 1 && racersPerPlayerPerRace !== 2) {
    throw new Error("racersPerPlayerPerRace must be 1 or 2");
  }

  if (racersPerPlayerPerRace === 2 && playerCount > 3) {
    throw new Error("racersPerPlayerPerRace can be 2 only for 2 or 3 players");
  }

  const racesCount = settings.racesCount ?? DEFAULT_RACES_COUNT;
  const athletesPerPlayer = settings.athletesPerPlayer ?? racesCount * racersPerPlayerPerRace;

  return {
    playerCount,
    playerNames,
    aiPlayerIds: settings.aiPlayerIds ?? [],
    racesCount,
    racersPerPlayerPerRace,
    athletesPerPlayer,
    trackLength: settings.trackLength ?? DEFAULT_TRACK_LENGTH,
    teamAssignment: settings.teamAssignment ?? "snake",
  };
}

function createPlayers(settings: GameSettings): Player[] {
  return Array.from({ length: settings.playerCount }, (_, index) => {
    const playerId = `player-${index + 1}`;

    return {
      id: playerId,
      name: settings.playerNames[index],
      color: PLAYER_COLORS[index],
      score: 0,
      athleteIds: [],
      usedAthleteIds: [],
      firstPlaces: 0,
      secondPlaces: 0,
      isAI: settings.aiPlayerIds.includes(playerId),
      isConnected: false,
    };
  });
}

function assignAthletes(players: Player[], athleteIds: string[], settings: GameSettings): void {
  const requiredAthletes = settings.playerCount * settings.athletesPerPlayer;

  if (athleteIds.length < requiredAthletes) {
    throw new Error(`Need ${requiredAthletes} athletes, only found ${athleteIds.length}`);
  }

  let athleteIndex = 0;

  for (let round = 0; round < settings.athletesPerPlayer; round += 1) {
    const order =
      settings.teamAssignment === "snake" && round % 2 === 1
        ? [...players].reverse()
        : players;

    for (const player of order) {
      player.athleteIds.push(athleteIds[athleteIndex]);
      athleteIndex += 1;
    }
  }
}

function createRaceSummaries(settings: GameSettings): RaceSummary[] {
  return Array.from({ length: settings.racesCount }, (_, index) => {
    const points = RACE_POINTS[index] ?? RACE_POINTS[RACE_POINTS.length - 1];

    return {
      raceNumber: index + 1,
      firstPlacePoints: points.firstPlacePoints,
      secondPlacePoints: points.secondPlacePoints,
      finishers: [],
    };
  });
}

function createDefaultSeed(now: number): string {
  return now.toString(36);
}
