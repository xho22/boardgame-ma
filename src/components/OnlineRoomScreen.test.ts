import { describe, expect, it } from "vitest";
import { ONLINE_ROOM_IDS } from "./OnlineRoomScreen";

describe("online room options", () => {
  it("offers eight fixed family rooms", () => {
    expect(ONLINE_ROOM_IDS).toEqual([
      "family-a",
      "family-b",
      "family-c",
      "family-d",
      "family-e",
      "family-f",
      "family-g",
      "family-h",
    ]);
  });
});
