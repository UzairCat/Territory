import { RESOURCES } from '../content/resources';
import { resourceBundle } from '../content/types';
import type { ResourceBundle } from '../content/types';
import type { GameAction } from '../core/actions';
import { acceptAction, rejectAction } from '../core/dispatch-result';
import type { DispatchResult } from '../core/dispatch-result';
import type { GameEvent } from '../core/events';
import type { GameState, PlayerState, VertexState } from '../core/game-state';
import type { EdgeId, PlayerId, ResourceId, VertexId } from '../core/ids';
import { KN_MODE_ID } from '../modes/kn';

export type SetupRound = 'FORWARD' | 'REVERSE';

export interface SetupProgress {
  readonly placementNumber: number;
  readonly totalPlacements: number;
  readonly round: SetupRound;
}

export function createSetupOrder(playerIds: readonly PlayerId[]): readonly PlayerId[] {
  return [...playerIds, ...[...playerIds].reverse()];
}

export function orderedPlayerIds(state: GameState): readonly PlayerId[] {
  return [...state.config.players]
    .sort((first, second) => first.order - second.order)
    .map((player) => player.id);
}

export function setupOrder(state: GameState): readonly PlayerId[] {
  return createSetupOrder(orderedPlayerIds(state));
}

export function getSetupProgress(state: GameState): SetupProgress | null {
  const index = state.turn.setupPlacementIndex;
  if (index === null) return null;

  return {
    placementNumber: index + 1,
    totalPlacements: state.config.playerCount * 2,
    round: index < state.config.playerCount ? 'FORWARD' : 'REVERSE',
  };
}

export function getSetupBuildingType(state: GameState): 'HOUSE' | 'MANSION' {
  const placementIndex = state.turn.setupPlacementIndex ?? 0;
  return state.config.modeId === KN_MODE_ID && placementIndex >= state.config.playerCount
    ? 'MANSION'
    : 'HOUSE';
}

export function isLegalSetupHouseVertex(state: GameState, vertexId: VertexId): boolean {
  const vertex = state.board.vertices[vertexId];
  if (vertex === undefined || vertex.building !== null || (vertex.knightId ?? null) !== null)
    return false;

  return vertex.adjacentVertexIds.every(
    (adjacentId) => state.board.vertices[adjacentId]?.building === null,
  );
}

export function getLegalSetupHouseVertexIds(state: GameState): readonly VertexId[] {
  const player =
    state.turn.activePlayerId === null ? undefined : state.players[state.turn.activePlayerId];
  if (
    state.turn.phase !== 'SETUP_PLACE_HOUSE' ||
    player === undefined ||
    (getSetupBuildingType(state) === 'HOUSE'
      ? player.housesRemaining < 1
      : player.mansionsRemaining < 1)
  ) {
    return [];
  }

  return Object.values(state.board.vertices)
    .filter((vertex) => isLegalSetupHouseVertex(state, vertex.id))
    .map((vertex) => vertex.id);
}

export function isLegalSetupRoadEdge(state: GameState, edgeId: EdgeId): boolean {
  const edge = state.board.edges[edgeId];
  const setupVertexId = state.turn.setupPlacementVertexId;
  const setupVertex = setupVertexId === null ? undefined : state.board.vertices[setupVertexId];
  const activePlayerId = state.turn.activePlayerId;
  return (
    edge !== undefined &&
    edge.roadOwnerId === null &&
    setupVertexId !== null &&
    activePlayerId !== null &&
    setupVertex?.building?.ownerId === activePlayerId &&
    setupVertex?.building !== null &&
    (edge.vertexAId === setupVertexId || edge.vertexBId === setupVertexId)
  );
}

export function getLegalSetupRoadEdgeIds(state: GameState): readonly EdgeId[] {
  const player =
    state.turn.activePlayerId === null ? undefined : state.players[state.turn.activePlayerId];
  if (
    state.turn.phase !== 'SETUP_PLACE_ROAD' ||
    player === undefined ||
    player.roadsRemaining < 1
  ) {
    return [];
  }

  return Object.values(state.board.edges)
    .filter((edge) => isLegalSetupRoadEdge(state, edge.id))
    .map((edge) => edge.id);
}

function setupActorError(
  state: GameState,
  actorId: PlayerId,
  expectedPhase: 'SETUP_PLACE_HOUSE' | 'SETUP_PLACE_ROAD',
): Extract<DispatchResult, { readonly ok: false }> | null {
  if (state.turn.phase !== expectedPhase) {
    return rejectAction(state, 'WRONG_PHASE', `This action requires the ${expectedPhase} phase.`);
  }

  if (state.turn.activePlayerId !== actorId) {
    return rejectAction(
      state,
      'NOT_YOUR_TURN',
      'Only the active setup player can place this piece.',
    );
  }

  const index = state.turn.setupPlacementIndex;
  if (index === null || setupOrder(state)[index] !== actorId) {
    return rejectAction(state, 'WRONG_PHASE', 'The setup placement sequence is not active.');
  }

  return null;
}

interface StartingResourceGrant {
  readonly bank: ResourceBundle;
  readonly player: PlayerState;
  readonly resources: ResourceBundle;
}

function grantStartingResources(
  state: GameState,
  player: PlayerState,
  vertex: VertexState,
): StartingResourceGrant {
  const requested = new Map<ResourceId, number>();

  for (const hexId of vertex.adjacentHexIds) {
    const hex = state.board.hexes[hexId];
    if (hex === undefined || hex.id === state.board.robberHexId || hex.resourceId === null)
      continue;
    requested.set(hex.resourceId, (requested.get(hex.resourceId) ?? 0) + 1);
  }

  const grants: (readonly [ResourceId, number])[] = [];
  for (const resource of RESOURCES) {
    const amount = requested.get(resource.id) ?? 0;
    if (amount > 0 && (state.bank[resource.id] ?? 0) >= amount) {
      grants.push([resource.id, amount]);
    }
  }

  const resources = resourceBundle(grants);
  return {
    resources,
    bank: resourceBundle(
      RESOURCES.map((resource) => [
        resource.id,
        (state.bank[resource.id] ?? 0) - (resources[resource.id] ?? 0),
      ]),
    ),
    player: {
      ...player,
      resources: resourceBundle(
        RESOURCES.map((resource) => [
          resource.id,
          (player.resources[resource.id] ?? 0) + (resources[resource.id] ?? 0),
        ]),
      ),
    },
  };
}

export function placeSetupHouse(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'PLACE_SETUP_HOUSE' }>,
): DispatchResult {
  const actorError = setupActorError(state, action.actorId, 'SETUP_PLACE_HOUSE');
  if (actorError !== null) return actorError;

  const player = state.players[action.actorId];
  if (player === undefined) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'The setup player does not exist.');
  }
  const buildingType = getSetupBuildingType(state);
  if (
    (buildingType === 'HOUSE' && player.housesRemaining < 1) ||
    (buildingType === 'MANSION' && player.mansionsRemaining < 1)
  ) {
    return rejectAction(
      state,
      'NO_PIECES_REMAINING',
      `The active player has no ${buildingType === 'HOUSE' ? 'houses' : 'cities'} remaining.`,
    );
  }

  const vertex = state.board.vertices[action.vertexId];
  if (vertex === undefined) {
    return rejectAction(state, 'INVALID_TARGET', 'The selected setup vertex does not exist.');
  }
  if (vertex.building !== null) {
    return rejectAction(state, 'VERTEX_OCCUPIED', 'The selected setup vertex is already occupied.');
  }
  if (!isLegalSetupHouseVertex(state, action.vertexId)) {
    return rejectAction(
      state,
      'DISTANCE_RULE_VIOLATION',
      'A house cannot be placed next to another building.',
    );
  }

  const placementIndex = state.turn.setupPlacementIndex;
  if (placementIndex === null) {
    return rejectAction(state, 'WRONG_PHASE', 'The setup placement sequence is not active.');
  }

  let nextPlayer: PlayerState =
    buildingType === 'HOUSE'
      ? { ...player, housesRemaining: player.housesRemaining - 1 }
      : { ...player, mansionsRemaining: player.mansionsRemaining - 1 };
  let nextBank = state.bank;
  const events: GameEvent[] = [
    {
      type: 'BUILDING_PLACED',
      playerId: action.actorId,
      vertexId: action.vertexId,
      buildingType,
    },
  ];

  if (placementIndex >= state.config.playerCount) {
    const grant = grantStartingResources(state, nextPlayer, vertex);
    nextPlayer = grant.player;
    nextBank = grant.bank;
    if (Object.values(grant.resources).some((amount) => (amount ?? 0) > 0)) {
      events.push({
        type: 'RESOURCES_PRODUCED',
        source: 'SETUP',
        rollTotal: null,
        grants: { [action.actorId]: grant.resources },
        unavailableResourceIds: [],
      });
    }
  }

  const nextState: GameState = {
    ...state,
    players: { ...state.players, [action.actorId]: nextPlayer },
    board: {
      ...state.board,
      vertices: {
        ...state.board.vertices,
        [action.vertexId]: {
          ...vertex,
          building: { ownerId: action.actorId, type: buildingType },
        },
      },
    },
    bank: nextBank,
    turn: {
      ...state.turn,
      phase: 'SETUP_PLACE_ROAD',
      setupPlacementVertexId: action.vertexId,
    },
  };

  return acceptAction(state, action, nextState, events);
}

export function placeSetupRoad(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'PLACE_SETUP_ROAD' }>,
): DispatchResult {
  const actorError = setupActorError(state, action.actorId, 'SETUP_PLACE_ROAD');
  if (actorError !== null) return actorError;

  const player = state.players[action.actorId];
  if (player === undefined) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'The setup player does not exist.');
  }
  if (player.roadsRemaining < 1) {
    return rejectAction(state, 'NO_PIECES_REMAINING', 'The active player has no roads remaining.');
  }

  const edge = state.board.edges[action.edgeId];
  if (edge === undefined) {
    return rejectAction(state, 'INVALID_TARGET', 'The selected setup edge does not exist.');
  }
  if (edge.roadOwnerId !== null) {
    return rejectAction(state, 'EDGE_OCCUPIED', 'The selected setup edge already has a road.');
  }

  if (!isLegalSetupRoadEdge(state, action.edgeId)) {
    return rejectAction(
      state,
      'EDGE_NOT_CONNECTED',
      'The setup road must touch the house just placed.',
    );
  }

  const placementIndex = state.turn.setupPlacementIndex;
  if (placementIndex === null) {
    return rejectAction(state, 'WRONG_PHASE', 'The setup placement sequence is not active.');
  }
  const order = setupOrder(state);
  const nextPlacementIndex = placementIndex + 1;
  const setupComplete = nextPlacementIndex >= order.length;
  const nextPlayerId = setupComplete ? order[0] : order[nextPlacementIndex];
  if (nextPlayerId === undefined) {
    return rejectAction(state, 'WRONG_PHASE', 'The setup placement sequence has no next player.');
  }

  const events: GameEvent[] = [
    { type: 'ROAD_BUILT', playerId: action.actorId, edgeId: action.edgeId },
  ];
  if (setupComplete) {
    events.push(
      { type: 'SETUP_COMPLETED', firstPlayerId: nextPlayerId },
      { type: 'TURN_STARTED', playerId: nextPlayerId, turnNumber: state.turn.turnNumber },
    );
  } else {
    events.push({
      type: 'SETUP_PLAYER_ADVANCED',
      playerId: nextPlayerId,
      placementNumber: nextPlacementIndex + 1,
      totalPlacements: order.length,
    });
  }

  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: { ...player, roadsRemaining: player.roadsRemaining - 1 },
    },
    board: {
      ...state.board,
      edges: {
        ...state.board.edges,
        [action.edgeId]: { ...edge, roadOwnerId: action.actorId },
      },
    },
    turn: {
      ...state.turn,
      activePlayerId: nextPlayerId,
      phase: setupComplete ? 'WAITING_FOR_ROLL' : 'SETUP_PLACE_HOUSE',
      setupPlacementIndex: setupComplete ? null : nextPlacementIndex,
      setupPlacementVertexId: null,
    },
  };

  return acceptAction(state, action, nextState, events);
}
