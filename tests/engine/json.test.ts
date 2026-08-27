import { describe, expect, it } from 'vitest';

import { isJsonSerializable } from '../../src/engine/core/json';
import { createTestGameState } from '../helpers/game-state';

describe('authoritative state serialization contract', () => {
  it('keeps the game-state shape JSON serializable', () => {
    const state = createTestGameState();

    expect(isJsonSerializable(state)).toBe(true);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('rejects values that JSON would lose or misrepresent', () => {
    expect(isJsonSerializable({ missing: undefined })).toBe(false);
    expect(isJsonSerializable({ lookup: new Map() })).toBe(false);
    expect(isJsonSerializable(Number.NaN)).toBe(false);

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(isJsonSerializable(cyclic)).toBe(false);
  });
});
