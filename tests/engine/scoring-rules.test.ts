import { describe, expect, it } from 'vitest';

import { PROGRESS_CARD_IDS } from '../../src/engine/content/progress-cards';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { createGame } from '../../src/engine/core/create-game';
import { dispatch } from '../../src/engine/core/game-engine';
import type { BuildingState, GameState, KnightState } from '../../src/engine/core/game-state';
import { actionId, cardInstanceId, edgeId, knightId, vertexId } from '../../src/engine/core/ids';
import type { PlayerId } from '../../src/engine/core/ids';
import {
  calculateBonusHolders,
  calculateLongestRoadLength,
  calculatePublicScore,
  calculateRoadChainThroughEdge,
  calculateScore,
  calculateScoreBreakdown,
} from '../../src/engine/rules/scoring-rules';
import { createTestGameState, createTestKNConfig, TEST_PLAYER_IDS } from '../helpers/game-state';

interface GraphEdge {
  readonly first: number;
  readonly second: number;
  readonly ownerId: PlayerId | null;
}

function graphState(
  graphEdges: readonly GraphEdge[],
  buildings: Readonly<Record<number, BuildingState>> = {},
): GameState {
  const state = createTestGameState('ACTION_PHASE');
  const vertexNumbers = new Set([
    ...graphEdges.flatMap((edge) => [edge.first, edge.second]),
    ...Object.keys(buildings).map(Number),
  ]);
  const vertices = Object.fromEntries(
    [...vertexNumbers].map((number) => {
      const id = vertexId(`score-v${number}`);
      const connectedEdgeIds = graphEdges.flatMap((edge, index) =>
        edge.first === number || edge.second === number ? [edgeId(`score-e${index}`)] : [],
      );
      const adjacentVertexIds = graphEdges.flatMap((edge) => {
        if (edge.first === number) return [vertexId(`score-v${edge.second}`)];
        if (edge.second === number) return [vertexId(`score-v${edge.first}`)];
        return [];
      });
      return [
        id,
        {
          id,
          adjacentHexIds: [],
          connectedEdgeIds,
          adjacentVertexIds,
          building: buildings[number] ?? null,
          portId: null,
        },
      ] as const;
    }),
  );
  const edges = Object.fromEntries(
    graphEdges.map((edge, index) => {
      const id = edgeId(`score-e${index}`);
      return [
        id,
        {
          id,
          vertexAId: vertexId(`score-v${edge.first}`),
          vertexBId: vertexId(`score-v${edge.second}`),
          adjacentHexIds: [],
          roadOwnerId: edge.ownerId,
          portId: null,
        },
      ] as const;
    }),
  );
  return { ...state, board: { ...state.board, vertices, edges } };
}

function ownedLine(start: number, length: number, ownerId: PlayerId): readonly GraphEdge[] {
  return Array.from({ length }, (_, offset) => ({
    first: start + offset,
    second: start + offset + 1,
    ownerId,
  }));
}

describe('central scoring and awards', () => {
  it('finds edge-simple paths through lines, branches, loops, and opponent blocks', () => {
    const line = graphState(ownedLine(0, 6, TEST_PLAYER_IDS[0]));
    expect(calculateLongestRoadLength(line, TEST_PLAYER_IDS[0])).toBe(6);

    const branch = graphState([
      { first: 0, second: 1, ownerId: TEST_PLAYER_IDS[0] },
      { first: 1, second: 2, ownerId: TEST_PLAYER_IDS[0] },
      { first: 2, second: 3, ownerId: TEST_PLAYER_IDS[0] },
      { first: 2, second: 4, ownerId: TEST_PLAYER_IDS[0] },
    ]);
    expect(calculateLongestRoadLength(branch, TEST_PLAYER_IDS[0])).toBe(3);

    const loop = graphState([
      { first: 0, second: 1, ownerId: TEST_PLAYER_IDS[0] },
      { first: 1, second: 2, ownerId: TEST_PLAYER_IDS[0] },
      { first: 2, second: 3, ownerId: TEST_PLAYER_IDS[0] },
      { first: 3, second: 0, ownerId: TEST_PLAYER_IDS[0] },
    ]);
    expect(calculateLongestRoadLength(loop, TEST_PLAYER_IDS[0])).toBe(4);

    const blocked = graphState(ownedLine(0, 4, TEST_PLAYER_IDS[0]), {
      2: { ownerId: TEST_PLAYER_IDS[1], type: 'HOUSE' },
    });
    expect(calculateLongestRoadLength(blocked, TEST_PLAYER_IDS[0])).toBe(2);
  });

  it('finds the longest legal road chain through the inspected road', () => {
    const separated = graphState([
      ...ownedLine(0, 4, TEST_PLAYER_IDS[0]),
      ...ownedLine(10, 2, TEST_PLAYER_IDS[0]),
      { first: 20, second: 21, ownerId: null },
      ...ownedLine(30, 2, TEST_PLAYER_IDS[1]),
    ]);

    expect(calculateRoadChainThroughEdge(separated, edgeId('score-e1'))).toEqual([
      edgeId('score-e0'),
      edgeId('score-e1'),
      edgeId('score-e2'),
      edgeId('score-e3'),
    ]);
    expect(calculateRoadChainThroughEdge(separated, edgeId('score-e4'))).toEqual([
      edgeId('score-e4'),
      edgeId('score-e5'),
    ]);
    expect(calculateRoadChainThroughEdge(separated, edgeId('score-e6'))).toEqual([]);
    expect(calculateRoadChainThroughEdge(separated, edgeId('score-e7'))).toEqual([
      edgeId('score-e7'),
      edgeId('score-e8'),
    ]);

    const branch = graphState([
      { first: 0, second: 1, ownerId: TEST_PLAYER_IDS[0] },
      { first: 1, second: 2, ownerId: TEST_PLAYER_IDS[0] },
      { first: 2, second: 3, ownerId: TEST_PLAYER_IDS[0] },
      { first: 2, second: 4, ownerId: TEST_PLAYER_IDS[0] },
    ]);
    const branchChain = calculateRoadChainThroughEdge(branch, edgeId('score-e3'));
    expect(branchChain).toHaveLength(3);
    expect(branchChain).toContain(edgeId('score-e3'));

    const blocked = graphState(ownedLine(0, 4, TEST_PLAYER_IDS[0]), {
      2: { ownerId: TEST_PLAYER_IDS[1], type: 'HOUSE' },
    });
    expect(calculateRoadChainThroughEdge(blocked, edgeId('score-e0'))).toHaveLength(2);
  });

  it('treats an opponent Knight as a K+N road-network blocker', () => {
    const graph = graphState(ownedLine(0, 6, TEST_PLAYER_IDS[0]));
    const created = createGame(createTestKNConfig());
    if (!created.ok || created.state.kn === null) {
      throw new Error('K+N scoring fixture failed to initialize.');
    }
    const blockingVertexId = vertexId('score-v3');
    const blocker: KnightState = {
      id: knightId('longest-road-blocker'),
      ownerId: TEST_PLAYER_IDS[1],
      vertexId: blockingVertexId,
      level: 1,
      active: false,
      placedTurn: 1,
      activeSinceTurn: null,
      lastActionTurn: null,
      upgradedTurn: null,
    };
    const state: GameState = {
      ...graph,
      config: created.state.config,
      kn: created.state.kn,
      players: {
        ...graph.players,
        [TEST_PLAYER_IDS[1]]: {
          ...graph.players[TEST_PLAYER_IDS[1]]!,
          knights: [blocker],
        },
      },
      board: {
        ...graph.board,
        vertices: {
          ...graph.board.vertices,
          [blockingVertexId]: {
            ...graph.board.vertices[blockingVertexId]!,
            knightId: blocker.id,
          },
        },
      },
    };

    expect(calculateLongestRoadLength(state, TEST_PLAYER_IDS[0])).toBe(3);
    expect(calculateBonusHolders(state).longestRoadHolderId).toBeNull();
  });

  it('applies thresholds, leaves an unheld tie empty, retains an incumbent tie, and transfers', () => {
    const tied = graphState([
      ...ownedLine(0, 5, TEST_PLAYER_IDS[0]),
      ...ownedLine(10, 5, TEST_PLAYER_IDS[1]),
    ]);
    expect(calculateBonusHolders(tied).longestRoadHolderId).toBeNull();

    const incumbent: GameState = {
      ...tied,
      bonuses: { ...tied.bonuses, longestRoadHolderId: TEST_PLAYER_IDS[0] },
    };
    expect(calculateBonusHolders(incumbent).longestRoadHolderId).toBe(TEST_PLAYER_IDS[0]);

    const challenger = graphState([
      ...ownedLine(0, 5, TEST_PLAYER_IDS[0]),
      ...ownedLine(10, 6, TEST_PLAYER_IDS[1]),
    ]);
    const withIncumbent: GameState = {
      ...challenger,
      bonuses: { ...challenger.bonuses, longestRoadHolderId: TEST_PLAYER_IDS[0] },
    };
    expect(calculateBonusHolders(withIncumbent).longestRoadHolderId).toBe(TEST_PLAYER_IDS[1]);
  });

  it('uses the same explicit tie behavior for Largest Force', () => {
    const state = createTestGameState('ACTION_PHASE');
    const tied: GameState = {
      ...state,
      players: {
        ...state.players,
        [TEST_PLAYER_IDS[0]]: { ...state.players[TEST_PLAYER_IDS[0]]!, playedForceCards: 3 },
        [TEST_PLAYER_IDS[1]]: { ...state.players[TEST_PLAYER_IDS[1]]!, playedForceCards: 3 },
      },
    };
    expect(calculateBonusHolders(tied).largestForceHolderId).toBeNull();
    expect(
      calculateBonusHolders({
        ...tied,
        bonuses: { ...tied.bonuses, largestForceHolderId: TEST_PLAYER_IDS[0] },
      }).largestForceHolderId,
    ).toBe(TEST_PLAYER_IDS[0]);

    const surpassed: GameState = {
      ...tied,
      players: {
        ...tied.players,
        [TEST_PLAYER_IDS[1]]: { ...tied.players[TEST_PLAYER_IDS[1]]!, playedForceCards: 4 },
      },
      bonuses: { ...tied.bonuses, largestForceHolderId: TEST_PLAYER_IDS[0] },
    };
    expect(calculateBonusHolders(surpassed).largestForceHolderId).toBe(TEST_PLAYER_IDS[1]);
  });

  it('separates public points from hidden victory-card points in a complete breakdown', () => {
    const charterId = cardInstanceId('score-charter');
    const state = graphState([], {
      0: { ownerId: TEST_PLAYER_IDS[0], type: 'HOUSE' },
      1: { ownerId: TEST_PLAYER_IDS[0], type: 'MANSION' },
    });
    const scored: GameState = {
      ...state,
      progressCards: {
        [charterId]: {
          instanceId: charterId,
          definitionId: PROGRESS_CARD_IDS.chapel,
          ownerId: TEST_PLAYER_IDS[0],
          purchasedTurn: 1,
          playedTurn: null,
        },
      },
      bonuses: {
        longestRoadHolderId: TEST_PLAYER_IDS[0],
        largestForceHolderId: TEST_PLAYER_IDS[0],
      },
    };
    expect(calculateScoreBreakdown(scored, TEST_PLAYER_IDS[0])).toEqual({
      houses: 1,
      cities: 2,
      buildings: 3,
      longestRoad: 2,
      largestForce: 2,
      victoryCards: 1,
      metropolises: 0,
      merchant: 0,
      defenderPoints: 0,
      progressCards: 1,
      total: 8,
    });
    expect(calculatePublicScore(scored, TEST_PLAYER_IDS[0])).toBe(7);
    expect(calculateScore(scored, TEST_PLAYER_IDS[0])).toBe(8);
  });

  it('awards Longest Road atomically when a normal build reaches five', () => {
    const base = graphState(
      [...ownedLine(0, 4, TEST_PLAYER_IDS[0]), { first: 4, second: 5, ownerId: null }],
      { 0: { ownerId: TEST_PLAYER_IDS[0], type: 'HOUSE' } },
    );
    const player = base.players[TEST_PLAYER_IDS[0]]!;
    const state: GameState = {
      ...base,
      players: {
        ...base.players,
        [TEST_PLAYER_IDS[0]]: {
          ...player,
          resources: resourceBundle([
            [RESOURCE_IDS.wood, 1],
            [RESOURCE_IDS.brick, 1],
          ]),
        },
      },
    };
    const fifthEdge = edgeId('score-e4');
    const result = dispatch(state, {
      id: actionId('claim-longest-road'),
      type: 'BUILD_ROAD',
      actorId: TEST_PLAYER_IDS[0],
      edgeId: fifthEdge,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.bonuses.longestRoadHolderId).toBe(TEST_PLAYER_IDS[0]);
    expect(result.events.map((event) => event.type)).toEqual([
      'RESOURCES_SPENT',
      'ROAD_BUILT',
      'LONGEST_ROAD_CHANGED',
      'SCORE_CHANGED',
    ]);
    expect(calculateLongestRoadLength(result.state, TEST_PLAYER_IDS[0])).toBe(5);
  });

  it('recalculates and removes Longest Road when an opponent building splits it', () => {
    const base = graphState([
      ...ownedLine(0, 5, TEST_PLAYER_IDS[1]),
      { first: 2, second: 100, ownerId: TEST_PLAYER_IDS[0] },
    ]);
    const state: GameState = {
      ...base,
      bonuses: { ...base.bonuses, longestRoadHolderId: TEST_PLAYER_IDS[1] },
      players: {
        ...base.players,
        [TEST_PLAYER_IDS[0]]: {
          ...base.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([
            [RESOURCE_IDS.wood, 1],
            [RESOURCE_IDS.brick, 1],
            [RESOURCE_IDS.grain, 1],
            [RESOURCE_IDS.livestock, 1],
          ]),
        },
      },
    };
    const result = dispatch(state, {
      id: actionId('split-longest-road'),
      type: 'BUILD_HOUSE',
      actorId: TEST_PLAYER_IDS[0],
      vertexId: vertexId('score-v2'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.bonuses.longestRoadHolderId).toBeNull();
    expect(calculateLongestRoadLength(result.state, TEST_PLAYER_IDS[1])).toBe(3);
    expect(result.events).toContainEqual({ type: 'LONGEST_ROAD_CHANGED', playerId: null });
    expect(result.events).toContainEqual({
      type: 'SCORE_CHANGED',
      playerId: TEST_PLAYER_IDS[1],
      score: 0,
    });
  });
});
