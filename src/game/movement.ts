import type { Entrant } from "./types";

export type MoveResult = {
  entrant: Entrant;
  path: number[];
  finished: boolean;
};

export function moveEntrantForward(entrant: Entrant, spaces: number, trackLength: number): MoveResult {
  if (!Number.isInteger(spaces) || spaces < 0) {
    throw new Error("spaces must be a non-negative integer");
  }

  if (!Number.isInteger(trackLength) || trackLength <= 0) {
    throw new Error("trackLength must be a positive integer");
  }

  if (entrant.finished || spaces === 0) {
    return {
      entrant,
      path: [],
      finished: entrant.finished,
    };
  }

  const path = Array.from({ length: spaces }, (_, index) => entrant.position + index + 1);
  const nextPosition = Math.min(entrant.position + spaces, trackLength);
  const finished = nextPosition >= trackLength;

  return {
    entrant: {
      ...entrant,
      position: nextPosition,
      finished,
    },
    path,
    finished,
  };
}
