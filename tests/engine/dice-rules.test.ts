import { describe, expect, it } from 'vitest';

import type { GameState } from '../../src/engine/core/game-state';
import { rollNumericDice } from '../../src/engine/rules/dice-rules';
import { createTestGameState } from '../helpers/game-state';

function balancedState(): GameState {
  const original = createTestGameState('WAITING_FOR_ROLL');
  return {
    ...original,
    config: { ...original.config, balancedDice: true },
    balancedDice: {
      remainingPairIds: Array.from({ length: 36 }, (_, index) => index),
      recentTotals: [],
    },
  };
}

describe('numeric dice rules', () => {
  it('uses independent seeded dice when Balanced Dice is off', () => {
    const state = createTestGameState('WAITING_FOR_ROLL');
    const result = rollNumericDice(state);

    expect(result.dice[0]).toBeGreaterThanOrEqual(1);
    expect(result.dice[0]).toBeLessThanOrEqual(6);
    expect(result.dice[1]).toBeGreaterThanOrEqual(1);
    expect(result.dice[1]).toBeLessThanOrEqual(6);
    expect(result.random.draws).toBe(state.random.draws + 2);
    expect(result.balancedDice).toBeNull();
  });

  it('draws unique combinations from a 36-pair deck and refreshes at 12 remaining', () => {
    let state = balancedState();
    const drawnPairs = new Set<string>();

    for (let draw = 0; draw < 24; draw += 1) {
      const result = rollNumericDice(state);
      drawnPairs.add(result.dice.join(':'));
      state = { ...state, random: result.random, balancedDice: result.balancedDice };
    }

    expect(drawnPairs.size).toBe(24);
    expect(state.balancedDice?.remainingPairIds).toHaveLength(12);

    const refreshed = rollNumericDice(state);
    expect(refreshed.balancedDice?.remainingPairIds).toHaveLength(35);
    expect(refreshed.balancedDice?.recentTotals).toHaveLength(2);
  });

  it('replays the same managed sequence from the same serialized state', () => {
    const state = balancedState();
    const first = rollNumericDice(state);
    const replay = rollNumericDice(structuredClone(state));

    expect(replay).toEqual(first);
  });
});
