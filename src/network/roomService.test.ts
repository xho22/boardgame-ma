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

    const started = service.startSharedGame("family-a", dad.playerId);
    expect(started.gameState?.phase).toBe("teamReveal");

    const selected = service.dispatchGameCommand(
      "family-a",
      dad.playerId,
      started.gameState!.revision,
      { type: "BEGIN_SELECTION" },
    );
    expect(selected.gameState?.phase).toBe("selecting");
    expect(selected.gameState?.revision).toBeGreaterThan(started.gameState!.revision);
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
});
