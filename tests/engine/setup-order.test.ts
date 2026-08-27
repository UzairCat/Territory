import { describe, expect, it } from 'vitest';

import { createSetupOrder } from '../../src/engine/rules/setup-rules';
import { TEST_PLAYER_IDS } from '../helpers/game-state';

describe('setup order', () => {
  it('creates a forward and reverse snake for every supported player count', () => {
    expect(createSetupOrder(TEST_PLAYER_IDS.slice(0, 2))).toEqual([
      TEST_PLAYER_IDS[0],
      TEST_PLAYER_IDS[1],
      TEST_PLAYER_IDS[1],
      TEST_PLAYER_IDS[0],
    ]);
    expect(createSetupOrder(TEST_PLAYER_IDS.slice(0, 3))).toEqual([
      TEST_PLAYER_IDS[0],
      TEST_PLAYER_IDS[1],
      TEST_PLAYER_IDS[2],
      TEST_PLAYER_IDS[2],
      TEST_PLAYER_IDS[1],
      TEST_PLAYER_IDS[0],
    ]);
    expect(createSetupOrder(TEST_PLAYER_IDS)).toEqual([
      TEST_PLAYER_IDS[0],
      TEST_PLAYER_IDS[1],
      TEST_PLAYER_IDS[2],
      TEST_PLAYER_IDS[3],
      TEST_PLAYER_IDS[3],
      TEST_PLAYER_IDS[2],
      TEST_PLAYER_IDS[1],
      TEST_PLAYER_IDS[0],
    ]);
  });
});
