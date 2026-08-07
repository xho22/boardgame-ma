export type Rng = {
  nextFloat(): number;
  nextInt(maxExclusive: number): number;
  rollDie(sides: number): number;
  shuffle<T>(items: readonly T[]): T[];
};

export function createRng(seed: string): Rng {
  let state = hashSeed(seed);

  function nextFloat(): number {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  function nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error("maxExclusive must be a positive integer");
    }

    return Math.floor(nextFloat() * maxExclusive);
  }

  return {
    nextFloat,
    nextInt,
    rollDie(sides: number): number {
      if (!Number.isInteger(sides) || sides <= 0) {
        throw new Error("sides must be a positive integer");
      }

      return nextInt(sides) + 1;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const result = [...items];

      for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = nextInt(index + 1);
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
      }

      return result;
    },
  };
}

function hashSeed(seed: string): number {
  let hash = 1779033703 ^ seed.length;

  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^= hash >>> 16) >>> 0;
}
