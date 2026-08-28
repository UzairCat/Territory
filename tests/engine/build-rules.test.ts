import { describe, expect, it } from 'vitest';

import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { dispatch } from '../../src/engine/core/game-engine';
import type { GameState } from '../../src/engine/core/game-state';
import { actionId, edgeId, vertexId } from '../../src/engine/core/ids';
import { isJsonSerializable } from '../../src/engine/core/json';
import {
  getConstructionAvailability,
  getPotentialHouseVertexIds,
  getPotentialMansionVertexIds,
  getPotentialRoadEdgeIds,
  getValidHouseVertexIds,
  getValidMansionVertexIds,
  getValidRoadEdgeIds,
} from '../../src/engine/rules/build-rules';
import { canAfford } from '../../src/engine/rules/resource-rules';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

const VERTEX_A = vertexId('build-a');
const VERTEX_B = vertexId('build-b');
const VERTEX_C = vertexId('build-c');
const VERTEX_D = vertexId('build-d');
const VERTEX_E = vertexId('build-e');
const VERTEX_F = vertexId('build-f');
const VERTEX_G = vertexId('build-g');
const VERTEX_H = vertexId('build-h');
const VERTEX_I = vertexId('build-i');
const EDGE_AB = edgeId('build-ab');
const EDGE_BC = edgeId('build-bc');
const EDGE_CD = edgeId('build-cd');
const EDGE_EF = edgeId('build-ef');
const EDGE_GH = edgeId('build-gh');
const EDGE_HI = edgeId('build-hi');

function constructionState(): GameState {
  const state = createTestGameState('ACTION_PHASE');
  return {
    ...state,
    players: {
      ...state.players,
      [TEST_PLAYER_IDS[0]]: {
        ...state.players[TEST_PLAYER_IDS[0]]!,
        resources: resourceBundle([
          [RESOURCE_IDS.wood, 2],
          [RESOURCE_IDS.brick, 2],
          [RESOURCE_IDS.grain, 4],
          [RESOURCE_IDS.livestock, 2],
          [RESOURCE_IDS.ore, 4],
        ]),
        roadsRemaining: 13,
        housesRemaining: 4,
        mansionsRemaining: 4,
      },
    },
    bank: resourceBundle([
      [RESOURCE_IDS.wood, 17],
      [RESOURCE_IDS.brick, 17],
      [RESOURCE_IDS.grain, 15],
      [RESOURCE_IDS.livestock, 17],
      [RESOURCE_IDS.ore, 15],
    ]),
    board: {
      hexes: {},
      ports: {},
      robberHexId: null,
      vertices: {
        [VERTEX_A]: {
          id: VERTEX_A,
          adjacentHexIds: [],
          connectedEdgeIds: [EDGE_AB],
          adjacentVertexIds: [VERTEX_B],
          building: { ownerId: TEST_PLAYER_IDS[0], type: 'HOUSE' },
          portId: null,
        },
        [VERTEX_B]: {
          id: VERTEX_B,
          adjacentHexIds: [],
          connectedEdgeIds: [EDGE_AB, EDGE_BC],
          adjacentVertexIds: [VERTEX_A, VERTEX_C],
          building: null,
          portId: null,
        },
        [VERTEX_C]: {
          id: VERTEX_C,
          adjacentHexIds: [],
          connectedEdgeIds: [EDGE_BC, EDGE_CD],
          adjacentVertexIds: [VERTEX_B, VERTEX_D],
          building: null,
          portId: null,
        },
        [VERTEX_D]: {
          id: VERTEX_D,
          adjacentHexIds: [],
          connectedEdgeIds: [EDGE_CD],
          adjacentVertexIds: [VERTEX_C],
          building: null,
          portId: null,
        },
        [VERTEX_E]: {
          id: VERTEX_E,
          adjacentHexIds: [],
          connectedEdgeIds: [EDGE_EF],
          adjacentVertexIds: [VERTEX_F],
          building: null,
          portId: null,
        },
        [VERTEX_F]: {
          id: VERTEX_F,
          adjacentHexIds: [],
          connectedEdgeIds: [EDGE_EF],
          adjacentVertexIds: [VERTEX_E],
          building: null,
          portId: null,
        },
        [VERTEX_G]: {
          id: VERTEX_G,
          adjacentHexIds: [],
          connectedEdgeIds: [EDGE_GH],
          adjacentVertexIds: [VERTEX_H],
          building: null,
          portId: null,
        },
        [VERTEX_H]: {
          id: VERTEX_H,
          adjacentHexIds: [],
          connectedEdgeIds: [EDGE_GH, EDGE_HI],
          adjacentVertexIds: [VERTEX_G, VERTEX_I],
          building: { ownerId: TEST_PLAYER_IDS[1], type: 'HOUSE' },
          portId: null,
        },
        [VERTEX_I]: {
          id: VERTEX_I,
          adjacentHexIds: [],
          connectedEdgeIds: [EDGE_HI],
          adjacentVertexIds: [VERTEX_H],
          building: null,
          portId: null,
        },
      },
      edges: {
        [EDGE_AB]: {
          id: EDGE_AB,
          vertexAId: VERTEX_A,
          vertexBId: VERTEX_B,
          adjacentHexIds: [],
          roadOwnerId: TEST_PLAYER_IDS[0],
          portId: null,
        },
        [EDGE_BC]: {
          id: EDGE_BC,
          vertexAId: VERTEX_B,
          vertexBId: VERTEX_C,
          adjacentHexIds: [],
          roadOwnerId: TEST_PLAYER_IDS[0],
          portId: null,
        },
        [EDGE_CD]: {
          id: EDGE_CD,
          vertexAId: VERTEX_C,
          vertexBId: VERTEX_D,
          adjacentHexIds: [],
          roadOwnerId: null,
          portId: null,
        },
        [EDGE_EF]: {
          id: EDGE_EF,
          vertexAId: VERTEX_E,
          vertexBId: VERTEX_F,
          adjacentHexIds: [],
          roadOwnerId: null,
          portId: null,
        },
        [EDGE_GH]: {
          id: EDGE_GH,
          vertexAId: VERTEX_G,
          vertexBId: VERTEX_H,
          adjacentHexIds: [],
          roadOwnerId: TEST_PLAYER_IDS[0],
          portId: null,
        },
        [EDGE_HI]: {
          id: EDGE_HI,
          vertexAId: VERTEX_H,
          vertexBId: VERTEX_I,
          adjacentHexIds: [],
          roadOwnerId: null,
          portId: null,
        },
      },
    },
  };
}

describe('normal construction rules', () => {
  it('exposes structurally legal board targets even when the player cannot pay', () => {
    const original = constructionState();
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([]),
        },
      },
    };

    expect(getPotentialRoadEdgeIds(state, TEST_PLAYER_IDS[0])).toContain(EDGE_CD);
    expect(getPotentialHouseVertexIds(state, TEST_PLAYER_IDS[0])).toContain(VERTEX_C);
    expect(getPotentialMansionVertexIds(state, TEST_PLAYER_IDS[0])).toContain(VERTEX_A);
    expect(getValidRoadEdgeIds(state, TEST_PLAYER_IDS[0])).toEqual([]);
    expect(getValidHouseVertexIds(state, TEST_PLAYER_IDS[0])).toEqual([]);
    expect(getValidMansionVertexIds(state, TEST_PLAYER_IDS[0])).toEqual([]);
  });

  it('checks affordability against a generic resource bundle', () => {
    expect(
      canAfford(
        resourceBundle([
          [RESOURCE_IDS.wood, 1],
          [RESOURCE_IDS.brick, 1],
        ]),
        resourceBundle([[RESOURCE_IDS.wood, 1]]),
      ),
    ).toBe(true);
    expect(
      canAfford(
        resourceBundle([[RESOURCE_IDS.wood, 1]]),
        resourceBundle([
          [RESOURCE_IDS.wood, 1],
          [RESOURCE_IDS.brick, 1],
        ]),
      ),
    ).toBe(false);
  });

  it('builds a connected road atomically and returns its cost to the bank', () => {
    const state = constructionState();
    const snapshot = structuredClone(state);
    const result = dispatch(state, {
      id: actionId('build-road'),
      type: 'BUILD_ROAD',
      actorId: TEST_PLAYER_IDS[0],
      edgeId: EDGE_CD,
    });

    expect(result.ok).toBe(true);
    expect(state).toEqual(snapshot);
    if (!result.ok) return;
    expect(result.state.board.edges[EDGE_CD]?.roadOwnerId).toBe(TEST_PLAYER_IDS[0]);
    expect(result.state.players[TEST_PLAYER_IDS[0]]).toMatchObject({ roadsRemaining: 12 });
    expect(result.state.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 1,
      brick: 1,
    });
    expect(result.state.bank).toMatchObject({ wood: 18, brick: 18 });
    expect(result.events.map((event) => event.type)).toEqual(['RESOURCES_SPENT', 'ROAD_BUILT']);
    expect(isJsonSerializable(result.state)).toBe(true);
    expect(isJsonSerializable(result.events)).toBe(true);
  });

  it('uses the active mode configuration instead of hardcoded construction costs', () => {
    const original = constructionState();
    const state: GameState = {
      ...original,
      config: {
        ...original.config,
        rules: {
          ...original.config.rules,
          buildingCosts: {
            ...original.config.rules.buildingCosts,
            ROAD: resourceBundle([[RESOURCE_IDS.ore, 2]]),
          },
        },
      },
    };
    const result = dispatch(state, {
      id: actionId('custom-cost-road'),
      type: 'BUILD_ROAD',
      actorId: TEST_PLAYER_IDS[0],
      edgeId: EDGE_CD,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 2,
      brick: 2,
      ore: 2,
    });
    expect(result.state.bank).toMatchObject({ wood: 17, brick: 17, ore: 17 });
    expect(result.events[0]).toEqual({
      type: 'RESOURCES_SPENT',
      playerId: TEST_PLAYER_IDS[0],
      resources: resourceBundle([[RESOURCE_IDS.ore, 2]]),
      reason: 'ROAD',
    });
  });

  it('builds a road from an owned building but not through an opponent building', () => {
    const state = constructionState();
    const withoutFirstRoad: GameState = {
      ...state,
      board: {
        ...state.board,
        edges: {
          ...state.board.edges,
          [EDGE_AB]: { ...state.board.edges[EDGE_AB]!, roadOwnerId: null },
        },
      },
    };
    expect(getValidRoadEdgeIds(withoutFirstRoad, TEST_PLAYER_IDS[0])).toContain(EDGE_AB);

    for (const target of [EDGE_EF, EDGE_HI]) {
      const result = dispatch(state, {
        id: actionId(`blocked-road-${target}`),
        type: 'BUILD_ROAD',
        actorId: TEST_PLAYER_IDS[0],
        edgeId: target,
      });
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
      if (!result.ok) expect(result.error.code).toBe('EDGE_NOT_CONNECTED');
    }
  });

  it('builds a network-connected house while enforcing the distance rule', () => {
    const state = constructionState();
    expect(getValidHouseVertexIds(state, TEST_PLAYER_IDS[0])).toEqual([VERTEX_C]);
    const result = dispatch(state, {
      id: actionId('build-house'),
      type: 'BUILD_HOUSE',
      actorId: TEST_PLAYER_IDS[0],
      vertexId: VERTEX_C,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.board.vertices[VERTEX_C]?.building).toEqual({
      ownerId: TEST_PLAYER_IDS[0],
      type: 'HOUSE',
    });
    expect(result.state.players[TEST_PLAYER_IDS[0]]).toMatchObject({ housesRemaining: 3 });
    expect(result.state.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 1,
      brick: 1,
      grain: 3,
      livestock: 1,
    });
    expect(result.events).toContainEqual({
      type: 'SCORE_CHANGED',
      playerId: TEST_PLAYER_IDS[0],
      score: 2,
    });

    const adjacent = dispatch(state, {
      id: actionId('adjacent-house'),
      type: 'BUILD_HOUSE',
      actorId: TEST_PLAYER_IDS[0],
      vertexId: VERTEX_B,
    });
    expect(adjacent.ok).toBe(false);
    if (!adjacent.ok) expect(adjacent.error.code).toBe('DISTANCE_RULE_VIOLATION');
  });

  it('requires a player road for a normal house', () => {
    const state = constructionState();
    const result = dispatch(state, {
      id: actionId('disconnected-house'),
      type: 'BUILD_HOUSE',
      actorId: TEST_PLAYER_IDS[0],
      vertexId: VERTEX_E,
    });

    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    if (!result.ok) expect(result.error.code).toBe('ROAD_CONNECTION_REQUIRED');
  });

  it('upgrades only an owned house and returns that house piece', () => {
    const state = constructionState();
    expect(getValidMansionVertexIds(state, TEST_PLAYER_IDS[0])).toEqual([VERTEX_A]);
    const result = dispatch(state, {
      id: actionId('upgrade-mansion'),
      type: 'UPGRADE_MANSION',
      actorId: TEST_PLAYER_IDS[0],
      vertexId: VERTEX_A,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.board.vertices[VERTEX_A]?.building?.type).toBe('MANSION');
    expect(result.state.players[TEST_PLAYER_IDS[0]]).toMatchObject({
      housesRemaining: 5,
      mansionsRemaining: 3,
    });
    expect(result.state.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({ grain: 2, ore: 1 });
    expect(result.state.bank).toMatchObject({ grain: 17, ore: 18 });
    expect(result.events.map((event) => event.type)).toEqual([
      'RESOURCES_SPENT',
      'BUILDING_UPGRADED',
      'SCORE_CHANGED',
    ]);
    expect(result.events.at(-1)).toEqual({
      type: 'SCORE_CHANGED',
      playerId: TEST_PLAYER_IDS[0],
      score: 2,
    });

    const opponentHouse = dispatch(state, {
      id: actionId('upgrade-opponent'),
      type: 'UPGRADE_MANSION',
      actorId: TEST_PLAYER_IDS[0],
      vertexId: VERTEX_H,
    });
    expect(opponentHouse.ok).toBe(false);
    if (!opponentHouse.ok) expect(opponentHouse.error.code).toBe('HOUSE_REQUIRED_FOR_UPGRADE');
  });

  it('enforces phase, active player, affordability, supply, and occupied targets', () => {
    const state = constructionState();
    const cases: readonly [GameState, Parameters<typeof dispatch>[1], string][] = [
      [
        { ...state, turn: { ...state.turn, phase: 'WAITING_FOR_ROLL' } },
        {
          id: actionId('wrong-phase'),
          type: 'BUILD_ROAD',
          actorId: TEST_PLAYER_IDS[0],
          edgeId: EDGE_CD,
        },
        'WRONG_PHASE',
      ],
      [
        state,
        {
          id: actionId('wrong-player'),
          type: 'BUILD_ROAD',
          actorId: TEST_PLAYER_IDS[1],
          edgeId: EDGE_CD,
        },
        'NOT_YOUR_TURN',
      ],
      [
        {
          ...state,
          players: {
            ...state.players,
            [TEST_PLAYER_IDS[0]]: {
              ...state.players[TEST_PLAYER_IDS[0]]!,
              resources: resourceBundle([]),
            },
          },
        },
        {
          id: actionId('cannot-afford'),
          type: 'BUILD_ROAD',
          actorId: TEST_PLAYER_IDS[0],
          edgeId: EDGE_CD,
        },
        'INSUFFICIENT_RESOURCES',
      ],
      [
        {
          ...state,
          players: {
            ...state.players,
            [TEST_PLAYER_IDS[0]]: {
              ...state.players[TEST_PLAYER_IDS[0]]!,
              roadsRemaining: 0,
            },
          },
        },
        {
          id: actionId('no-pieces'),
          type: 'BUILD_ROAD',
          actorId: TEST_PLAYER_IDS[0],
          edgeId: EDGE_CD,
        },
        'NO_PIECES_REMAINING',
      ],
      [
        state,
        {
          id: actionId('occupied-road'),
          type: 'BUILD_ROAD',
          actorId: TEST_PLAYER_IDS[0],
          edgeId: EDGE_AB,
        },
        'EDGE_OCCUPIED',
      ],
      [
        state,
        {
          id: actionId('occupied-house'),
          type: 'BUILD_HOUSE',
          actorId: TEST_PLAYER_IDS[0],
          vertexId: VERTEX_A,
        },
        'VERTEX_OCCUPIED',
      ],
    ];

    for (const [caseState, action, expectedCode] of cases) {
      const result = dispatch(caseState, action);
      expect(result.ok).toBe(false);
      expect(result.state).toBe(caseState);
      if (!result.ok) expect(result.error.code).toBe(expectedCode);
    }
  });

  it('reports construction availability without exposing a mutation shortcut', () => {
    const state = constructionState();
    expect(getConstructionAvailability(state, TEST_PLAYER_IDS[0], 'ROAD')).toMatchObject({
      canBuild: true,
      targetCount: 1,
      reason: null,
    });
    const poorState: GameState = {
      ...state,
      players: {
        ...state.players,
        [TEST_PLAYER_IDS[0]]: {
          ...state.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([]),
        },
      },
    };
    expect(getConstructionAvailability(poorState, TEST_PLAYER_IDS[0], 'ROAD')).toMatchObject({
      canBuild: false,
      targetCount: 0,
      reason: 'The active player cannot afford a road.',
    });
  });
});
