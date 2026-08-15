import type { GameCommand, GameSettings, RoomState } from "../game/types";

export type ClientMessage =
  | { type: "JOIN_ROOM"; roomId: string; playerName: string; previousPlayerId?: string }
  | { type: "START_SHARED_GAME" }
  | { type: "GAME_COMMAND"; revision: number; command: GameCommand };

export type ServerMessage =
  | { type: "STATE_SYNC"; room: RoomState; playerId: string }
  | { type: "COMMAND_REJECTED"; reason: string; room?: RoomState }
  | { type: "CONNECTION_ERROR"; reason: string };

export type StartSharedGameOptions = Pick<GameSettings, "debugMode" | "racersPerPlayerPerRace">;
