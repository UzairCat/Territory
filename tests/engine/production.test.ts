import { describe, expect, it } from 'vitest';

import { RESOURCE_IDS, TERRAIN_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import type { GameAction } from '../../src/engine/core/actions';
import { createGame } from '../../src/engine/core/create-game';
import { dispatch } from '../../src/engine/core/game-engine';
import type { GameState } from '../../src/engine/core/game-state';
import { actionId, hexId, vertexId } from '../../src/engine/core/ids';
import { createRandomState, randomInteger } from '../../src/engine/core/random';
import {
  calculateProductionDemand,
  resolveProduction,
} from '../../src/engine/rules/production-rules';
import {
  getLegalSetupHouseVertexIds,
  getLegalSetupRoadEdgeIds,
} from '../../src/engine/rules/setup-rules';
import { createTestConfig, createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

const VERTEX_A = vertexId('production-a');
const VERTEX_B = vertexId('production-b');
const WOOD_HEX = hexId('production-wood');
const SECOND_WOOD_HEX = hexId('production-second-wood');
const BRICK_HEX = hexId('production-brick');
const WRONG_HEX = hexId('production-wrong');

function productionState(): GameState {
  const state = createTestGameState('WAITING_FOR_ROLL');
  return {
    ...state,
    players: {
      [TEST_PLAYER_IDS[0]]: {
        ...state.players[TEST_PLAYER_IDS[0]]!,
        resources: resourceBundle([]),
      },
      [TEST_PLAYER_IDS[1]]: {
        ...state.players[TEST_PLAYER_IDS[1]]!,
        resources: resourceBundle([]),
      },
    },
    board: {
      hexes: {
        [WOOD_HEX]: {
          id: WOOD_HEX,
          q: 0,
          r: 0,
          terrainId: TERRAIN_IDS.forest,
          resourceId: RESOURCE_IDS.wood,
          numberToken: 8,
          vertexIds: [VERTEX_A, VERTEX_B],
          edgeIds: [],
        },
        [SECOND_WOOD_HEX]: {
          id: SECOND_WOOD_HEX,
          q: 1,
          r: 0,
          terrainId: TERRAIN_IDS.forest,
          resourceId: RESOURCE_IDS.wood,
          numberToken: 8,
          vertexIds: [VERTEX_A],
          edgeIds: [],
        },
        [BRICK_HEX]: {
          id: BRICK_HEX,
          q: 0,
          r: 1,
          terrainId: TERRAIN_IDS.hills,
          resourceId: RESOURCE_IDS.brick,
          numberToken: 8,
          vertexIds: [VERTEX_A],
          edgeIds: [],
        },
        [WRONG_HEX]: {
          id: WRONG_HEX,
          q: -1,
          r: 0,
          terrainId: TERRAIN_IDS.fields,
          resourceId: RESOURCE_IDS.grain,
          numberToken: 5,
          vertexIds: [VERTEX_A],
          edgeIds: [],
        },
      },
      vertices: {
        [VERTEX_A]: {
          id: VERTEX_A,
          adjacentHexIds: [WOOD_HEX, SECOND_WOOD_HEX, BRICK_HEX, WRONG_HEX],
          connectedEdgeIds: [],
          adjacentVertexIds: [],
          building: { ownerId: TEST_PLAYER_IDS[0], type: 'HOUSE' },
          portId: null,
        },
        [VERTEX_B]: {
          id: VERTEX_B,
          adjacentHexIds: [WOOD_HEX],
          connectedEdgeIds: [],
          adjacentVertexIds: [],
          building: { ownerId: TEST_PLAYER_IDS[1], type: 'MANSION' },
          portId: null,
        },
      },
      edges: {},
      ports: {},
      robberHexId: null,
    },
  };
}

function randomForTotal(total: number) {
  for (let candidate = 0; candidate < 10_000; candidate += 1) {
    const state = createRandomState(`production-roll-${total}-${candidate}`);
    const first = randomInteger(state, 1, 7);
    const second = randomInteger(first.state, 1, 7);
    if (first.value + second.value === total) return state;
  }
  throw new Error(`Could not find deterministic dice total ${total}.`);
}

function completeGeneratedSetup(): GameState {
  const created = createGame({ ...createTestConfig(), seed: 'production-integration-seed' });
  if (!created.ok) throw new Error(created.issues.map((issue) => issue.message).join(', '));
  let state = created.state;
  let serial = 0;

  while (state.turn.phase === 'SETUP_PLACE_HOUSE' || state.turn.phase === 'SETUP_PLACE_ROAD') {
    const actorId = state.turn.activePlayerId;
    if (actorId === null) throw new Error('Generated setup has no active player.');
    let action: GameAction;
    if (state.turn.phase === 'SETUP_PLACE_HOUSE') {
      const vertexId = getLegalSetupHouseVertexIds(state)[0];
      if (vertexId === undefined) throw new Error('Generated setup has no legal house.');
      action = {
        id: actionId(`production-setup-house-${serial}`),
        type: 'PLACE_SETUP_HOUSE',
        actorId,
        vertexId,
      };
    } else {
      const edgeId = getLegalSetupRoadEdgeIds(state)[0];
      if (edgeId === undefined) throw new Error('Generated setup has no legal road.');
      action = {
        id: actionId(`production-setup-road-${serial}`),
        type: 'PLACE_SETUP_ROAD',
        actorId,
        edgeId,
      };
    }
    const result = dispatch(state, action);
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    state = result.state;
    serial += 1;
  }

  return state;
}

describe('resource production', () => {
  it('aggregates houses, mansions, and multiple matching tiles by player and resource', () => {
    const state = productionState();
    const demand = calculateProductionDemand(state, 8);
    const resolution = resolveProduction(state, 8);

    expect(demand[TEST_PLAYER_IDS[0]]).toEqual(
      resourceBundle([
        [RESOURCE_IDS.wood, 2],
        [RESOURCE_IDS.brick, 1],
      ]),
    );
    expect(demand[TEST_PLAYER_IDS[1]]).toEqual(resourceBundle([[RESOURCE_IDS.wood, 2]]));
    expect(resolution.grants).toEqual(demand);
    expect(resolution.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({ wood: 2, brick: 1 });
    expect(resolution.players[TEST_PLAYER_IDS[1]]?.resources).toMatchObject({ wood: 2 });
    expect(resolution.bank[RESOURCE_IDS.wood]).toBe(15);
    expect(resolution.bank[RESOURCE_IDS.brick]).toBe(18);
    expect(state.players[TEST_PLAYER_IDS[0]]?.resources[RESOURCE_IDS.wood] ?? 0).toBe(0);
  });

  it('blocks only the robber hex and ignores non-matching numbers', () => {
    const state = productionState();
    const blocked = resolveProduction(
      { ...state, board: { ...state.board, robberHexId: WOOD_HEX } },
      8,
    );

    expect(blocked.grants[TEST_PLAYER_IDS[0]]).toEqual(
      resourceBundle([
        [RESOURCE_IDS.wood, 1],
        [RESOURCE_IDS.brick, 1],
      ]),
    );
    expect(blocked.grants[TEST_PLAYER_IDS[1]]).toBeUndefined();
    expect(resolveProduction(state, 4).grants).toEqual({});
    expect(resolveProduction(state, 5).grants[TEST_PLAYER_IDS[0]]).toEqual(
      resourceBundle([[RESOURCE_IDS.grain, 1]]),
    );
  });

  it('cancels an entire resource type during a bank shortage while resolving other types', () => {
    const state = productionState();
    const scarceState: GameState = {
      ...state,
      bank: resourceBundle([
        [RESOURCE_IDS.wood, 3],
        [RESOURCE_IDS.brick, 19],
        [RESOURCE_IDS.grain, 19],
        [RESOURCE_IDS.livestock, 19],
        [RESOURCE_IDS.ore, 19],
      ]),
    };
    const resolution = resolveProduction(scarceState, 8);

    expect(resolution.unavailableResourceIds).toEqual([RESOURCE_IDS.wood]);
    expect(resolution.grants[TEST_PLAYER_IDS[0]]).toEqual(
      resourceBundle([[RESOURCE_IDS.brick, 1]]),
    );
    expect(resolution.grants[TEST_PLAYER_IDS[1]]).toBeUndefined();
    expect(resolution.bank[RESOURCE_IDS.wood]).toBe(3);
    expect(resolution.bank[RESOURCE_IDS.brick]).toBe(18);
  });

  it('pays every numbered building connection on a generated board through the dice action', () => {
    const setupState = completeGeneratedSetup();
    const numberedConnections = Object.values(setupState.board.vertices).flatMap((vertex) =>
      vertex.building === null
        ? []
        : vertex.adjacentHexIds.flatMap((adjacentHexId) => {
            const hex = setupState.board.hexes[adjacentHexId];
            return hex?.numberToken === null ||
              hex?.numberToken === undefined ||
              hex.resourceId === null
              ? []
              : [{ playerId: vertex.building!.ownerId, hex }];
          }),
    );
    expect(numberedConnections.length).toBeGreaterThan(0);

    for (const connection of numberedConnections) {
      const state: GameState = {
        ...setupState,
        random: randomForTotal(connection.hex.numberToken!),
      };
      const playerBefore = state.players[connection.playerId];
      const result = dispatch(state, {
        id: actionId(`roll-${connection.hex.id}-${connection.playerId}`),
        type: 'ROLL_DICE',
        actorId: state.turn.activePlayerId!,
      });
      expect(result.ok).toBe(true);
      if (!result.ok || playerBefore === undefined) continue;
      expect(
        (result.state.players[connection.playerId]?.resources[connection.hex.resourceId!] ?? 0) -
          (playerBefore.resources[connection.hex.resourceId!] ?? 0),
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
