import { describe, expect, it } from 'vitest';

import type { GameConfig } from '../../src/engine/core/game-config';
import { validateGameConfig } from '../../src/engine/core/game-config';
import { createTestConfig } from '../helpers/game-state';

describe('game configuration validation', () => {
  it('accepts a complete classic configuration', () => {
    expect(validateGameConfig(createTestConfig())).toEqual([]);
  });

  it('rejects duplicate names case-insensitively and duplicate colors', () => {
    const original = createTestConfig();
    const duplicate: GameConfig = {
      ...original,
      players: [
        original.players[0]!,
        {
          ...original.players[1]!,
          name: ` ${original.players[0]!.name.toUpperCase()} `,
          colorId: original.players[0]!.colorId,
        },
      ],
    };
    const codes = validateGameConfig(duplicate).map((entry) => entry.code);

    expect(codes).toContain('DUPLICATE_PLAYER_NAME');
    expect(codes).toContain('DUPLICATE_PLAYER_COLOR');
  });

  it('rejects non-contiguous player order values', () => {
    const original = createTestConfig();
    const invalid: GameConfig = {
      ...original,
      players: [original.players[0]!, { ...original.players[1]!, order: 4 }],
    };

    expect(validateGameConfig(invalid).map((entry) => entry.code)).toContain(
      'INVALID_PLAYER_ORDER',
    );
  });
});
