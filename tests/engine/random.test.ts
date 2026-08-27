import { describe, expect, it } from 'vitest';

import {
  createRandomState,
  nextRandom,
  randomInteger,
  shuffle,
} from '../../src/engine/core/random';

describe('seeded random provider', () => {
  it('replays the same sequence from the same seed', () => {
    let first = createRandomState('territory-seed');
    let second = createRandomState('territory-seed');
    const firstValues: number[] = [];
    const secondValues: number[] = [];

    for (let draw = 0; draw < 8; draw += 1) {
      const firstNext = nextRandom(first);
      const secondNext = nextRandom(second);
      first = firstNext.state;
      second = secondNext.state;
      firstValues.push(firstNext.value);
      secondValues.push(secondNext.value);
    }

    expect(firstValues).toEqual(secondValues);
    expect(first.draws).toBe(8);
    expect(second).toEqual(first);
  });

  it('produces values in the requested integer range without mutating its input state', () => {
    const initial = createRandomState('dice');
    const initialSnapshot = structuredClone(initial);
    const result = randomInteger(initial, 1, 7);

    expect(result.value).toBeGreaterThanOrEqual(1);
    expect(result.value).toBeLessThan(7);
    expect(initial).toEqual(initialSnapshot);
    expect(result.state.draws).toBe(1);
  });

  it('shuffles deterministically without changing the source array', () => {
    const values = [1, 2, 3, 4, 5, 6] as const;
    const first = shuffle(createRandomState('board'), values);
    const second = shuffle(createRandomState('board'), values);

    expect(first.value).toEqual(second.value);
    expect(first.value).not.toEqual(values);
    expect(values).toEqual([1, 2, 3, 4, 5, 6]);
    expect(first.state.draws).toBe(values.length - 1);
  });

  it('rejects invalid seeds and integer ranges', () => {
    expect(() => createRandomState('   ')).toThrow('Random seed cannot be empty');
    expect(() => randomInteger(createRandomState('valid'), 4, 4)).toThrow(
      'maximum greater than minimum',
    );
  });
});
