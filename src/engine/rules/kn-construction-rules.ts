import { COMMODITY_IDS } from '../content/commodities';
import { RESOURCE_IDS } from '../content/resources';
import { resourceBundle } from '../content/types';
import type { KNProgressFamily } from '../content/types';
import type { GameAction } from '../core/actions';
import { acceptAction, rejectAction } from '../core/dispatch-result';
import type { DispatchResult } from '../core/dispatch-result';
import type { GameEvent } from '../core/events';
import type { GameState, KnightState, PlayerState } from '../core/game-state';
import type { KnightId, PlayerId, VertexId } from '../core/ids';
import { knightId as createKnightId } from '../core/ids';
import {
  addResourceBundles,
  canAfford,
  playerHand,
  subtractResourceBundles,
  withPlayerHand,
} from './resource-rules';

interface KNResolution {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export const KNIGHT_COST = resourceBundle([
  [RESOURCE_IDS.livestock, 1],
  [RESOURCE_IDS.ore, 1],
]);
export const KNIGHT_ACTIVATION_COST = resourceBundle([[RESOURCE_IDS.grain, 1]]);
export const WALL_COST = resourceBundle([[RESOURCE_IDS.brick, 2]]);

const TRACK_COMMODITY: Readonly<
  Record<KNProgressFamily, (typeof COMMODITY_IDS)[keyof typeof COMMODITY_IDS]>
> = {
  SCIENCE: COMMODITY_IDS.paper,
  TRADE: COMMODITY_IDS.cloth,
  POLITICS: COMMODITY_IDS.coin,
};

function actionContextError(state: GameState, playerId: PlayerId): string | null {
  if (state.kn === null) return 'This action is only available in K+N mode.';
  if (state.turn.activePlayerId !== playerId)
    return 'Only the active player can perform this action.';
  if (state.turn.phase !== 'ACTION_PHASE') return 'This action is only available after rolling.';
  if (state.pendingInteraction !== null) return 'Resolve the current interaction first.';
  return null;
}

function vertexBlockedByOpponent(
  state: GameState,
  playerId: PlayerId,
  vertexId: VertexId,
): boolean {
  const vertex = state.board.vertices[vertexId];
  if (vertex === undefined) return true;
  if (vertex.building !== null && vertex.building.ownerId !== playerId) return true;
  const knight = Object.values(state.players)
    .flatMap((player) => player.knights)
    .find((candidate) => candidate.id === vertex.knightId);
  return knight !== undefined && knight.ownerId !== playerId;
}

function vertexIsVacant(state: GameState, vertexId: VertexId): boolean {
  const vertex = state.board.vertices[vertexId];
  return vertex !== undefined && vertex.building === null && (vertex.knightId ?? null) === null;
}

export function getLegalKnightPlacementVertexIds(
  state: GameState,
  playerId: PlayerId,
): readonly VertexId[] {
  return Object.values(state.board.vertices)
    .filter(
      (vertex) =>
        vertexIsVacant(state, vertex.id) &&
        vertex.connectedEdgeIds.some(
          (edgeId) => state.board.edges[edgeId]?.roadOwnerId === playerId,
        ),
    )
    .map((vertex) => vertex.id);
}

function findKnight(
  state: GameState,
  knightId: KnightId,
): { readonly player: PlayerState; readonly knight: KnightState; readonly index: number } | null {
  for (const player of Object.values(state.players)) {
    const index = player.knights.findIndex((knight) => knight.id === knightId);
    const knight = player.knights[index];
    if (knight !== undefined) return { player, knight, index };
  }
  return null;
}

function knightRankCount(player: PlayerState, level: 1 | 2 | 3): number {
  return player.knights.filter((knight) => knight.level === level).length;
}

export function buildKnight(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'BUILD_KNIGHT' }>,
): DispatchResult {
  const contextError = actionContextError(state, action.actorId);
  if (contextError !== null) return rejectAction(state, 'WRONG_PHASE', contextError);
  const player = state.players[action.actorId];
  if (player === undefined)
    return rejectAction(state, 'INVALID_TARGET', 'The player does not exist.');
  if (knightRankCount(player, 1) >= 2) {
    return rejectAction(
      state,
      'NO_PIECES_REMAINING',
      'Both Basic Knight pieces are already in use.',
    );
  }
  if (!getLegalKnightPlacementVertexIds(state, action.actorId).includes(action.vertexId)) {
    return rejectAction(state, 'INVALID_TARGET', 'Choose an empty corner connected to your Roads.');
  }
  if (!canAfford(player.resources, KNIGHT_COST)) {
    return rejectAction(
      state,
      'INSUFFICIENT_RESOURCES',
      'A Basic Knight costs one Sheep and one Ore.',
    );
  }
  const vertex = state.board.vertices[action.vertexId]!;
  const instanceId = createKnightId(
    `knight-${action.actorId}-${state.turn.turnNumber}-${state.actionHistory.length}`,
  );
  const knight: KnightState = {
    id: instanceId,
    ownerId: action.actorId,
    vertexId: action.vertexId,
    level: 1,
    active: false,
    placedTurn: state.turn.turnNumber,
    activeSinceTurn: null,
    lastActionTurn: null,
    upgradedTurn: null,
  };
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: {
        ...player,
        resources: subtractResourceBundles(player.resources, KNIGHT_COST),
        knights: [...player.knights, knight],
      },
    },
    bank: addResourceBundles(state.bank, KNIGHT_COST),
    board: {
      ...state.board,
      vertices: {
        ...state.board.vertices,
        [action.vertexId]: { ...vertex, knightId: instanceId },
      },
    },
  };
  return acceptAction(state, action, nextState, [
    {
      type: 'KNIGHT_BUILT',
      playerId: action.actorId,
      knightId: instanceId,
      vertexId: action.vertexId,
      level: 1,
    },
  ]);
}

export function activateKnight(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'ACTIVATE_KNIGHT' }>,
): DispatchResult {
  const contextError = actionContextError(state, action.actorId);
  if (contextError !== null) return rejectAction(state, 'WRONG_PHASE', contextError);
  const found = findKnight(state, action.knightId);
  if (found === null || found.player.id !== action.actorId) {
    return rejectAction(state, 'INVALID_TARGET', 'Choose one of your Knights.');
  }
  if (found.knight.active)
    return rejectAction(state, 'INVALID_TARGET', 'That Knight is already active.');
  if (!canAfford(found.player.resources, KNIGHT_ACTIVATION_COST)) {
    return rejectAction(state, 'INSUFFICIENT_RESOURCES', 'Activating a Knight costs one Grain.');
  }
  const knights = found.player.knights.map((knight) =>
    knight.id === action.knightId
      ? { ...knight, active: true, activeSinceTurn: state.turn.turnNumber }
      : knight,
  );
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: {
        ...found.player,
        resources: subtractResourceBundles(found.player.resources, KNIGHT_ACTIVATION_COST),
        knights,
      },
    },
    bank: addResourceBundles(state.bank, KNIGHT_ACTIVATION_COST),
  };
  return acceptAction(state, action, nextState, [
    { type: 'KNIGHT_ACTIVATED', playerId: action.actorId, knightId: action.knightId },
  ]);
}

export function upgradeKnight(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'UPGRADE_KNIGHT' }>,
  free = false,
): DispatchResult {
  const contextError = actionContextError(state, action.actorId);
  if (contextError !== null) return rejectAction(state, 'WRONG_PHASE', contextError);
  const found = findKnight(state, action.knightId);
  if (found === null || found.player.id !== action.actorId) {
    return rejectAction(state, 'INVALID_TARGET', 'Choose one of your Knights.');
  }
  if (found.knight.level >= 3)
    return rejectAction(state, 'INVALID_TARGET', 'That Knight is already Mighty.');
  if (found.knight.upgradedTurn === state.turn.turnNumber) {
    return rejectAction(state, 'INVALID_TARGET', 'A Knight cannot be upgraded twice in one turn.');
  }
  const nextLevel = (found.knight.level + 1) as 2 | 3;
  if (nextLevel === 3 && found.player.cityImprovements.POLITICS < 3) {
    return rejectAction(
      state,
      'INVALID_TARGET',
      'Politics level 3 (Fortress) unlocks Mighty Knights.',
    );
  }
  if (knightRankCount(found.player, nextLevel) >= 2) {
    return rejectAction(
      state,
      'NO_PIECES_REMAINING',
      `Both level ${nextLevel} Knight pieces are in use.`,
    );
  }
  if (!free && !canAfford(found.player.resources, KNIGHT_COST)) {
    return rejectAction(
      state,
      'INSUFFICIENT_RESOURCES',
      'A Knight upgrade costs one Sheep and one Ore.',
    );
  }
  const knights = found.player.knights.map((knight) =>
    knight.id === action.knightId
      ? { ...knight, level: nextLevel, upgradedTurn: state.turn.turnNumber }
      : knight,
  );
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: {
        ...found.player,
        resources: free
          ? found.player.resources
          : subtractResourceBundles(found.player.resources, KNIGHT_COST),
        knights,
      },
    },
    bank: free ? state.bank : addResourceBundles(state.bank, KNIGHT_COST),
  };
  return acceptAction(state, action, nextState, [
    {
      type: 'KNIGHT_UPGRADED',
      playerId: action.actorId,
      knightId: action.knightId,
      level: nextLevel,
    },
  ]);
}

function connectedKnightVertices(
  state: GameState,
  playerId: PlayerId,
  originVertexId: VertexId,
  allowOccupiedEndpoint = false,
): readonly VertexId[] {
  const visited = new Set<VertexId>([originVertexId]);
  const queue: VertexId[] = [originVertexId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current !== originVertexId && vertexBlockedByOpponent(state, playerId, current)) continue;
    const vertex = state.board.vertices[current];
    if (vertex === undefined) continue;
    for (const edgeId of vertex.connectedEdgeIds) {
      const edge = state.board.edges[edgeId];
      if (edge?.roadOwnerId !== playerId) continue;
      const next = edge.vertexAId === current ? edge.vertexBId : edge.vertexAId;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return [...visited].filter(
    (vertexId) =>
      vertexId !== originVertexId && (allowOccupiedEndpoint || vertexIsVacant(state, vertexId)),
  );
}

export function getLegalKnightMoveVertexIds(
  state: GameState,
  playerId: PlayerId,
  knightId: KnightId,
): readonly VertexId[] {
  const found = findKnight(state, knightId);
  if (found === null || found.player.id !== playerId) return [];
  return connectedKnightVertices(state, playerId, found.knight.vertexId);
}

function knightCanAct(state: GameState, knight: KnightState): string | null {
  if (!knight.active) return 'Activate this Knight before using it.';
  if (knight.activeSinceTurn !== null && knight.activeSinceTurn >= state.turn.turnNumber) {
    return 'A Knight activated this turn cannot act until a later turn.';
  }
  if (knight.lastActionTurn === state.turn.turnNumber)
    return 'This Knight has already acted this turn.';
  return null;
}

export function getKnightActionReason(state: GameState, knight: KnightState): string | null {
  return knightCanAct(state, knight);
}

export function getLegalKnightDisplacementTargetIds(
  state: GameState,
  playerId: PlayerId,
  knightId: KnightId,
): readonly KnightId[] {
  const attacker = findKnight(state, knightId);
  if (
    attacker === null ||
    attacker.player.id !== playerId ||
    knightCanAct(state, attacker.knight) !== null
  ) {
    return [];
  }
  const reachable = new Set(
    connectedKnightVertices(state, playerId, attacker.knight.vertexId, true),
  );
  return Object.values(state.players)
    .filter((player) => player.id !== playerId)
    .flatMap((player) => player.knights)
    .filter((knight) => knight.level < attacker.knight.level && reachable.has(knight.vertexId))
    .map((knight) => knight.id);
}

export function moveKnight(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'MOVE_KNIGHT' }>,
): DispatchResult {
  const contextError = actionContextError(state, action.actorId);
  if (contextError !== null) return rejectAction(state, 'WRONG_PHASE', contextError);
  const found = findKnight(state, action.knightId);
  if (found === null || found.player.id !== action.actorId) {
    return rejectAction(state, 'INVALID_TARGET', 'Choose one of your Knights.');
  }
  const eligibility = knightCanAct(state, found.knight);
  if (eligibility !== null) return rejectAction(state, 'INVALID_TARGET', eligibility);
  if (
    !getLegalKnightMoveVertexIds(state, action.actorId, action.knightId).includes(action.vertexId)
  ) {
    return rejectAction(
      state,
      'INVALID_TARGET',
      'That corner is outside this Knight’s open Road network.',
    );
  }
  const origin = state.board.vertices[found.knight.vertexId]!;
  const destination = state.board.vertices[action.vertexId]!;
  const movedKnight: KnightState = {
    ...found.knight,
    vertexId: action.vertexId,
    active: false,
    lastActionTurn: state.turn.turnNumber,
  };
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: {
        ...found.player,
        knights: found.player.knights.map((knight) =>
          knight.id === action.knightId ? movedKnight : knight,
        ),
      },
    },
    board: {
      ...state.board,
      vertices: {
        ...state.board.vertices,
        [origin.id]: { ...origin, knightId: null },
        [destination.id]: { ...destination, knightId: action.knightId },
      },
    },
  };
  return acceptAction(state, action, nextState, [
    {
      type: 'KNIGHT_MOVED',
      playerId: action.actorId,
      knightId: action.knightId,
      fromVertexId: origin.id,
      vertexId: destination.id,
    },
  ]);
}

export function getLegalDisplacedKnightVertexIds(
  state: GameState,
  knight: KnightState,
): readonly VertexId[] {
  return connectedKnightVertices(state, knight.ownerId, knight.vertexId);
}

export function displaceKnight(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'DISPLACE_KNIGHT' }>,
): DispatchResult {
  const contextError = actionContextError(state, action.actorId);
  if (contextError !== null) return rejectAction(state, 'WRONG_PHASE', contextError);
  const attacker = findKnight(state, action.knightId);
  const target = findKnight(state, action.targetKnightId);
  if (attacker === null || attacker.player.id !== action.actorId || target === null) {
    return rejectAction(state, 'INVALID_TARGET', 'Choose a valid attacking and defending Knight.');
  }
  if (target.player.id === action.actorId || attacker.knight.level <= target.knight.level) {
    return rejectAction(
      state,
      'INVALID_TARGET',
      'Only a strictly stronger Knight can displace an opponent.',
    );
  }
  const eligibility = knightCanAct(state, attacker.knight);
  if (eligibility !== null) return rejectAction(state, 'INVALID_TARGET', eligibility);
  const reachable = connectedKnightVertices(state, action.actorId, attacker.knight.vertexId, true);
  if (!reachable.includes(target.knight.vertexId)) {
    return rejectAction(
      state,
      'INVALID_TARGET',
      'The target is outside the attacking Knight’s Road network.',
    );
  }
  const origin = state.board.vertices[attacker.knight.vertexId]!;
  const targetVertex = state.board.vertices[target.knight.vertexId]!;
  const movedAttacker: KnightState = {
    ...attacker.knight,
    vertexId: target.knight.vertexId,
    active: false,
    lastActionTurn: state.turn.turnNumber,
  };
  let nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [attacker.player.id]: {
        ...attacker.player,
        knights: attacker.player.knights.map((knight) =>
          knight.id === attacker.knight.id ? movedAttacker : knight,
        ),
      },
    },
    board: {
      ...state.board,
      vertices: {
        ...state.board.vertices,
        [origin.id]: { ...origin, knightId: null },
        [targetVertex.id]: { ...targetVertex, knightId: attacker.knight.id },
      },
    },
  };
  const eligibleRelocations = getLegalDisplacedKnightVertexIds(nextState, target.knight);
  if (eligibleRelocations.length === 0) {
    nextState = {
      ...nextState,
      players: {
        ...nextState.players,
        [target.player.id]: {
          ...target.player,
          knights: target.player.knights.filter((knight) => knight.id !== target.knight.id),
        },
      },
    };
  } else {
    nextState = {
      ...nextState,
      turn: { ...nextState.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: target.player.id,
        purpose: 'RELOCATE_DISPLACED_KNIGHT',
        eligibleIds: eligibleRelocations,
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [target.player.id],
        canCancel: false,
        context: { knightId: target.knight.id },
      },
    };
  }
  const events: GameEvent[] = [
    {
      type: 'KNIGHT_DISPLACED',
      playerId: action.actorId,
      knightId: action.knightId,
      targetPlayerId: target.player.id,
      targetKnightId: target.knight.id,
      vertexId: target.knight.vertexId,
    },
  ];
  if (eligibleRelocations.length === 0) {
    events.push({ type: 'KNIGHT_REMOVED', playerId: target.player.id, knightId: target.knight.id });
  }
  return acceptAction(state, action, nextState, events);
}

export function chaseRobber(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'CHASE_ROBBER' }>,
): DispatchResult {
  const contextError = actionContextError(state, action.actorId);
  if (contextError !== null) return rejectAction(state, 'WRONG_PHASE', contextError);
  if (state.kn?.firstBarbarianAttackResolved !== true) {
    return rejectAction(
      state,
      'INVALID_TARGET',
      'The robber remains locked until the first barbarian attack.',
    );
  }
  const found = findKnight(state, action.knightId);
  if (found === null || found.player.id !== action.actorId) {
    return rejectAction(state, 'INVALID_TARGET', 'Choose one of your Knights.');
  }
  const eligibility = knightCanAct(state, found.knight);
  if (eligibility !== null) return rejectAction(state, 'INVALID_TARGET', eligibility);
  const robberHexId = state.board.robberHexId;
  if (
    robberHexId === null ||
    !state.board.vertices[found.knight.vertexId]?.adjacentHexIds.includes(robberHexId)
  ) {
    return rejectAction(state, 'INVALID_TARGET', 'This Knight is not touching the robber.');
  }
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: {
        ...found.player,
        knights: found.player.knights.map((knight) =>
          knight.id === action.knightId
            ? { ...knight, active: false, lastActionTurn: state.turn.turnNumber }
            : knight,
        ),
      },
    },
    turn: { ...state.turn, phase: 'MOVE_ROBBER' },
    pendingInteraction: {
      type: 'MOVE_ROBBER',
      playerId: action.actorId,
      sourceKnightId: action.knightId,
    },
  };
  return acceptAction(state, action, nextState, []);
}

export function getLegalRobberChasingKnightIds(
  state: GameState,
  playerId: PlayerId,
): readonly KnightId[] {
  if (state.kn?.firstBarbarianAttackResolved !== true || state.board.robberHexId === null)
    return [];
  const robberHexId = state.board.robberHexId;
  return (state.players[playerId]?.knights ?? [])
    .filter(
      (knight) =>
        knightCanAct(state, knight) === null &&
        state.board.vertices[knight.vertexId]?.adjacentHexIds.includes(robberHexId),
    )
    .map((knight) => knight.id);
}

export function getLegalWallVertexIds(state: GameState, playerId: PlayerId): readonly VertexId[] {
  return Object.values(state.board.vertices)
    .filter(
      (vertex) =>
        vertex.building?.ownerId === playerId &&
        vertex.building.type === 'MANSION' &&
        vertex.building.hasWall !== true,
    )
    .map((vertex) => vertex.id);
}

export function buildWall(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'BUILD_WALL' }>,
  free = false,
): DispatchResult {
  const contextError = actionContextError(state, action.actorId);
  if (contextError !== null) return rejectAction(state, 'WRONG_PHASE', contextError);
  const player = state.players[action.actorId];
  const vertex = state.board.vertices[action.vertexId];
  if (
    player === undefined ||
    vertex?.building?.ownerId !== action.actorId ||
    vertex.building.type !== 'MANSION'
  ) {
    return rejectAction(
      state,
      'INVALID_TARGET',
      'Walls can only be built around one of your Cities.',
    );
  }
  if (vertex.building.hasWall === true)
    return rejectAction(state, 'INVALID_TARGET', 'That City already has a Wall.');
  if (player.cityWallsRemaining < 1)
    return rejectAction(state, 'NO_PIECES_REMAINING', 'All three Walls are in use.');
  if (!free && !canAfford(player.resources, WALL_COST)) {
    return rejectAction(state, 'INSUFFICIENT_RESOURCES', 'A Wall costs two Brick.');
  }
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: {
        ...player,
        cityWallsRemaining: player.cityWallsRemaining - 1,
        resources: free ? player.resources : subtractResourceBundles(player.resources, WALL_COST),
      },
    },
    bank: free ? state.bank : addResourceBundles(state.bank, WALL_COST),
    board: {
      ...state.board,
      vertices: {
        ...state.board.vertices,
        [action.vertexId]: {
          ...vertex,
          building: { ...vertex.building, hasWall: true },
        },
      },
    },
  };
  return acceptAction(state, action, nextState, [
    { type: 'WALL_BUILT', playerId: action.actorId, vertexId: action.vertexId },
  ]);
}

function metropolisCandidates(state: GameState, playerId: PlayerId): readonly VertexId[] {
  return Object.values(state.board.vertices)
    .filter(
      (vertex) =>
        vertex.building?.ownerId === playerId &&
        vertex.building.type === 'MANSION' &&
        (vertex.building.metropolis === null || vertex.building.metropolis === undefined),
    )
    .map((vertex) => vertex.id);
}

export function placeMetropolis(
  state: GameState,
  playerId: PlayerId,
  track: KNProgressFamily,
  vertexId: VertexId,
): KNResolution {
  const kn = state.kn;
  const vertex = state.board.vertices[vertexId];
  if (
    kn === null ||
    vertex?.building?.ownerId !== playerId ||
    vertex.building.type !== 'MANSION' ||
    (vertex.building.metropolis !== null && vertex.building.metropolis !== undefined)
  ) {
    return { state, events: [] };
  }
  const previousPlayerId = kn.metropolisOwners[track];
  const vertices = Object.fromEntries(
    Object.entries(state.board.vertices).map(([id, candidate]) => [
      id,
      candidate.building?.metropolis === track
        ? { ...candidate, building: { ...candidate.building, metropolis: null } }
        : candidate,
    ]),
  );
  vertices[vertexId] = {
    ...vertex,
    building: { ...vertex.building, metropolis: track },
  };
  return {
    state: {
      ...state,
      board: { ...state.board, vertices },
      kn: {
        ...kn,
        metropolisOwners: { ...kn.metropolisOwners, [track]: playerId },
      },
    },
    events: [{ type: 'METROPOLIS_CHANGED', track, playerId, previousPlayerId, vertexId }],
  };
}

export function buyImprovement(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'BUY_IMPROVEMENT' }>,
): DispatchResult {
  const contextError = actionContextError(state, action.actorId);
  if (contextError !== null) return rejectAction(state, 'WRONG_PHASE', contextError);
  const player = state.players[action.actorId];
  if (player === undefined)
    return rejectAction(state, 'INVALID_TARGET', 'The player does not exist.');
  const currentLevel = player.cityImprovements[action.track];
  if (currentLevel >= 5)
    return rejectAction(state, 'INVALID_TARGET', 'That Improvement is already level 5.');
  const level = currentLevel + 1;
  const ownsCity = Object.values(state.board.vertices).some(
    (vertex) => vertex.building?.ownerId === action.actorId && vertex.building.type === 'MANSION',
  );
  if (!ownsCity) {
    return rejectAction(
      state,
      'INVALID_TARGET',
      level === 4
        ? 'An eligible City is required before level 4 can claim its Metropolis.'
        : 'Own a City before improving it.',
    );
  }
  const costAmount = Math.max(0, level - (player.craneDiscountAvailable ? 1 : 0));
  const commodityId = TRACK_COMMODITY[action.track];
  const cost = resourceBundle([[commodityId, costAmount]]);
  if (!canAfford(player.commodities, cost)) {
    return rejectAction(
      state,
      'INSUFFICIENT_RESOURCES',
      `Level ${level} requires ${costAmount} matching commodities.`,
    );
  }
  const currentOwner = state.kn!.metropolisOwners[action.track];
  const ownerLevel =
    currentOwner === null
      ? -1
      : (state.players[currentOwner]?.cityImprovements[action.track] ?? -1);
  const claimsMetropolis =
    level >= 4 &&
    (currentOwner === null || (currentOwner !== action.actorId && level > ownerLevel));
  const candidates = claimsMetropolis ? metropolisCandidates(state, action.actorId) : [];
  if (claimsMetropolis && candidates.length === 0) {
    return rejectAction(
      state,
      'INVALID_TARGET',
      'An eligible City is required to claim this Metropolis.',
    );
  }
  const currentHand = playerHand(player);
  const nextPlayer = withPlayerHand(player, subtractResourceBundles(currentHand, cost));
  let nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: {
        ...nextPlayer,
        cityImprovements: { ...player.cityImprovements, [action.track]: level },
        craneDiscountAvailable: false,
      },
    },
    commodityBank: addResourceBundles(state.commodityBank, cost),
  };
  const events: GameEvent[] = [
    {
      type: 'IMPROVEMENT_BOUGHT',
      playerId: action.actorId,
      track: action.track,
      level,
      cost: costAmount,
    },
  ];
  if (claimsMetropolis && candidates.length === 1) {
    const placed = placeMetropolis(nextState, action.actorId, action.track, candidates[0]!);
    nextState = placed.state;
    events.push(...placed.events);
  } else if (claimsMetropolis) {
    nextState = {
      ...nextState,
      turn: { ...nextState.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: action.actorId,
        purpose: 'METROPOLIS_CITY',
        eligibleIds: candidates,
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [action.actorId],
        canCancel: false,
        context: { track: action.track },
      },
    };
  }
  return acceptAction(state, action, nextState, events);
}
