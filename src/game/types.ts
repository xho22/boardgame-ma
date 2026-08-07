export type GamePhase =
  | "home"
  | "setup"
  | "teamReveal"
  | "selecting"
  | "raceReveal"
  | "racing"
  | "raceResults"
  | "finalResults";

export type AthleteType =
  | "mainMove"
  | "reaction"
  | "movement"
  | "warp"
  | "scoring"
  | "copy"
  | "prediction"
  | "turnOrder"
  | "special";

export type AbilityTiming =
  | "beforeRace"
  | "afterReveal"
  | "beforeMainMove"
  | "afterRoll"
  | "modifyMainMove"
  | "replaceMainMove"
  | "duringMove"
  | "afterMove"
  | "onPass"
  | "onSharedStop"
  | "onOtherPower"
  | "onOtherRoll"
  | "onFinish"
  | "afterRace";

export type AbilityImplementationKey =
  | "unimplemented"
  | "main_roll_low_becomes_four"
  | "same_space_main_move_plus_one"
  | "others_main_move_minus_one"
  | "hare_fast_unless_alone_lead"
  | "main_move_fixed_five_optional"
  | "reroll_main_move_up_to_two"
  | "optional_double_roll_then_trip";

export type GameSettings = {
  playerCount: number;
  playerNames: string[];
  aiPlayerIds: string[];
  racesCount: number;
  athletesPerPlayer: number;
  trackLength: number;
  teamAssignment: "snake" | "random";
};

export type GameState = {
  phase: GamePhase;
  gameId: string;
  roomId?: string;
  settings: GameSettings;
  players: Player[];
  athletes: Athlete[];
  raceIndex: number;
  races: RaceSummary[];
  activeRace: RaceState | null;
  selectionState: SelectionState | null;
  log: GameLogEntry[];
  rngSeed: string;
  revision: number;
};

export type Player = {
  id: string;
  name: string;
  color: string;
  score: number;
  athleteIds: string[];
  usedAthleteIds: string[];
  firstPlaces: number;
  secondPlaces: number;
  isAI: boolean;
  connectionId?: string;
  isConnected?: boolean;
};

export type PlayerSlot = {
  slotIndex: number;
  playerId: string | null;
  playerName: string;
  color: string;
  isOccupied: boolean;
  isAI: boolean;
};

export type RoomState = {
  roomId: string;
  roomName: string;
  hostPlayerId: string;
  status: "waiting" | "playing" | "complete";
  playerSlots: PlayerSlot[];
  gameState: GameState | null;
  createdAt: number;
  updatedAt: number;
};

export type Athlete = {
  id: string;
  sourceKey: string;
  standardName: string;
  displayName: string;
  type: AthleteType;
  abilityText: string;
  abilityHooks: AbilityTiming[];
  implementationKey: AbilityImplementationKey;
  maxUsesPerRace?: number;
  maxUsesPerGame?: number;
  tags: string[];
  artPrompt: string;
};

export type RaceState = {
  id: string;
  raceNumber: number;
  trackLength: number;
  firstPlacePoints: number;
  secondPlacePoints: number;
  turnOrder: string[];
  currentTurnIndex: number;
  entrants: Entrant[];
  finishers: Finisher[];
  round: number;
  previousFinalMoveValue: number | null;
  pendingReactions: ReactionPrompt[];
  status: "revealing" | "active" | "complete";
};

export type Entrant = {
  playerId: string;
  athleteId: string;
  position: number;
  finished: boolean;
  finishRank: number | null;
  skippedTurns: number;
  actionCount: number;
  abilityUses: Record<string, number>;
  temporaryEffects: TemporaryEffect[];
};

export type TemporaryEffect = {
  id: string;
  type: "trip" | "modifier" | "reactionLock";
  expiresAt: "nextMainMove" | "endOfTurn" | "endOfRace";
  value?: number;
};

export type Finisher = {
  playerId: string;
  athleteId: string;
  rank: number;
};

export type ReactionPrompt = {
  id: string;
  playerId: string;
  athleteId: string;
  promptType: "optionalPower" | "reroll" | "duel";
};

export type RaceSummary = {
  raceNumber: number;
  firstPlacePoints: number;
  secondPlacePoints: number;
  finishers: Finisher[];
};

export type SelectionState = {
  raceNumber: number;
  selectionsByPlayerId: Record<string, string | null>;
  lockedPlayerIds: string[];
};

export type GameLogEntry = {
  id: string;
  type:
    | "game_start"
    | "team_assigned"
    | "race_start"
    | "athlete_reveal"
    | "turn_start"
    | "dice_roll"
    | "ability_trigger"
    | "movement"
    | "position_swap"
    | "status_added"
    | "finish"
    | "score_awarded"
    | "race_end"
    | "game_end";
  message: string;
  createdAt: number;
};

export type GameCommand =
  | { type: "START_GAME"; payload: GameSettings }
  | { type: "ASSIGN_TEAMS" }
  | { type: "SELECT_ATHLETE"; playerId: string; athleteId: string }
  | { type: "REVEAL_RACE" }
  | { type: "ROLL_DICE"; playerId: string }
  | { type: "USE_ABILITY"; playerId: string; payload: unknown }
  | { type: "CONFIRM_REACTION"; playerId: string; reactionId: string; accepted: boolean }
  | { type: "BEGIN_NEXT_RACE" }
  | { type: "FINISH_GAME" };
