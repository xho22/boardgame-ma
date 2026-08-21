import type { GameCommand, GameSettings, RoomState } from "../game/types";

export type ClientMessage =
  | { type: "JOIN_ROOM"; roomId: string; playerName: string; previousPlayerId?: string }
  | { type: "HEARTBEAT"; sentAt: number }
  | { type: "START_SHARED_GAME"; options?: StartSharedGameOptions }
  | { type: "RESET_SHARED_GAME" }
  | { type: "REMOVE_OFFLINE_PLAYER"; targetPlayerId: string }
  | { type: "GAME_COMMAND"; revision: number; command: GameCommand };

export type ServerMessage =
  | { type: "STATE_SYNC"; room: RoomState; playerId: string }
  | { type: "HEARTBEAT_ACK"; sentAt: number }
  | { type: "COMMAND_REJECTED"; reason: string; room?: RoomState }
  | { type: "CONNECTION_ERROR"; reason: string };

export type StartSharedGameOptions = Partial<Pick<GameSettings, "boardMode" | "debugMode" | "racersPerPlayerPerRace">>;
