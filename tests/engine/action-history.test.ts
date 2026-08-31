import { describe, expect, it } from 'vitest';

import type { GameAction } from '../../src/engine/core/actions';
import {
  ACTION_DIAGNOSTIC_HISTORY_LIMIT,
  acceptAction,
} from '../../src/engine/core/dispatch-result';
import { actionId } from '../../src/engine/core/ids';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

describe('action diagnostics', () => {
  it('uses a monotonic sequence while bounding retained diagnostic entries', () => {
    let state = createTestGameState('ACTION_PHASE');

    for (let index = 1; index <= 300; index += 1) {
      const action: GameAction = {
        id: actionId(`diagnostic-${index}`),
        type: 'END_TURN',
        actorId: TEST_PLAYER_IDS[0],
      };
      state = acceptAction(state, action, state, []).state;
    }

    expect(state.actionSequence).toBe(300);
    expect(state.actionHistory).toHaveLength(ACTION_DIAGNOSTIC_HISTORY_LIMIT);
    expect(state.actionHistory[0]?.sequence).toBe(45);
    expect(state.actionHistory.at(-1)?.sequence).toBe(300);
  });
});
