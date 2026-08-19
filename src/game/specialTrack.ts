export type SpecialTrackEffect =
  | { type: "score"; points: number; label: string }
  | { type: "trip"; label: string }
  | { type: "move"; spaces: number; label: string };

export const SPECIAL_TRACK_SPACES: Readonly<Record<number, SpecialTrackEffect>> = {
  1: { type: "score", points: 1, label: "得分 +1" },
  5: { type: "trip", label: "绊倒" },
  7: { type: "move", spaces: 3, label: "前进 3" },
  11: { type: "move", spaces: 1, label: "前进 1" },
  13: { type: "score", points: 1, label: "得分 +1" },
  16: { type: "move", spaces: -4, label: "后退 4" },
  17: { type: "trip", label: "绊倒" },
  23: { type: "move", spaces: 2, label: "前进 2" },
  24: { type: "move", spaces: -2, label: "后退 2" },
  26: { type: "trip", label: "绊倒" },
};

export function getBoardKind(raceNumber: number, boardMode: "alternating" | "allSpecial" | undefined): "normal" | "special" {
  return boardMode === "allSpecial" || raceNumber % 2 === 0 ? "special" : "normal";
}

export function getSpecialTrackEffect(space: number): SpecialTrackEffect | undefined {
  return SPECIAL_TRACK_SPACES[space];
}
