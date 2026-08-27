const MULBERRY_INCREMENT = 0x6d2b79f5;
const UINT32_RANGE = 0x1_0000_0000;

export interface RandomState {
  readonly algorithm: 'mulberry32';
  readonly seed: string;
  readonly value: number;
  readonly draws: number;
}

export interface RandomValue<T> {
  readonly state: RandomState;
  readonly value: T;
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function createRandomState(seed: string): RandomState {
  if (seed.trim().length === 0) {
    throw new Error('Random seed cannot be empty.');
  }

  return {
    algorithm: 'mulberry32',
    seed,
    value: hashSeed(seed),
    draws: 0,
  };
}

export function nextRandom(state: RandomState): RandomValue<number> {
  const nextStateValue = (state.value + MULBERRY_INCREMENT) >>> 0;
  let mixed = nextStateValue;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  const value = ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;

  return {
    state: {
      ...state,
      value: nextStateValue,
      draws: state.draws + 1,
    },
    value,
  };
}

export function randomInteger(
  state: RandomState,
  minimumInclusive: number,
  maximumExclusive: number,
): RandomValue<number> {
  if (
    !Number.isSafeInteger(minimumInclusive) ||
    !Number.isSafeInteger(maximumExclusive) ||
    maximumExclusive <= minimumInclusive
  ) {
    throw new Error(
      'Random integer bounds must be safe integers with maximum greater than minimum.',
    );
  }

  const next = nextRandom(state);
  return {
    state: next.state,
    value: minimumInclusive + Math.floor(next.value * (maximumExclusive - minimumInclusive)),
  };
}

export function shuffle<T>(state: RandomState, values: readonly T[]): RandomValue<readonly T[]> {
  const shuffled = [...values];
  let randomState = state;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selected = randomInteger(randomState, 0, index + 1);
    randomState = selected.state;
    const currentValue = shuffled[index];
    const selectedValue = shuffled[selected.value];

    if (currentValue === undefined || selectedValue === undefined) {
      throw new Error('Shuffle selected an index outside the input array.');
    }

    shuffled[index] = selectedValue;
    shuffled[selected.value] = currentValue;
  }

  return { state: randomState, value: shuffled };
}
