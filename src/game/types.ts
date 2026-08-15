import type { AbilityImplementationKey } from "./abilityTypes";

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

export type GameSettings = {
  playerCount: number;
  playerNames: string[];
  aiPlayerIds: string[];
  racesCount: number;
  racersPerPlayerPerRace: 1 | 2;
  athletesPerPlayer: number;
  trackLength: number;
  teamAssignment: "snake" | "random";
  debugMode: boolean;
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
  imagePath: string;
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
  pendingDiceDecision?: PendingDiceDecision | null;
  pendingTurnState: PendingTurnState | null;
  status: "revealing" | "active" | "complete";
};

export type Entrant = {
  id: string;
  playerId: string;
  athleteId: string;
  copiedAbilityKey?: AbilityImplementationKey;
  predictedWinnerEntrantId?: string;
  position: number;
  finished: boolean;
  finishRank: number | null;
  eliminated?: boolean;
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
  entrantId: string;
  playerId: string;
  athleteId: string;
  rank: number;
};

export type ReactionPrompt = {
  id: string;
  playerId: string;
  athleteId: string;
  promptType: "optionalPower" | "reroll" | "duel";
  sourceEntrantId?: string;
  targetEntrantId?: string;
  title?: string;
  description?: string;
};

export type MainMoveChoice = {
  useLegsFixedMove?: boolean;
  useFlipFlopSwap?: boolean;
  flipFlopTargetEntrantId?: string;
  useCheerleader?: boolean;
  useHypnotist?: boolean;
  hypnotistTargetEntrantId?: string;
  useThirdWheel?: boolean;
  thirdWheelTargetPosition?: number;
  useRocketScientistDouble?: boolean;
  magicianMaxRerolls?: 0 | 1 | 2;
  geniusGuess?: 1 | 2 | 3 | 4 | 5 | 6;
  forcedDieRoll?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Internal continuation marker for a DiceMonger reroll decision. */
  skipDicemongerPrompt?: boolean;
};

export type PendingDiceDecision = {
  playerId: string;
  dieRoll: 1 | 2 | 3 | 4 | 5 | 6;
  choice: MainMoveChoice;
  dicemongerEntrantId: string;
};

export type PendingTurnState = {
  extraTurnPlayerId: string | null;
  nextTurnPlayerId: string | null;
};

export type RaceSummary = {
  raceNumber: number;
  firstPlacePoints: number;
  secondPlacePoints: number;
  finishers: Finisher[];
};

export type SelectionState = {
  raceNumber: number;
  activePlayerId: string | null;
  selectionsByPlayerId: Record<string, string[]>;
  mastermindPredictionsByAthleteId: Record<string, string>;
  lockedPlayerIds: string[];
  revealed: boolean;
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
  | { type: "BEGIN_SELECTION" }
  | { type: "SELECT_ATHLETE"; playerId: string; athleteId: string }
  | { type: "SET_MASTERMIND_PREDICTION"; athleteId: string; predictedAthleteId: string }
  | { type: "LOCK_SELECTION"; playerId: string }
  | { type: "REVEAL_RACE" }
  | { type: "ROLL_DICE"; playerId: string; choice?: MainMoveChoice }
  | { type: "USE_ABILITY"; playerId: string; payload: unknown }
  | { type: "CONFIRM_REACTION"; playerId: string; reactionId: string; accepted: boolean }
  | { type: "BEGIN_NEXT_RACE" }
  | { type: "FINISH_GAME" };
