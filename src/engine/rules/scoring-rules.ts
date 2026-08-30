import { BUILDING_DEFINITIONS } from '../content/buildings';
import { PROGRESS_CARDS } from '../content/progress-cards';
import { getKNProgressCardDefinition } from '../content/kn-progress-cards';
import type { AwardRule } from '../content/types';
import type { GameEvent } from '../core/events';
import type { BonusState, GameState } from '../core/game-state';
import type { EdgeId, PlayerId, VertexId } from '../core/ids';
import { orderedPlayerIds } from './setup-rules';

export interface ScoreBreakdown {
  readonly houses: number;
  readonly cities: number;
  readonly buildings: number;
  readonly longestRoad: number;
  readonly largestForce: number;
  readonly victoryCards: number;
  readonly metropolises: number;
  readonly merchant: number;
  readonly defenderPoints: number;
  readonly progressCards: number;
  readonly total: number;
}

function buildingScore(state: GameState, playerId: PlayerId) {
  const buildings = Object.values(state.board.vertices).filter(
    (vertex) => vertex.building?.ownerId === playerId,
  );
  const houses = buildings.filter((vertex) => vertex.building?.type === 'HOUSE').length;
  const cities =
    buildings.filter((vertex) => vertex.building?.type === 'MANSION').length *
    BUILDING_DEFINITIONS.MANSION.victoryPoints;
  return { houses, cities, total: houses + cities };
}

function supplementalScore(state: GameState, playerId: PlayerId) {
  if (state.kn !== null) {
    const player = state.players[playerId];
    if (player === undefined) {
      return { victoryCards: 0, metropolises: 0, merchant: 0, defenderPoints: 0, total: 0 };
    }
    const victoryCards = player.revealedKNProgressCardIds.reduce((total, cardInstanceId) => {
      const card = state.kn?.progressCards[cardInstanceId];
      const definition =
        card === undefined ? undefined : getKNProgressCardDefinition(card.definitionId);
      return total + (definition?.revealedVictoryPoints ?? 0);
    }, 0);
    const metropolisPoints =
      Object.values(state.board.vertices).filter(
        (vertex) =>
          vertex.building?.ownerId === playerId &&
          vertex.building.metropolis !== null &&
          vertex.building.metropolis !== undefined,
      ).length * 2;
    const merchant = state.kn.merchant?.ownerId === playerId ? 1 : 0;
    return {
      victoryCards,
      metropolises: metropolisPoints,
      merchant,
      defenderPoints: player.defenderPoints,
      total: victoryCards + metropolisPoints + merchant + player.defenderPoints,
    };
  }
  const victoryCards = Object.values(state.progressCards).reduce((total, card) => {
    if (card.ownerId !== playerId) return total;
    const definition = PROGRESS_CARDS.find((candidate) => candidate.id === card.definitionId);
    return total + (definition?.victoryPoints ?? 0);
  }, 0);
  return { victoryCards, metropolises: 0, merchant: 0, defenderPoints: 0, total: victoryCards };
}

export function calculateScoreBreakdown(state: GameState, playerId: PlayerId): ScoreBreakdown {
  const buildingPoints = buildingScore(state, playerId);
  const longestRoad =
    state.bonuses.longestRoadHolderId === playerId
      ? state.config.rules.longestRoad.victoryPoints
      : 0;
  const largestForce =
    state.bonuses.largestForceHolderId === playerId
      ? state.config.rules.largestForce.victoryPoints
      : 0;
  const supplemental = supplementalScore(state, playerId);

  return {
    houses: buildingPoints.houses,
    cities: buildingPoints.cities,
    buildings: buildingPoints.total,
    longestRoad,
    largestForce,
    victoryCards: supplemental.victoryCards,
    metropolises: supplemental.metropolises,
    merchant: supplemental.merchant,
    defenderPoints: supplemental.defenderPoints,
    progressCards: supplemental.total,
    total: buildingPoints.total + longestRoad + largestForce + supplemental.total,
  };
}

/** Public score deliberately excludes unrevealed progress-card victory points. */
export function calculatePublicScore(state: GameState, playerId: PlayerId): number {
  const score = calculateScoreBreakdown(state, playerId);
  if (state.kn !== null) return score.total;
  return score.buildings + score.longestRoad + score.largestForce;
}

export function calculateScore(state: GameState, playerId: PlayerId): number {
  return calculateScoreBreakdown(state, playerId).total;
}

function oppositeVertexId(state: GameState, edgeId: EdgeId, vertexId: VertexId): VertexId | null {
  const edge = state.board.edges[edgeId];
  if (edge === undefined) return null;
  if (edge.vertexAId === vertexId) return edge.vertexBId;
  if (edge.vertexBId === vertexId) return edge.vertexAId;
  return null;
}

/**
 * Finds the longest edge-simple trail in a player's road graph. An opponent
 * building may be an endpoint, but it cannot be crossed to join two roads.
 */
export function calculateLongestRoadLength(state: GameState, playerId: PlayerId): number {
  const ownedEdges = new Set(
    Object.values(state.board.edges)
      .filter((edge) => edge.roadOwnerId === playerId)
      .map((edge) => edge.id),
  );
  if (ownedEdges.size === 0) return 0;

  const search = (vertexId: VertexId, usedEdges: ReadonlySet<EdgeId>): number => {
    const vertex = state.board.vertices[vertexId];
    if (vertex === undefined) return usedEdges.size;

    const occupyingKnight = Object.values(state.players)
      .flatMap((player) => player.knights)
      .find((knight) => knight.id === vertex.knightId);
    const blockedByOpponent =
      usedEdges.size > 0 &&
      ((vertex.building !== null && vertex.building.ownerId !== playerId) ||
        (occupyingKnight !== undefined && occupyingKnight.ownerId !== playerId));
    if (blockedByOpponent) return usedEdges.size;

    let longest = usedEdges.size;
    for (const edgeId of vertex.connectedEdgeIds) {
      if (!ownedEdges.has(edgeId) || usedEdges.has(edgeId)) continue;
      const nextVertexId = oppositeVertexId(state, edgeId, vertexId);
      if (nextVertexId === null) continue;
      const nextUsedEdges = new Set(usedEdges);
      nextUsedEdges.add(edgeId);
      longest = Math.max(longest, search(nextVertexId, nextUsedEdges));
    }
    return longest;
  };

  let longest = 0;
  for (const vertex of Object.values(state.board.vertices)) {
    if (!vertex.connectedEdgeIds.some((edgeId) => ownedEdges.has(edgeId))) continue;
    longest = Math.max(longest, search(vertex.id, new Set()));
  }
  return longest;
}

function resolveAwardHolder(
  state: GameState,
  currentHolderId: PlayerId | null,
  values: Readonly<Record<string, number>>,
  rule: AwardRule,
): PlayerId | null {
  const playerIds = orderedPlayerIds(state);
  const maximum = playerIds.reduce(
    (highest, playerId) => Math.max(highest, values[playerId] ?? 0),
    0,
  );
  if (maximum < rule.minimum) return null;

  const leaders = playerIds.filter((playerId) => (values[playerId] ?? 0) === maximum);
  if (currentHolderId !== null && leaders.includes(currentHolderId) && rule.incumbentRetainsTie) {
    return currentHolderId;
  }
  if (leaders.length === 1) return leaders[0] ?? null;
  if (rule.unheldTieAwardsNobody) return null;
  return leaders[0] ?? null;
}

export function calculateBonusHolders(state: GameState): BonusState {
  const playerIds = orderedPlayerIds(state);
  const roadLengths = Object.fromEntries(
    playerIds.map((playerId) => [playerId, calculateLongestRoadLength(state, playerId)]),
  );
  const forceCounts = Object.fromEntries(
    playerIds.map((playerId) => [playerId, state.players[playerId]?.playedForceCards ?? 0]),
  );

  return {
    longestRoadHolderId: resolveAwardHolder(
      state,
      state.bonuses.longestRoadHolderId,
      roadLengths,
      state.config.rules.longestRoad,
    ),
    largestForceHolderId:
      state.kn === null
        ? resolveAwardHolder(
            state,
            state.bonuses.largestForceHolderId,
            forceCounts,
            state.config.rules.largestForce,
          )
        : null,
  };
}

export interface ScoringResolution {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** Recalculates awards and performs the single authoritative victory check. */
export function resolveScoring(
  previousState: GameState,
  candidateState: GameState,
): ScoringResolution {
  const bonuses = calculateBonusHolders(candidateState);
  let state: GameState = { ...candidateState, bonuses };
  const events: GameEvent[] = [];

  if (previousState.bonuses.longestRoadHolderId !== bonuses.longestRoadHolderId) {
    events.push({ type: 'LONGEST_ROAD_CHANGED', playerId: bonuses.longestRoadHolderId });
  }
  if (previousState.bonuses.largestForceHolderId !== bonuses.largestForceHolderId) {
    events.push({ type: 'LARGEST_FORCE_CHANGED', playerId: bonuses.largestForceHolderId });
  }

  for (const playerId of orderedPlayerIds(state)) {
    const previousScore = calculateScore(previousState, playerId);
    const nextScore = calculateScore(state, playerId);
    if (previousScore !== nextScore) {
      events.push({ type: 'SCORE_CHANGED', playerId, score: nextScore });
    }
  }

  const activePlayerId = state.turn.activePlayerId;
  const activePlayerScore = activePlayerId === null ? 0 : calculateScore(state, activePlayerId);
  const canDeclareVictory =
    activePlayerId !== null &&
    state.turn.phase === 'ACTION_PHASE' &&
    state.pendingInteraction === null;
  if (canDeclareVictory && activePlayerScore >= state.config.victoryTarget) {
    state = {
      ...state,
      winnerId: activePlayerId,
      pendingInteraction: null,
      turn: { ...state.turn, phase: 'GAME_OVER' },
    };
    events.push({ type: 'GAME_WON', playerId: activePlayerId, score: activePlayerScore });
  }

  return { state, events };
}
