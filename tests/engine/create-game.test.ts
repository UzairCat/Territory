import { describe, expect, it } from 'vitest';

import { createGame } from '../../src/engine/core/create-game';
import { isJsonSerializable } from '../../src/engine/core/json';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { createTestConfig, TEST_PLAYER_IDS } from '../helpers/game-state';

describe('match creation', () => {
  it('creates a deterministic serializable match shell from valid configuration', () => {
    const config = createTestConfig();
    const first = createGame(config);
    const second = createGame(config);

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    if (!first.ok) return;

    expect(first.state.turn.phase).toBe('INITIALIZING');
    const turnOrder = [...first.state.config.players].sort(
      (firstPlayer, secondPlayer) => firstPlayer.order - secondPlayer.order,
    );
    expect(first.state.turn.activePlayerId).toBe(turnOrder[0]?.id);
    expect(first.state.players[TEST_PLAYER_IDS[0]]).toMatchObject({
      roadsRemaining: 15,
      housesRemaining: 5,
      mansionsRemaining: 4,
    });
    expect(first.state.bank[RESOURCE_IDS.wood]).toBe(19);
    expect(first.state.random.seed).toBe(config.seed);
    expect(first.state.random.draws).toBeGreaterThan(config.players.length - 1);
    expect(isJsonSerializable(first.state)).toBe(true);
  });

  it('uses the match seed to randomize turn order instead of lobby creation order', () => {
    const config = { ...createTestConfig(), seed: 'turn-order-seed' };
    const result = createGame(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.config.players.map((player) => player.id)).toEqual([
      TEST_PLAYER_IDS[1],
      TEST_PLAYER_IDS[0],
    ]);
    expect(result.state.turn.activePlayerId).toBe(TEST_PLAYER_IDS[1]);
  });

  it('returns validation issues instead of creating an invalid match', () => {
    const config = { ...createTestConfig(), seed: '' };
    const result = createGame(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('INVALID_SEED');
    }
  });
});
