import { describe, expect, it } from "vitest";
import { RoomService, RoomServiceError } from "./roomService";

describe("RoomService", () => {
  it("assigns fixed room seats and keeps the first player as host", () => {
    const service = new RoomService();
    const dad = service.join("family-a", "Dad");
    const kid = service.join("family-a", "Kid");

    expect(dad.playerId).toBe("player-1");
    expect(kid.playerId).toBe("player-2");
    expect(kid.room.hostPlayerId).toBe(dad.playerId);
    expect(kid.room.playerSlots.filter((slot) => slot.isOccupied).map((slot) => slot.playerName)).toEqual(["Dad", "Kid"]);
    service.disconnect("family-a", dad.playerId);
    const hostRejoined = service.join("family-a", "Dad", dad.playerId);
    expect(hostRejoined.room.hostPlayerId).toBe(dad.playerId);
    expect(hostRejoined.room.playerSlots[0].isConnected).toBe(true);
    const disconnected = service.disconnect("family-a", kid.playerId);
    expect(disconnected?.playerSlots[1].isConnected).toBe(false);
    const rejoined = service.join("family-a", "Kid", kid.playerId);
    expect(rejoined.playerId).toBe(kid.playerId);
    expect(rejoined.room.playerSlots[1].isConnected).toBe(true);
  });

  it("creates a shared game and broadcasts a server-authoritative command result", () => {
    const service = new RoomService();
    const dad = service.join("family-a", "Dad");
    service.join("family-a", "Kid");

    const started = service.startSharedGame("family-a", dad.playerId, { racersPerPlayerPerRace: 2, debugMode: true, boardMode: "allSpecial" });
    expect(started.gameState?.phase).toBe("teamReveal");
    expect(started.gameState?.settings.racersPerPlayerPerRace).toBe(2);
    expect(started.gameState?.settings.debugMode).toBe(true);
    expect(started.gameState?.settings.boardMode).toBe("allSpecial");
    expect(started.gameState?.players.every((player) => player.athleteIds.length === 8)).toBe(true);

    const selected = service.dispatchGameCommand(
      "family-a",
      dad.playerId,
      started.gameState!.revision,
      { type: "BEGIN_SELECTION" },
    );
    expect(selected.gameState?.phase).toBe("selecting");
    expect(selected.gameState?.revision).toBeGreaterThan(started.gameState!.revision);

    const kidView = service.getRoomForPlayer("family-a", "player-2");
    expect(kidView?.gameState?.players.find((player) => player.id === dad.playerId)?.athleteIds).toEqual([]);
    expect(kidView?.gameState?.selectionState?.selectionsByPlayerId[dad.playerId]).toEqual([]);
  });

  it("lets the host randomize shared teams before racer selection", () => {
    const service = new RoomService();
    const dad = service.join("family-a", "Dad");
    const kid = service.join("family-a", "Kid");
    const started = service.startSharedGame("family-a", dad.playerId, { racersPerPlayerPerRace: 2 });

    const randomized = service.dispatchGameCommand(
      "family-a",
      dad.playerId,
      started.gameState!.revision,
      { type: "ASSIGN_TEAMS" },
    );

    expect(randomized.gameState?.phase).toBe("teamReveal");
    expect(randomized.gameState?.revision).toBeGreaterThan(started.gameState!.revision);
    expect(randomized.gameState?.players.map((player) => player.id)).toEqual([dad.playerId, kid.playerId]);
    expect(randomized.gameState?.players.every((player) => player.athleteIds.length === 8)).toBe(true);

    expect(() => service.dispatchGameCommand(
      "family-a",
      kid.playerId,
      randomized.gameState!.revision,
      { type: "ASSIGN_TEAMS" },
    )).toThrow("只有房主");
  });

  it("rejects non-host setup commands and stale revisions", () => {
    const service = new RoomService();
    const dad = service.join("family-a", "Dad");
    const kid = service.join("family-a", "Kid");
    const started = service.startSharedGame("family-a", dad.playerId);

    expect(() => service.dispatchGameCommand(
      "family-a",
      kid.playerId,
      started.gameState!.revision,
      { type: "BEGIN_SELECTION" },
    )).toThrow(RoomServiceError);

    expect(() => service.dispatchGameCommand(
      "family-a",
      dad.playerId,
      0,
      { type: "BEGIN_SELECTION" },
    )).toThrow("房间状态已更新");
  });

  it("rejects choosing another player's racer", () => {
    const service = new RoomService();
    const dad = service.join("family-a", "Dad");
    const kid = service.join("family-a", "Kid");
    const started = service.startSharedGame("family-a", dad.playerId);
    const selecting = service.dispatchGameCommand(
      "family-a",
      dad.playerId,
      started.gameState!.revision,
      { type: "BEGIN_SELECTION" },
    );
    const dadAthleteId = selecting.gameState!.players.find((player) => player.id === dad.playerId)!.athleteIds[0];

    expect(() => service.dispatchGameCommand(
      "family-a",
      kid.playerId,
      selecting.gameState!.revision,
      { type: "SELECT_ATHLETE", playerId: dad.playerId, athleteId: dadAthleteId },
    )).toThrow("不能替其他玩家执行操作");
  });

  it("lets only the host reset a shared game while preserving seats", () => {
    const service = new RoomService();
    const dad = service.join("family-a", "Dad");
    const kid = service.join("family-a", "Kid");
    service.startSharedGame("family-a", dad.playerId);

    expect(() => service.resetSharedGame("family-a", kid.playerId)).toThrow("只有房主");

    const resetRoom = service.resetSharedGame("family-a", dad.playerId);
    expect(resetRoom.status).toBe("waiting");
    expect(resetRoom.gameState).toBeNull();
    expect(resetRoom.playerSlots.filter((slot) => slot.isOccupied).map((slot) => slot.playerName)).toEqual(["Dad", "Kid"]);
  });
});
