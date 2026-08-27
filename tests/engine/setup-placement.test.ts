import { describe, expect, it } from 'vitest';

import { RESOURCES } from '../../src/engine/content/resources';
import type { PlayerCount } from '../../src/engine/content/types';
import type { GameAction } from '../../src/engine/core/actions';
import { createGame } from '../../src/engine/core/create-game';
import { dispatch } from '../../src/engine/core/game-engine';
import type { GameState } from '../../src/engine/core/game-state';
import { actionId } from '../../src/engine/core/ids';
import {
  getLegalSetupHouseVertexIds,
  getLegalSetupRoadEdgeIds,
  orderedPlayerIds,
  setupOrder,
} from '../../src/engine/rules/setup-rules';
import { createTestConfig } from '../helpers/game-state';

function createSetupState(playerCount: PlayerCount = 2): GameState {
  const result = createGame({
    ...createTestConfig(playerCount),
    seed: `setup-${playerCount}-player-seed`,
  });
  if (!result.ok) throw new Error(result.issues.map((entry) => entry.message).join(', '));
  return result.state;
}

function setupAction(
  state: GameState,
  serial: number,
  targetId: string,
): Extract<GameAction, { readonly type: 'PLACE_SETUP_HOUSE' | 'PLACE_SETUP_ROAD' }> {
  const actorId = state.turn.activePlayerId;
  if (actorId === null) throw new Error('Setup state has no active player.');

  if (state.turn.phase === 'SETUP_PLACE_HOUSE') {
    return {
      id: actionId(`setup-house-${serial}`),
      type: 'PLACE_SETUP_HOUSE',
      actorId,
      vertexId: targetId as ReturnType<typeof getLegalSetupHouseVertexIds>[number],
    };
  }
  if (state.turn.phase === 'SETUP_PLACE_ROAD') {
    return {
      id: actionId(`setup-road-${serial}`),
      type: 'PLACE_SETUP_ROAD',
      actorId,
      edgeId: targetId as ReturnType<typeof getLegalSetupRoadEdgeIds>[number],
    };
  }
  throw new Error(`Cannot create a setup action during ${state.turn.phase}.`);
}

function totalResources(bundle: GameState['bank']): number {
  return RESOURCES.reduce((total, resource) => total + (bundle[resource.id] ?? 0), 0);
}

describe('initial placement', () => {
  it('places a house, forces an attached road, and advances to the next setup player', () => {
    const state = createSetupState();
    const firstPlayerId = state.turn.activePlayerId;
    const houseTarget = getLegalSetupHouseVertexIds(state)[0];
    if (firstPlayerId === null || houseTarget === undefined) throw new Error('No setup target.');

    const houseResult = dispatch(state, {
      id: actionId('first-house'),
      type: 'PLACE_SETUP_HOUSE',
      actorId: firstPlayerId,
      vertexId: houseTarget,
    });
    expect(houseResult.ok).toBe(true);
    if (!houseResult.ok) return;
    expect(houseResult.state.turn.phase).toBe('SETUP_PLACE_ROAD');
    expect(houseResult.state.turn.setupPlacementVertexId).toBe(houseTarget);
    expect(houseResult.state.board.vertices[houseTarget]?.building).toEqual({
      ownerId: firstPlayerId,
      type: 'HOUSE',
    });
    expect(houseResult.state.players[firstPlayerId]?.housesRemaining).toBe(4);
    expect(houseResult.events.map((event) => event.type)).toEqual(['BUILDING_PLACED']);

    const legalRoads = getLegalSetupRoadEdgeIds(houseResult.state);
    expect(legalRoads.length).toBeGreaterThanOrEqual(2);
    const disconnectedEdge = Object.values(houseResult.state.board.edges).find(
      (edge) => !legalRoads.includes(edge.id),
    );
    if (disconnectedEdge === undefined || legalRoads[0] === undefined) {
      throw new Error('No disconnected or legal setup edge.');
    }
    const rejected = dispatch(houseResult.state, {
      id: actionId('disconnected-road'),
      type: 'PLACE_SETUP_ROAD',
      actorId: firstPlayerId,
      edgeId: disconnectedEdge.id,
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.state).toBe(houseResult.state);
    if (!rejected.ok) expect(rejected.error.code).toBe('EDGE_NOT_CONNECTED');

    const order = setupOrder(houseResult.state);
    const roadResult = dispatch(houseResult.state, {
      id: actionId('first-road'),
      type: 'PLACE_SETUP_ROAD',
      actorId: firstPlayerId,
      edgeId: legalRoads[0],
    });
    expect(roadResult.ok).toBe(true);
    if (!roadResult.ok) return;
    expect(roadResult.state.turn.phase).toBe('SETUP_PLACE_HOUSE');
    expect(roadResult.state.turn.activePlayerId).toBe(order[1]);
    expect(roadResult.state.board.edges[legalRoads[0]]?.roadOwnerId).toBe(firstPlayerId);
    expect(roadResult.events.map((event) => event.type)).toEqual([
      'ROAD_BUILT',
      'SETUP_PLAYER_ADVANCED',
    ]);

    const neighborId = state.board.vertices[houseTarget]?.adjacentVertexIds[0];
    if (neighborId === undefined) throw new Error('House has no neighboring vertex.');
    const distanceViolation = dispatch(roadResult.state, {
      id: actionId('adjacent-house'),
      type: 'PLACE_SETUP_HOUSE',
      actorId: order[1] ?? firstPlayerId,
      vertexId: neighborId,
    });
    expect(distanceViolation.ok).toBe(false);
    if (!distanceViolation.ok) {
      expect(distanceViolation.error.code).toBe('DISTANCE_RULE_VIOLATION');
    }
  });

  it('rejects an out-of-turn setup action without mutation', () => {
    const state = createSetupState();
    const order = orderedPlayerIds(state);
    const target = getLegalSetupHouseVertexIds(state)[0];
    if (order[1] === undefined || target === undefined) throw new Error('No setup target.');

    const result = dispatch(state, {
      id: actionId('wrong-player-house'),
      type: 'PLACE_SETUP_HOUSE',
      actorId: order[1],
      vertexId: target,
    });

    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    if (!result.ok) expect(result.error.code).toBe('NOT_YOUR_TURN');
  });

  it.each([2, 3, 4] as const)(
    'completes the snake setup and conserves resources for %i players',
    (playerCount) => {
      let state = createSetupState(playerCount);
      const initialBankTotal = totalResources(state.bank);
      let serial = 0;
      let finalEvents: readonly string[] = [];

      while (state.turn.phase === 'SETUP_PLACE_HOUSE' || state.turn.phase === 'SETUP_PLACE_ROAD') {
        const targets =
          state.turn.phase === 'SETUP_PLACE_HOUSE'
            ? getLegalSetupHouseVertexIds(state)
            : getLegalSetupRoadEdgeIds(state);
        const target = targets[0];
        if (target === undefined) throw new Error(`No legal target during ${state.turn.phase}.`);
        const phaseBeforeAction = state.turn.phase;
        const placementIndex = state.turn.setupPlacementIndex;
        const actorId = state.turn.activePlayerId;
        if (actorId === null) throw new Error('Setup has no active player.');
        const resourcesBeforeAction = totalResources(state.players[actorId]?.resources ?? {});
        const expectedStartingResources =
          phaseBeforeAction === 'SETUP_PLACE_HOUSE' &&
          placementIndex !== null &&
          placementIndex >= playerCount
            ? (state.board.vertices[target]?.adjacentHexIds ?? []).filter((hexId) => {
                const hex = state.board.hexes[hexId];
                return (
                  hex !== undefined && hex.id !== state.board.robberHexId && hex.resourceId !== null
                );
              }).length
            : 0;
        const result = dispatch(state, setupAction(state, serial, target));
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
        if (phaseBeforeAction === 'SETUP_PLACE_HOUSE') {
          expect(totalResources(result.state.players[actorId]?.resources ?? {})).toBe(
            resourcesBeforeAction + expectedStartingResources,
          );
        }
        state = result.state;
        finalEvents = result.events.map((event) => event.type);
        serial += 1;
      }

      const playerIds = orderedPlayerIds(state);
      const buildings = Object.values(state.board.vertices).filter(
        (vertex) => vertex.building !== null,
      );
      const roads = Object.values(state.board.edges).filter((edge) => edge.roadOwnerId !== null);
      const playerResourceTotal = Object.values(state.players).reduce(
        (total, player) => total + totalResources(player.resources),
        0,
      );

      expect(state.turn.phase).toBe('WAITING_FOR_ROLL');
      expect(state.turn.activePlayerId).toBe(playerIds[0]);
      expect(state.turn.setupPlacementIndex).toBeNull();
      expect(state.turn.setupPlacementVertexId).toBeNull();
      expect(buildings).toHaveLength(playerCount * 2);
      expect(roads).toHaveLength(playerCount * 2);
      expect(state.actionHistory).toHaveLength(playerCount * 4);
      expect(finalEvents).toEqual(['ROAD_BUILT', 'SETUP_COMPLETED', 'TURN_STARTED']);
      expect(playerResourceTotal).toBeGreaterThan(0);
      expect(initialBankTotal - totalResources(state.bank)).toBe(playerResourceTotal);

      for (const playerId of playerIds) {
        expect(buildings.filter((vertex) => vertex.building?.ownerId === playerId)).toHaveLength(2);
        expect(roads.filter((edge) => edge.roadOwnerId === playerId)).toHaveLength(2);
        expect(state.players[playerId]).toMatchObject({ housesRemaining: 3, roadsRemaining: 13 });
      }

      for (const vertex of buildings) {
        expect(
          vertex.adjacentVertexIds.every(
            (neighborId) => state.board.vertices[neighborId]?.building === null,
          ),
        ).toBe(true);
      }
    },
  );
});
