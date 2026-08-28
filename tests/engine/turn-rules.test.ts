import { describe, expect, it } from 'vitest';

import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { dispatch } from '../../src/engine/core/game-engine';
import type { GameState } from '../../src/engine/core/game-state';
import { actionId } from '../../src/engine/core/ids';
import { isJsonSerializable } from '../../src/engine/core/json';
import { createRandomState, randomInteger } from '../../src/engine/core/random';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

function randomForTotal(total: number) {
  for (let candidate = 0; candidate < 10_000; candidate += 1) {
    const state = createRandomState(`dice-total-${total}-${candidate}`);
    const first = randomInteger(state, 1, 7);
    const second = randomInteger(first.state, 1, 7);
    if (first.value + second.value === total) {
      return { state, dice: [first.value, second.value] as const, final: second.state };
    }
  }
  throw new Error(`Could not find deterministic dice total ${total}.`);
}

function withRobberFlowEnabled(state: GameState): GameState {
  return {
    ...state,
    config: {
      ...state.config,
      rules: { ...state.config.rules, robberFlowEnabled: true },
    },
  };
}

describe('normal turn rules', () => {
  it('rolls deterministic 2d6, resolves production, and enters action phase', () => {
    const random = randomForTotal(8);
    const state: GameState = { ...createTestGameState('WAITING_FOR_ROLL'), random: random.state };
    const snapshot = structuredClone(state);
    const action = {
      id: actionId('roll-eight'),
      type: 'ROLL_DICE' as const,
      actorId: TEST_PLAYER_IDS[0],
    };
    const first = dispatch(state, action);
    const replay = dispatch(structuredClone(state), action);

    expect(first.ok).toBe(true);
    expect(replay).toEqual(first);
    expect(state).toEqual(snapshot);
    if (!first.ok) return;
    expect(first.state.turn.dice).toEqual(random.dice);
    expect(first.state.turn.phase).toBe('ACTION_PHASE');
    expect(first.state.random).toEqual(random.final);
    expect(isJsonSerializable(first.state)).toBe(true);
    expect(isJsonSerializable(first.events)).toBe(true);
    expect(first.events.map((event) => event.type)).toEqual(['DICE_ROLLED', 'RESOURCES_PRODUCED']);
  });

  it('does not consume randomness for an out-of-turn or duplicate roll', () => {
    const state = createTestGameState('WAITING_FOR_ROLL');
    const wrongPlayer = dispatch(state, {
      id: actionId('wrong-player-roll'),
      type: 'ROLL_DICE',
      actorId: TEST_PLAYER_IDS[1],
    });
    expect(wrongPlayer.ok).toBe(false);
    expect(wrongPlayer.state).toBe(state);
    if (!wrongPlayer.ok) expect(wrongPlayer.error.code).toBe('NOT_YOUR_TURN');

    const rolledState: GameState = {
      ...state,
      turn: { ...state.turn, phase: 'ACTION_PHASE', dice: [3, 4] },
    };
    const duplicate = dispatch(rolledState, {
      id: actionId('duplicate-roll'),
      type: 'ROLL_DICE',
      actorId: TEST_PLAYER_IDS[0],
    });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.state.random).toBe(rolledState.random);
    if (!duplicate.ok) expect(duplicate.error.code).toBe('DICE_ALREADY_ROLLED');
  });

  it('branches a seven into robber movement when nobody must discard', () => {
    const random = randomForTotal(7);
    const state = withRobberFlowEnabled({
      ...createTestGameState('WAITING_FOR_ROLL'),
      random: random.state,
    });
    const result = dispatch(state, {
      id: actionId('roll-seven'),
      type: 'ROLL_DICE',
      actorId: TEST_PLAYER_IDS[0],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn.phase).toBe('MOVE_ROBBER');
    expect(result.state.pendingInteraction).toEqual({
      type: 'MOVE_ROBBER',
      playerId: TEST_PLAYER_IDS[0],
    });
    expect(result.events.map((event) => event.type)).toEqual([
      'DICE_ROLLED',
      'ROBBER_SEQUENCE_STARTED',
    ]);
  });

  it('creates a deterministic discard queue when a seven finds large hands', () => {
    const random = randomForTotal(7);
    const original = createTestGameState('WAITING_FOR_ROLL');
    const state = withRobberFlowEnabled({
      ...original,
      random: random.state,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 8]]),
        },
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([[RESOURCE_IDS.brick, 9]]),
        },
      },
    });
    const result = dispatch(state, {
      id: actionId('roll-seven-discards'),
      type: 'ROLL_DICE',
      actorId: TEST_PLAYER_IDS[0],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn.phase).toBe('DISCARD_RESOURCES');
    expect(result.state.pendingInteraction).toEqual({
      type: 'DISCARD_RESOURCES',
      queue: [TEST_PLAYER_IDS[0], TEST_PLAYER_IDS[1]],
      requiredCounts: { [TEST_PLAYER_IDS[0]]: 4, [TEST_PLAYER_IDS[1]]: 4 },
    });
  });

  it('skips the seven discard queue only when explicitly requested', () => {
    const random = randomForTotal(7);
    const original = createTestGameState('WAITING_FOR_ROLL');
    const state = withRobberFlowEnabled({
      ...original,
      random: random.state,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 99]]),
        },
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([[RESOURCE_IDS.brick, 9]]),
        },
      },
    });
    const result = dispatch(
      state,
      {
        id: actionId('roll-seven-without-discards'),
        type: 'ROLL_DICE',
        actorId: TEST_PLAYER_IDS[0],
      },
      { skipSevenDiscards: true },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn.phase).toBe('MOVE_ROBBER');
    expect(result.state.pendingInteraction).toEqual({
      type: 'MOVE_ROBBER',
      playerId: TEST_PLAYER_IDS[0],
    });
    expect(result.state.players).toBe(state.players);
    expect(result.events).toContainEqual({
      type: 'ROBBER_SEQUENCE_STARTED',
      playerId: TEST_PLAYER_IDS[0],
      discardPlayerIds: [],
    });
  });

  it('deterministically rerolls sevens while the robber flow is disabled', () => {
    const random = randomForTotal(7);
    const original = createTestGameState('WAITING_FOR_ROLL');
    const state: GameState = {
      ...original,
      config: {
        ...original.config,
        rules: { ...original.config.rules, robberFlowEnabled: false },
      },
      random: random.state,
    };
    const action = {
      id: actionId('reroll-seven'),
      type: 'ROLL_DICE' as const,
      actorId: TEST_PLAYER_IDS[0],
    };
    const result = dispatch(state, action);
    const replay = dispatch(structuredClone(state), action);

    expect(result.ok).toBe(true);
    expect(replay).toEqual(result);
    if (!result.ok) return;
    const dice = result.state.turn.dice;
    expect(dice).not.toBeNull();
    if (dice === null) return;
    expect(dice[0] + dice[1]).not.toBe(7);
    expect(result.state.turn.phase).toBe('ACTION_PHASE');
    expect(result.state.random.draws).toBeGreaterThanOrEqual(state.random.draws + 4);
    expect(result.events.map((event) => event.type)).toEqual(['DICE_ROLLED', 'RESOURCES_PRODUCED']);
  });

  it('requires a completed roll before ending and then advances a clean turn', () => {
    const waiting = createTestGameState('WAITING_FOR_ROLL');
    const tooEarly = dispatch(waiting, {
      id: actionId('early-end'),
      type: 'END_TURN',
      actorId: TEST_PLAYER_IDS[0],
    });
    expect(tooEarly.ok).toBe(false);
    if (!tooEarly.ok) expect(tooEarly.error.code).toBe('DICE_ROLL_REQUIRED');

    const actionState: GameState = {
      ...waiting,
      turn: { ...waiting.turn, phase: 'ACTION_PHASE', dice: [2, 5], cardsPlayedThisTurn: 1 },
    };
    const result = dispatch(actionState, {
      id: actionId('end-turn'),
      type: 'END_TURN',
      actorId: TEST_PLAYER_IDS[0],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn).toMatchObject({
      activePlayerId: TEST_PLAYER_IDS[1],
      turnNumber: 1,
      phase: 'WAITING_FOR_ROLL',
      dice: null,
      cardsPlayedThisTurn: 0,
    });
    expect(result.events.map((event) => event.type)).toEqual(['TURN_ENDED', 'TURN_STARTED']);
  });
});
