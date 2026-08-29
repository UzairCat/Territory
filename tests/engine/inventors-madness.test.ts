import { describe, expect, it } from 'vitest';

import { createGame } from '../../src/engine/core/create-game';
import type { GameState } from '../../src/engine/core/game-state';
import { orderedPlayerIds } from '../../src/engine/rules/setup-rules';
import { advanceTurn } from '../../src/engine/rules/turn-rules';
import { createTestConfig } from '../helpers/game-state';

describe("Inventor's Madness", () => {
  it('warns after the first full round, then swaps the marked tokens each round', () => {
    const created = createGame({ ...createTestConfig(), inventorsMadness: true });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const state: GameState = {
      ...created.state,
      turn: {
        ...created.state.turn,
        phase: 'ACTION_PHASE',
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
    };
    const players = orderedPlayerIds(state);
    const firstTurn = advanceTurn(state, players[0]!);
    expect(firstTurn).not.toBeNull();
    if (firstTurn === null) return;
    expect(firstTurn.events.some((event) => event.type.startsWith('INVENTORS_MADNESS'))).toBe(
      false,
    );

    const firstRound = advanceTurn(firstTurn.state, players[1]!);
    expect(firstRound).not.toBeNull();
    if (firstRound === null) return;
    expect(firstRound.events.some((event) => event.type === 'INVENTORS_MADNESS_SWAPPED')).toBe(
      false,
    );
    expect(
      firstRound.events.some((event) => event.type === 'INVENTORS_MADNESS_TARGETS_SELECTED'),
    ).toBe(true);
    const pending = firstRound.state.inventorsMadness?.pendingHexIds;
    expect(pending).not.toBeNull();
    if (pending === null || pending === undefined) return;
    const firstValue = firstRound.state.board.hexes[pending[0]]?.numberToken;
    const secondValue = firstRound.state.board.hexes[pending[1]]?.numberToken;

    const nextFirstTurn = advanceTurn(firstRound.state, players[0]!);
    expect(nextFirstTurn).not.toBeNull();
    if (nextFirstTurn === null) return;
    const secondRound = advanceTurn(nextFirstTurn.state, players[1]!);
    expect(secondRound).not.toBeNull();
    if (secondRound === null) return;
    expect(secondRound.events).toContainEqual({
      type: 'INVENTORS_MADNESS_SWAPPED',
      hexIds: pending,
    });
    expect(secondRound.state.board.hexes[pending[0]]?.numberToken).toBe(secondValue);
    expect(secondRound.state.board.hexes[pending[1]]?.numberToken).toBe(firstValue);
    expect(secondRound.state.inventorsMadness?.pendingHexIds).not.toBeNull();
  });
});
