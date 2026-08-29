import { describe, expect, it } from 'vitest';

import { RESOURCE_IDS, TERRAIN_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { createGame } from '../../src/engine/core/create-game';
import { dispatch } from '../../src/engine/core/game-engine';
import type { GamePhase, GameState } from '../../src/engine/core/game-state';
import { actionId, hexId, vertexId } from '../../src/engine/core/ids';
import { isJsonSerializable } from '../../src/engine/core/json';
import { createRandomState } from '../../src/engine/core/random';
import { orderedPlayerIds } from '../../src/engine/rules/setup-rules';
import {
  createDiscardQueue,
  getRobberDestinationHexIds,
} from '../../src/engine/rules/robber-rules';
import { createTestConfig, TEST_PLAYER_IDS } from '../helpers/game-state';

const CURRENT_HEX = hexId('robber-current');
const TARGET_HEX = hexId('robber-target');
const EMPTY_HEX = hexId('robber-empty');
const TARGET_VERTEX_ONE = vertexId('robber-target-one');
const TARGET_VERTEX_TWO = vertexId('robber-target-two');

function robberState(phase: GamePhase = 'MOVE_ROBBER'): GameState {
  const created = createGame({ ...createTestConfig(3), seed: 'robber-rules-seed' });
  if (!created.ok) throw new Error(created.issues.map((issue) => issue.message).join(', '));
  const state = created.state;
  const activePlayerId = TEST_PLAYER_IDS[0];

  return {
    ...state,
    players: {
      ...state.players,
      [activePlayerId]: {
        ...state.players[activePlayerId]!,
        resources: resourceBundle([[RESOURCE_IDS.ore, 1]]),
      },
      [TEST_PLAYER_IDS[1]]: {
        ...state.players[TEST_PLAYER_IDS[1]]!,
        resources: resourceBundle([
          [RESOURCE_IDS.wood, 2],
          [RESOURCE_IDS.brick, 2],
        ]),
      },
      [TEST_PLAYER_IDS[2]]: {
        ...state.players[TEST_PLAYER_IDS[2]]!,
        resources: resourceBundle([[RESOURCE_IDS.grain, 3]]),
      },
    },
    board: {
      hexes: {
        [CURRENT_HEX]: {
          id: CURRENT_HEX,
          q: 0,
          r: 0,
          terrainId: TERRAIN_IDS.wasteland,
          resourceId: null,
          numberToken: null,
          vertexIds: [],
          edgeIds: [],
        },
        [TARGET_HEX]: {
          id: TARGET_HEX,
          q: 1,
          r: 0,
          terrainId: TERRAIN_IDS.pasture,
          resourceId: RESOURCE_IDS.livestock,
          numberToken: 8,
          vertexIds: [TARGET_VERTEX_ONE, TARGET_VERTEX_TWO],
          edgeIds: [],
        },
        [EMPTY_HEX]: {
          id: EMPTY_HEX,
          q: -1,
          r: 0,
          terrainId: TERRAIN_IDS.forest,
          resourceId: RESOURCE_IDS.wood,
          numberToken: 5,
          vertexIds: [],
          edgeIds: [],
        },
      },
      vertices: {
        [TARGET_VERTEX_ONE]: {
          id: TARGET_VERTEX_ONE,
          adjacentHexIds: [TARGET_HEX],
          connectedEdgeIds: [],
          adjacentVertexIds: [],
          building: { ownerId: TEST_PLAYER_IDS[1], type: 'HOUSE' },
          portId: null,
        },
        [TARGET_VERTEX_TWO]: {
          id: TARGET_VERTEX_TWO,
          adjacentHexIds: [TARGET_HEX],
          connectedEdgeIds: [],
          adjacentVertexIds: [],
          building: { ownerId: TEST_PLAYER_IDS[2], type: 'MANSION' },
          portId: null,
        },
      },
      edges: {},
      ports: {},
      robberHexId: CURRENT_HEX,
    },
    turn: {
      ...state.turn,
      activePlayerId,
      phase,
      dice: [3, 4],
      setupPlacementIndex: null,
      setupPlacementVertexId: null,
    },
    pendingInteraction:
      phase === 'MOVE_ROBBER' ? { type: 'MOVE_ROBBER', playerId: activePlayerId } : null,
    random: createRandomState('robber-steal-seed'),
  };
}

function playerCardCount(state: GameState, playerId: string): number {
  return Object.values(state.players[playerId]?.resources ?? {}).reduce<number>(
    (total, amount) => total + (amount ?? 0),
    0,
  );
}

describe('robber rules', () => {
  it('uses the configured card discard limit', () => {
    const original = robberState();
    const atLimit: GameState = {
      ...original,
      config: {
        ...original.config,
        rules: { ...original.config.rules, discardThreshold: 10 },
      },
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 10]]),
        },
      },
    };

    expect(createDiscardQueue(atLimit).queue).not.toContain(TEST_PLAYER_IDS[0]);
    const aboveLimit: GameState = {
      ...atLimit,
      players: {
        ...atLimit.players,
        [TEST_PLAYER_IDS[0]]: {
          ...atLimit.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 11]]),
        },
      },
    };
    expect(createDiscardQueue(aboveLimit).requiredCounts[TEST_PLAYER_IDS[0]]).toBe(5);
    expect(createDiscardQueue(aboveLimit, [TEST_PLAYER_IDS[0]]).queue).not.toContain(
      TEST_PLAYER_IDS[0],
    );
  });

  it('validates exact private discards and advances a deterministic queue', () => {
    const original = robberState('DISCARD_RESOURCES');
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([
            [RESOURCE_IDS.wood, 5],
            [RESOURCE_IDS.brick, 3],
          ]),
        },
        [TEST_PLAYER_IDS[2]]: {
          ...original.players[TEST_PLAYER_IDS[2]]!,
          resources: resourceBundle([[RESOURCE_IDS.grain, 9]]),
        },
      },
      pendingInteraction: {
        type: 'DISCARD_RESOURCES',
        queue: [TEST_PLAYER_IDS[1], TEST_PLAYER_IDS[2]],
        requiredCounts: { [TEST_PLAYER_IDS[1]]: 4, [TEST_PLAYER_IDS[2]]: 4 },
      },
    };

    const wrongPlayer = dispatch(state, {
      id: actionId('discard-out-of-order'),
      type: 'DISCARD_RESOURCES',
      actorId: TEST_PLAYER_IDS[2],
      resources: resourceBundle([[RESOURCE_IDS.grain, 4]]),
    });
    expect(wrongPlayer.ok).toBe(false);
    if (!wrongPlayer.ok) expect(wrongPlayer.error.code).toBe('NOT_YOUR_TURN');

    const wrongCount = dispatch(state, {
      id: actionId('discard-wrong-count'),
      type: 'DISCARD_RESOURCES',
      actorId: TEST_PLAYER_IDS[1],
      resources: resourceBundle([[RESOURCE_IDS.wood, 3]]),
    });
    expect(wrongCount.ok).toBe(false);
    expect(wrongCount.state).toBe(state);
    if (!wrongCount.ok) expect(wrongCount.error.code).toBe('INVALID_DISCARD');

    const unownedCards = dispatch(state, {
      id: actionId('discard-unowned'),
      type: 'DISCARD_RESOURCES',
      actorId: TEST_PLAYER_IDS[1],
      resources: resourceBundle([[RESOURCE_IDS.brick, 4]]),
    });
    expect(unownedCards.ok).toBe(false);
    if (!unownedCards.ok) expect(unownedCards.error.code).toBe('INVALID_DISCARD');

    const first = dispatch(state, {
      id: actionId('discard-first'),
      type: 'DISCARD_RESOURCES',
      actorId: TEST_PLAYER_IDS[1],
      resources: resourceBundle([
        [RESOURCE_IDS.wood, 2],
        [RESOURCE_IDS.brick, 2],
      ]),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.turn.phase).toBe('DISCARD_RESOURCES');
    expect(first.state.pendingInteraction).toEqual({
      type: 'DISCARD_RESOURCES',
      queue: [TEST_PLAYER_IDS[2]],
      requiredCounts: { [TEST_PLAYER_IDS[2]]: 4 },
    });
    expect(first.state.players[TEST_PLAYER_IDS[1]]?.resources).toMatchObject({ wood: 3, brick: 1 });
    expect(first.state.bank).toMatchObject({ wood: 21, brick: 21 });

    const second = dispatch(first.state, {
      id: actionId('discard-second'),
      type: 'DISCARD_RESOURCES',
      actorId: TEST_PLAYER_IDS[2],
      resources: resourceBundle([[RESOURCE_IDS.grain, 4]]),
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.turn.phase).toBe('MOVE_ROBBER');
    expect(second.state.pendingInteraction).toEqual({
      type: 'MOVE_ROBBER',
      playerId: TEST_PLAYER_IDS[0],
    });
    expect(second.state.players[TEST_PLAYER_IDS[2]]?.resources).toMatchObject({ grain: 5 });
    expect(second.events[0]).toMatchObject({ type: 'RESOURCES_DISCARDED' });
    expect(isJsonSerializable(second.state)).toBe(true);
  });

  it('rejects missing and unchanged robber destinations without mutation', () => {
    const state = robberState();
    for (const target of [CURRENT_HEX, hexId('missing-robber-hex')]) {
      const result = dispatch(state, {
        id: actionId(`invalid-move-${target}`),
        type: 'MOVE_ROBBER',
        actorId: TEST_PLAYER_IDS[0],
        hexId: target,
      });
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
      if (!result.ok) {
        expect(['INVALID_ROBBER_DESTINATION', 'INVALID_TARGET']).toContain(result.error.code);
      }
    }
  });

  it('keeps the robber away from opponents below three public points when enabled', () => {
    const original = robberState();
    const protectedState: GameState = {
      ...original,
      config: { ...original.config, friendlyRobber: true },
    };

    expect(getRobberDestinationHexIds(protectedState, TEST_PLAYER_IDS[0])).toEqual([EMPTY_HEX]);
    const blocked = dispatch(protectedState, {
      id: actionId('friendly-robber-protected'),
      type: 'MOVE_ROBBER',
      actorId: TEST_PLAYER_IDS[0],
      hexId: TARGET_HEX,
    });
    expect(blocked.ok).toBe(false);

    const eligibleState: GameState = {
      ...protectedState,
      bonuses: {
        longestRoadHolderId: TEST_PLAYER_IDS[1],
        largestForceHolderId: TEST_PLAYER_IDS[2],
      },
    };
    expect(getRobberDestinationHexIds(eligibleState, TEST_PLAYER_IDS[0])).toContain(TARGET_HEX);
  });

  it('moves directly to action phase when no adjacent opponent can be robbed', () => {
    const state = robberState();
    const result = dispatch(state, {
      id: actionId('move-no-targets'),
      type: 'MOVE_ROBBER',
      actorId: TEST_PLAYER_IDS[0],
      hexId: EMPTY_HEX,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.board.robberHexId).toBe(EMPTY_HEX);
    expect(result.state.turn.phase).toBe('ACTION_PHASE');
    expect(result.state.pendingInteraction).toBeNull();
    expect(result.state.random).toBe(state.random);
    expect(result.events).toEqual([
      {
        type: 'ROBBER_MOVED',
        playerId: TEST_PLAYER_IDS[0],
        fromHexId: state.board.robberHexId,
        hexId: EMPTY_HEX,
      },
    ]);
  });

  it('automatically steals one weighted card when exactly one victim is eligible', () => {
    const original = robberState();
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[2]]: {
          ...original.players[TEST_PLAYER_IDS[2]]!,
          resources: resourceBundle([]),
        },
      },
    };
    const action = {
      id: actionId('move-one-target'),
      type: 'MOVE_ROBBER' as const,
      actorId: TEST_PLAYER_IDS[0],
      hexId: TARGET_HEX,
    };
    const result = dispatch(state, action);
    const replay = dispatch(structuredClone(state), action);

    expect(result.ok).toBe(true);
    expect(replay).toEqual(result);
    if (!result.ok) return;
    expect(result.state.turn.phase).toBe('ACTION_PHASE');
    expect(result.state.pendingInteraction).toBeNull();
    expect(playerCardCount(result.state, TEST_PLAYER_IDS[0])).toBe(
      playerCardCount(state, TEST_PLAYER_IDS[0]) + 1,
    );
    expect(playerCardCount(result.state, TEST_PLAYER_IDS[1])).toBe(
      playerCardCount(state, TEST_PLAYER_IDS[1]) - 1,
    );
    expect(result.state.random.draws).toBe(state.random.draws + 1);
    expect(result.events.map((event) => event.type)).toEqual(['ROBBER_MOVED', 'RESOURCE_STOLEN']);
  });

  it('requires a choice among multiple victims, then steals and completes the sequence', () => {
    const state = robberState();
    const move = dispatch(state, {
      id: actionId('move-multiple-targets'),
      type: 'MOVE_ROBBER',
      actorId: TEST_PLAYER_IDS[0],
      hexId: TARGET_HEX,
    });

    expect(move.ok).toBe(true);
    if (!move.ok) return;
    const expectedTargets = orderedPlayerIds(state).filter(
      (playerId) => playerId === TEST_PLAYER_IDS[1] || playerId === TEST_PLAYER_IDS[2],
    );
    expect(move.state.turn.phase).toBe('CHOOSE_STEAL_TARGET');
    expect(move.state.pendingInteraction).toEqual({
      type: 'CHOOSE_STEAL_TARGET',
      playerId: TEST_PLAYER_IDS[0],
      eligibleTargets: expectedTargets,
    });
    expect(move.state.random).toBe(state.random);

    const invalid = dispatch(move.state, {
      id: actionId('invalid-steal-target'),
      type: 'STEAL_FROM_PLAYER',
      actorId: TEST_PLAYER_IDS[0],
      targetPlayerId: TEST_PLAYER_IDS[0],
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.state).toBe(move.state);
    if (!invalid.ok) expect(invalid.error.code).toBe('INVALID_STEAL_TARGET');

    const chosenTarget = expectedTargets[0];
    if (chosenTarget === undefined) throw new Error('No eligible steal target.');
    const result = dispatch(move.state, {
      id: actionId('choose-steal-target'),
      type: 'STEAL_FROM_PLAYER',
      actorId: TEST_PLAYER_IDS[0],
      targetPlayerId: chosenTarget,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn.phase).toBe('ACTION_PHASE');
    expect(result.state.pendingInteraction).toBeNull();
    expect(playerCardCount(result.state, chosenTarget)).toBe(
      playerCardCount(state, chosenTarget) - 1,
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'RESOURCE_STOLEN',
      playerId: TEST_PLAYER_IDS[0],
      targetPlayerId: chosenTarget,
    });
  });
});
