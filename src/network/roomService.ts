import { reduceGameCommand } from "../game/raceEngine";
import { createRng } from "../game/rng";
import { createInitialGameState } from "../game/setup";
import type { GameCommand, GameState, PlayerSlot, RoomState } from "../game/types";
import type { StartSharedGameOptions } from "./protocol";

const ROOM_CAPACITY = 6;

export class RoomServiceError extends Error {}

export class RoomService {
  private readonly rooms = new Map<string, RoomState>();
  private nextPlayerNumber = 1;

  join(roomId: string, playerName: string, previousPlayerId?: string): { room: RoomState; playerId: string } {
    const room = this.rooms.get(roomId) ?? this.createRoom(roomId);
    const reconnectingSlot = previousPlayerId
      ? room.playerSlots.find((slot) => slot.playerId === previousPlayerId && slot.isOccupied && !slot.isConnected)
      : undefined;
    const slot = reconnectingSlot ?? room.playerSlots.find((candidate) => !candidate.isOccupied);

    if (!slot) {
      throw new RoomServiceError("房间已满，请选择另一个固定房间。");
    }

    const playerId = slot.playerId ?? `player-${this.nextPlayerNumber++}`;
    const updatedSlots = room.playerSlots.map((candidate) =>
      candidate.slotIndex === slot.slotIndex
        ? { ...candidate, playerId, playerName: playerName.trim() || `Player ${slot.slotIndex + 1}`, isOccupied: true, isConnected: true }
        : candidate,
    );
    const updatedRoom = this.withConnectionState({
      ...room,
      hostPlayerId: room.hostPlayerId || playerId,
      playerSlots: updatedSlots,
      updatedAt: Date.now(),
    });

    this.rooms.set(roomId, updatedRoom);
    return { room: updatedRoom, playerId };
  }

  getRoom(roomId: string): RoomState | null {
    return this.rooms.get(roomId) ?? null;
  }

  getRoomForPlayer(roomId: string, playerId: string): RoomState | null {
    const room = this.rooms.get(roomId);
    if (!room?.gameState || room.gameState.phase !== "selecting") {
      return room ?? null;
    }

    const game = room.gameState;
    return {
      ...room,
      gameState: {
        ...game,
        players: game.players.map((player) => player.id === playerId ? player : { ...player, athleteIds: [] }),
        selectionState: game.selectionState
          ? {
              ...game.selectionState,
              selectionsByPlayerId: Object.fromEntries(
                Object.entries(game.selectionState.selectionsByPlayerId).map(([candidateId, athleteIds]) => [
                  candidateId,
                  candidateId === playerId ? athleteIds : [],
                ]),
              ),
            }
          : null,
      },
    };
  }

  disconnect(roomId: string, playerId: string): RoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    const updatedRoom = this.withConnectionState({
      ...room,
      playerSlots: room.playerSlots.map((slot) =>
        slot.playerId === playerId ? { ...slot, isConnected: false } : slot,
      ),
      updatedAt: Date.now(),
    });
    this.rooms.set(roomId, updatedRoom);
    return updatedRoom;
  }

  startSharedGame(roomId: string, playerId: string, options: StartSharedGameOptions = {}): RoomState {
    const room = this.requireRoom(roomId);
    this.requireHost(room, playerId);
    const occupiedSlots = room.playerSlots.filter((slot) => slot.isOccupied);

    if (occupiedSlots.length < 2) {
      throw new RoomServiceError("至少需要两名玩家才能开始共享游戏。");
    }

    const game = createInitialGameState({
      settings: {
        playerCount: occupiedSlots.length,
        playerNames: occupiedSlots.map((slot) => slot.playerName),
        racersPerPlayerPerRace: options.racersPerPlayerPerRace,
        debugMode: options.debugMode,
        boardMode: options.boardMode,
      },
    });
    const gameState: GameState = {
      ...game,
      roomId,
      players: game.players.map((player, index) => ({
        ...player,
        id: occupiedSlots[index].playerId!,
        isConnected: occupiedSlots[index].isConnected,
      })),
    };
    const updatedRoom = this.withConnectionState({
      ...room,
      status: "playing",
      gameState,
      updatedAt: Date.now(),
    });

    this.rooms.set(roomId, updatedRoom);
    return updatedRoom;
  }

  resetSharedGame(roomId: string, playerId: string): RoomState {
    const room = this.requireRoom(roomId);
    this.requireHost(room, playerId);
    const updatedRoom: RoomState = {
      ...room,
      status: "waiting",
      gameState: null,
      updatedAt: Date.now(),
    };

    this.rooms.set(roomId, updatedRoom);
    return updatedRoom;
  }

  removeOfflinePlayer(roomId: string, playerId: string, targetPlayerId: string): RoomState {
    const room = this.requireRoom(roomId);
    this.requireHost(room, playerId);

    if (room.status !== "waiting" || room.gameState) {
      throw new RoomServiceError("只能在房间大厅移除离线玩家。");
    }

    const targetSlot = room.playerSlots.find((slot) => slot.playerId === targetPlayerId);
    if (!targetSlot?.isOccupied) {
      throw new RoomServiceError("目标座位不存在或已经释放。");
    }

    if (targetSlot.isConnected) {
      throw new RoomServiceError("只能移除已离线的玩家。");
    }

    const updatedRoom: RoomState = {
      ...room,
      playerSlots: room.playerSlots.map((slot) =>
        slot.playerId === targetPlayerId
          ? {
              slotIndex: slot.slotIndex,
              playerId: null,
              playerName: `座位 ${slot.slotIndex + 1}`,
              color: "#d4c9ba",
              isOccupied: false,
              isConnected: false,
              isAI: false,
            }
          : slot,
      ),
      updatedAt: Date.now(),
    };

    this.rooms.set(roomId, updatedRoom);
    return updatedRoom;
  }

  dispatchGameCommand(roomId: string, actorId: string, revision: number, command: GameCommand): RoomState {
    const room = this.requireRoom(roomId);
    const game = room.gameState;

    if (!game) {
      throw new RoomServiceError("房主尚未创建共享游戏。");
    }

    if (game.revision !== revision) {
      throw new RoomServiceError("房间状态已更新，请等待同步后再操作。");
    }

    this.assertCommandAuthority(room, actorId, command);
    const updatedGame = command.type === "ASSIGN_TEAMS"
      ? this.randomizeSharedTeams(room, game)
      : reduceGameCommand(
          game,
          command,
          createRng(`${game.rngSeed}:${game.revision}:${Date.now()}`),
        );
    const updatedRoom = this.withConnectionState({
      ...room,
      status: updatedGame.phase === "finalResults" ? "complete" : "playing",
      gameState: { ...updatedGame, roomId },
      updatedAt: Date.now(),
    });

    this.rooms.set(roomId, updatedRoom);
    return updatedRoom;
  }

  private createRoom(roomId: string): RoomState {
    const now = Date.now();
    return {
      roomId,
      roomName: roomId,
      hostPlayerId: "",
      status: "waiting",
      playerSlots: Array.from({ length: ROOM_CAPACITY }, (_, slotIndex): PlayerSlot => ({
        slotIndex,
        playerId: null,
        playerName: `座位 ${slotIndex + 1}`,
        color: "#d4c9ba",
        isOccupied: false,
        isConnected: false,
        isAI: false,
      })),
      gameState: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private requireRoom(roomId: string): RoomState {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new RoomServiceError("房间不存在，请先加入房间。");
    }
    return room;
  }

  private requireHost(room: RoomState, playerId: string): void {
    if (room.hostPlayerId !== playerId) {
      throw new RoomServiceError("只有房主可以执行此操作。");
    }
  }

  private assertCommandAuthority(room: RoomState, actorId: string, command: GameCommand): void {
    const commandPlayerId = "playerId" in command ? command.playerId : undefined;
    const ownsCommand = commandPlayerId === actorId || commandPlayerId?.startsWith(`${actorId}:`);

    if (commandPlayerId && !ownsCommand) {
      throw new RoomServiceError("不能替其他玩家执行操作。");
    }

    if (["ASSIGN_TEAMS", "BEGIN_SELECTION", "REVEAL_RACE", "BEGIN_NEXT_RACE", "FINISH_GAME"].includes(command.type)) {
      this.requireHost(room, actorId);
    }

    if (command.type === "SET_MASTERMIND_PREDICTION" || command.type === "SET_BEFORE_RACE_COPY_CHOICE") {
      const owner = room.gameState?.players.find((player) =>
        room.gameState?.selectionState?.selectionsByPlayerId[player.id]?.includes(command.athleteId),
      );
      if (owner?.id !== actorId) {
        throw new RoomServiceError("只能为自己的 racer 设置赛前能力选择。");
      }
    }

    if (["START_GAME", "USE_ABILITY"].includes(command.type)) {
      throw new RoomServiceError("该命令不支持通过在线房间直接执行。");
    }
  }

  private randomizeSharedTeams(room: RoomState, game: GameState): GameState {
    const randomized = createInitialGameState({ settings: game.settings });

    return {
      ...randomized,
      roomId: room.roomId,
      revision: game.revision + 1,
      players: randomized.players.map((player, index) => {
        const existingPlayer = game.players[index];

        return {
          ...player,
          id: existingPlayer.id,
          name: existingPlayer.name,
          color: existingPlayer.color,
          isConnected: existingPlayer.isConnected,
        };
      }),
    };
  }

  private withConnectionState(room: RoomState): RoomState {
    if (!room.gameState) {
      return room;
    }

    return {
      ...room,
      gameState: {
        ...room.gameState,
        players: room.gameState.players.map((player) => ({
          ...player,
          isConnected: room.playerSlots.find((slot) => slot.playerId === player.id)?.isConnected ?? false,
        })),
      },
    };
  }
}
