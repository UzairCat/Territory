import { BUILDING_DEFINITIONS } from '../content/buildings';
import type { BuildingType, ResourceBundle } from '../content/types';
import type { GameAction } from '../core/actions';
import { acceptAction, rejectAction } from '../core/dispatch-result';
import type { DispatchResult } from '../core/dispatch-result';
import type { RuleError } from '../core/errors';
import type { GameEvent } from '../core/events';
import type { GameState, PlayerState } from '../core/game-state';
import type { EdgeId, PlayerId, VertexId } from '../core/ids';
import { addResourceBundles, canAfford, subtractResourceBundles } from './resource-rules';

export type ConstructionType = Extract<BuildingType, 'ROAD' | 'HOUSE' | 'MANSION'>;

export interface ConstructionAvailability {
  readonly type: ConstructionType;
  readonly cost: ResourceBundle;
  readonly canBuild: boolean;
  readonly reason: string | null;
  readonly targetCount: number;
}

function remainingPieces(player: PlayerState, type: ConstructionType): number {
  if (type === 'ROAD') return player.roadsRemaining;
  if (type === 'HOUSE') return player.housesRemaining;
  return player.mansionsRemaining;
}

function constructionContextError(state: GameState, actorId: PlayerId): RuleError | null {
  if (state.turn.phase !== 'ACTION_PHASE') {
    return { code: 'WRONG_PHASE', message: 'Construction is only available during action phase.' };
  }
  if (state.turn.activePlayerId !== actorId) {
    return { code: 'NOT_YOUR_TURN', message: 'Only the active player can construct pieces.' };
  }
  if (state.pendingInteraction !== null) {
    return {
      code: 'PENDING_INTERACTION_REQUIRED',
      message: 'Resolve the current interaction before constructing a piece.',
    };
  }

  const player = state.players[actorId];
  if (player === undefined) {
    return { code: 'NOT_YOUR_TURN', message: 'The active construction player does not exist.' };
  }

  return null;
}

function constructionPrerequisiteError(
  state: GameState,
  actorId: PlayerId,
  type: ConstructionType,
): RuleError | null {
  const contextError = constructionContextError(state, actorId);
  if (contextError !== null) return contextError;

  const player = state.players[actorId];
  if (player === undefined) {
    return { code: 'NOT_YOUR_TURN', message: 'The active construction player does not exist.' };
  }
  if (remainingPieces(player, type) < 1) {
    return {
      code: 'NO_PIECES_REMAINING',
      message: `The active player has no ${BUILDING_DEFINITIONS[type].displayName.toLowerCase()} pieces remaining.`,
    };
  }

  const cost = state.config.rules.buildingCosts[type];
  if (!canAfford(player.resources, cost)) {
    return {
      code: 'INSUFFICIENT_RESOURCES',
      message: `The active player cannot afford a ${BUILDING_DEFINITIONS[type].displayName.toLowerCase()}.`,
    };
  }

  return null;
}

function roadConnectsAtVertex(state: GameState, playerId: PlayerId, vertexId: VertexId): boolean {
  const vertex = state.board.vertices[vertexId];
  if (vertex === undefined) return false;
  const occupyingKnight = Object.values(state.players)
    .flatMap((player) => player.knights)
    .find((knight) => knight.id === vertex.knightId);
  if (occupyingKnight !== undefined && occupyingKnight.ownerId !== playerId) return false;
  if (vertex.building !== null) return vertex.building.ownerId === playerId;
  return vertex.connectedEdgeIds.some(
    (connectedEdgeId) => state.board.edges[connectedEdgeId]?.roadOwnerId === playerId,
  );
}

export function isLegalRoadEdge(state: GameState, playerId: PlayerId, edgeId: EdgeId): boolean {
  const edge = state.board.edges[edgeId];
  return (
    edge !== undefined &&
    edge.roadOwnerId === null &&
    (roadConnectsAtVertex(state, playerId, edge.vertexAId) ||
      roadConnectsAtVertex(state, playerId, edge.vertexBId))
  );
}

export function isLegalHouseVertex(
  state: GameState,
  playerId: PlayerId,
  vertexId: VertexId,
): boolean {
  const vertex = state.board.vertices[vertexId];
  return (
    vertex !== undefined &&
    vertex.building === null &&
    (vertex.knightId ?? null) === null &&
    vertex.adjacentVertexIds.every(
      (adjacentId) => state.board.vertices[adjacentId]?.building === null,
    ) &&
    vertex.connectedEdgeIds.some(
      (connectedEdgeId) => state.board.edges[connectedEdgeId]?.roadOwnerId === playerId,
    )
  );
}

export function isLegalMansionVertex(
  state: GameState,
  playerId: PlayerId,
  vertexId: VertexId,
): boolean {
  const building = state.board.vertices[vertexId]?.building;
  const forcedRebuilds = state.players[playerId]?.forcedMansionRebuildVertexIds ?? [];
  return (
    building?.ownerId === playerId &&
    building.type === 'HOUSE' &&
    (forcedRebuilds.length === 0 || forcedRebuilds.includes(vertexId))
  );
}

function validRoadTargets(state: GameState, playerId: PlayerId): readonly EdgeId[] {
  return Object.values(state.board.edges)
    .filter((edge) => isLegalRoadEdge(state, playerId, edge.id))
    .map((edge) => edge.id);
}

function validHouseTargets(state: GameState, playerId: PlayerId): readonly VertexId[] {
  return Object.values(state.board.vertices)
    .filter((vertex) => isLegalHouseVertex(state, playerId, vertex.id))
    .map((vertex) => vertex.id);
}

function validMansionTargets(state: GameState, playerId: PlayerId): readonly VertexId[] {
  return Object.values(state.board.vertices)
    .filter((vertex) => isLegalMansionVertex(state, playerId, vertex.id))
    .map((vertex) => vertex.id);
}

/**
 * Structurally legal targets are intentionally independent from the player's hand and remaining
 * supply. They power board hover affordances; the purchase itself still runs every prerequisite.
 */
export function getPotentialRoadEdgeIds(state: GameState, playerId: PlayerId): readonly EdgeId[] {
  return constructionContextError(state, playerId) === null
    ? validRoadTargets(state, playerId)
    : [];
}

export function getPotentialHouseVertexIds(
  state: GameState,
  playerId: PlayerId,
): readonly VertexId[] {
  return constructionContextError(state, playerId) === null
    ? validHouseTargets(state, playerId)
    : [];
}

export function getPotentialMansionVertexIds(
  state: GameState,
  playerId: PlayerId,
): readonly VertexId[] {
  return constructionContextError(state, playerId) === null
    ? validMansionTargets(state, playerId)
    : [];
}

export function getValidRoadEdgeIds(state: GameState, playerId: PlayerId): readonly EdgeId[] {
  return constructionPrerequisiteError(state, playerId, 'ROAD') === null
    ? validRoadTargets(state, playerId)
    : [];
}

export function getValidHouseVertexIds(state: GameState, playerId: PlayerId): readonly VertexId[] {
  return constructionPrerequisiteError(state, playerId, 'HOUSE') === null
    ? validHouseTargets(state, playerId)
    : [];
}

export function getValidMansionVertexIds(
  state: GameState,
  playerId: PlayerId,
): readonly VertexId[] {
  return constructionPrerequisiteError(state, playerId, 'MANSION') === null
    ? validMansionTargets(state, playerId)
    : [];
}

function targetCount(state: GameState, playerId: PlayerId, type: ConstructionType): number {
  if (type === 'ROAD') return validRoadTargets(state, playerId).length;
  if (type === 'HOUSE') return validHouseTargets(state, playerId).length;
  return validMansionTargets(state, playerId).length;
}

export function getConstructionAvailability(
  state: GameState,
  playerId: PlayerId,
  type: ConstructionType,
): ConstructionAvailability {
  const cost = state.config.rules.buildingCosts[type];
  const prerequisiteError = constructionPrerequisiteError(state, playerId, type);
  if (prerequisiteError !== null) {
    return { type, cost, canBuild: false, reason: prerequisiteError.message, targetCount: 0 };
  }

  const availableTargetCount = targetCount(state, playerId, type);
  return {
    type,
    cost,
    canBuild: availableTargetCount > 0,
    reason: availableTargetCount > 0 ? null : 'No legal placement is currently available.',
    targetCount: availableTargetCount,
  };
}

interface PaidConstruction {
  readonly player: PlayerState;
  readonly bank: ResourceBundle;
  readonly cost: ResourceBundle;
}

function payConstructionCost(
  state: GameState,
  player: PlayerState,
  type: ConstructionType,
): PaidConstruction {
  const cost = state.config.rules.buildingCosts[type];
  return {
    cost,
    player: { ...player, resources: subtractResourceBundles(player.resources, cost) },
    bank: addResourceBundles(state.bank, cost),
  };
}

function rejectPrerequisite(
  state: GameState,
  actorId: PlayerId,
  type: ConstructionType,
): Extract<DispatchResult, { readonly ok: false }> | null {
  const error = constructionPrerequisiteError(state, actorId, type);
  return error === null ? null : rejectAction(state, error.code, error.message);
}

export function buildRoad(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'BUILD_ROAD' }>,
): DispatchResult {
  const prerequisiteError = rejectPrerequisite(state, action.actorId, 'ROAD');
  if (prerequisiteError !== null) return prerequisiteError;

  const edge = state.board.edges[action.edgeId];
  if (edge === undefined) {
    return rejectAction(state, 'INVALID_TARGET', 'The selected road edge does not exist.');
  }
  if (edge.roadOwnerId !== null) {
    return rejectAction(state, 'EDGE_OCCUPIED', 'The selected edge already contains a road.');
  }
  if (!isLegalRoadEdge(state, action.actorId, action.edgeId)) {
    return rejectAction(
      state,
      'EDGE_NOT_CONNECTED',
      'A new road must connect to your unblocked road or building network.',
    );
  }

  const player = state.players[action.actorId];
  if (player === undefined) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'The active construction player does not exist.');
  }
  const payment = payConstructionCost(state, player, 'ROAD');
  const events: GameEvent[] = [
    { type: 'RESOURCES_SPENT', playerId: action.actorId, resources: payment.cost, reason: 'ROAD' },
    { type: 'ROAD_BUILT', playerId: action.actorId, edgeId: action.edgeId },
  ];
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: { ...payment.player, roadsRemaining: player.roadsRemaining - 1 },
    },
    bank: payment.bank,
    board: {
      ...state.board,
      edges: {
        ...state.board.edges,
        [action.edgeId]: { ...edge, roadOwnerId: action.actorId },
      },
    },
  };
  return acceptAction(state, action, nextState, events);
}

export function buildHouse(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'BUILD_HOUSE' }>,
): DispatchResult {
  const prerequisiteError = rejectPrerequisite(state, action.actorId, 'HOUSE');
  if (prerequisiteError !== null) return prerequisiteError;

  const vertex = state.board.vertices[action.vertexId];
  if (vertex === undefined) {
    return rejectAction(state, 'INVALID_TARGET', 'The selected house vertex does not exist.');
  }
  if (vertex.building !== null) {
    return rejectAction(
      state,
      'VERTEX_OCCUPIED',
      'The selected vertex already contains a building.',
    );
  }
  if (
    vertex.adjacentVertexIds.some(
      (adjacentId) => state.board.vertices[adjacentId]?.building !== null,
    )
  ) {
    return rejectAction(
      state,
      'DISTANCE_RULE_VIOLATION',
      'A house cannot be placed next to another building.',
    );
  }
  if (!isLegalHouseVertex(state, action.actorId, action.vertexId)) {
    return rejectAction(
      state,
      'ROAD_CONNECTION_REQUIRED',
      'A normal house must connect to one of your roads.',
    );
  }

  const player = state.players[action.actorId];
  if (player === undefined) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'The active construction player does not exist.');
  }
  const payment = payConstructionCost(state, player, 'HOUSE');
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: { ...payment.player, housesRemaining: player.housesRemaining - 1 },
    },
    bank: payment.bank,
    board: {
      ...state.board,
      vertices: {
        ...state.board.vertices,
        [action.vertexId]: {
          ...vertex,
          building: { ownerId: action.actorId, type: 'HOUSE' },
        },
      },
    },
  };
  const events: GameEvent[] = [
    { type: 'RESOURCES_SPENT', playerId: action.actorId, resources: payment.cost, reason: 'HOUSE' },
    {
      type: 'BUILDING_PLACED',
      playerId: action.actorId,
      vertexId: action.vertexId,
      buildingType: 'HOUSE',
    },
  ];
  return acceptAction(state, action, nextState, events);
}

export function upgradeMansion(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'UPGRADE_MANSION' }>,
): DispatchResult {
  const prerequisiteError = rejectPrerequisite(state, action.actorId, 'MANSION');
  if (prerequisiteError !== null) return prerequisiteError;

  const vertex = state.board.vertices[action.vertexId];
  if (vertex === undefined) {
    return rejectAction(state, 'INVALID_TARGET', 'The selected city vertex does not exist.');
  }
  if (!isLegalMansionVertex(state, action.actorId, action.vertexId)) {
    return rejectAction(
      state,
      'HOUSE_REQUIRED_FOR_UPGRADE',
      'A city can only replace one of your houses.',
    );
  }

  const player = state.players[action.actorId];
  if (player === undefined) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'The active construction player does not exist.');
  }
  if (
    player.forcedMansionRebuildVertexIds.length > 0 &&
    !player.forcedMansionRebuildVertexIds.includes(action.vertexId)
  ) {
    return rejectAction(
      state,
      'INVALID_TARGET',
      'Rebuild the City lost to the barbarians before upgrading a different House.',
    );
  }
  const payment = payConstructionCost(state, player, 'MANSION');
  const rebuildingVirtualHouse = player.forcedMansionRebuildVertexIds.includes(action.vertexId);
  const forcedMansionRebuildVertexIds = player.forcedMansionRebuildVertexIds.filter(
    (vertexId) => vertexId !== action.vertexId,
  );
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: {
        ...payment.player,
        housesRemaining: rebuildingVirtualHouse
          ? player.housesRemaining
          : player.housesRemaining + 1,
        mansionsRemaining: player.mansionsRemaining - 1,
        forcedMansionRebuildVertexIds,
        mustRebuildDestroyedMansion: forcedMansionRebuildVertexIds.length > 0,
      },
    },
    bank: payment.bank,
    board: {
      ...state.board,
      vertices: {
        ...state.board.vertices,
        [action.vertexId]: { ...vertex, building: { ownerId: action.actorId, type: 'MANSION' } },
      },
    },
  };
  const events: GameEvent[] = [
    {
      type: 'RESOURCES_SPENT',
      playerId: action.actorId,
      resources: payment.cost,
      reason: 'MANSION',
    },
    { type: 'BUILDING_UPGRADED', playerId: action.actorId, vertexId: action.vertexId },
  ];
  return acceptAction(state, action, nextState, events);
}
