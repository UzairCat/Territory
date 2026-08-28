import { describe, expect, it } from 'vitest';

import type { GameAction } from '../../src/engine/core/actions';
import { dispatch } from '../../src/engine/core/game-engine';
import { actionId } from '../../src/engine/core/ids';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

const unavailableAction: GameAction = {
  id: actionId('action-1'),
  type: 'BUY_PROGRESS_CARD',
  actorId: TEST_PLAYER_IDS[0],
};

describe('engine dispatch boundary', () => {
  it('rejects an action in the wrong phase without changing state', () => {
    const state = createTestGameState();
    const snapshot = structuredClone(state);
    const result = dispatch(state, unavailableAction);

    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(result.state).toEqual(snapshot);
    expect(result.events).toEqual([]);
    if (!result.ok) {
      expect(result.error.code).toBe('WRONG_PHASE');
    }
  });

  it('locks gameplay after the game-over phase', () => {
    const state = createTestGameState('GAME_OVER');
    const result = dispatch(state, unavailableAction);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GAME_ALREADY_OVER');
    }
  });
});
