import { describe, expect, it } from 'vitest';

import { RESOURCE_IDS, TERRAIN_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import type { GameState } from '../../src/engine/core/game-state';
import { hexId, vertexId } from '../../src/engine/core/ids';
import {
  calculateProductionDemand,
  resolveProduction,
} from '../../src/engine/rules/production-rules';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

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
});
