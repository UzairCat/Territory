import { COMMODITIES } from '../content/commodities';
import { getKNProgressCardDefinition } from '../content/kn-progress-cards';
import { RESOURCES } from '../content/resources';
import { resourceBundle, type KNProgressFamily } from '../content/types';
import type { GameState, KNState, PendingInteraction } from '../core/game-state';
import type { CardInstanceId, PlayerId } from '../core/ids';
import { calculateBonusHolders } from './scoring-rules';

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([candidate]) => candidate !== key));
}

function appendUnique<T>(values: readonly T[], additions: readonly T[]): readonly T[] {
  return [...new Set([...values, ...additions])];
}

function repairPendingInteraction(
  stateForPendingRepair: GameState,
  interaction: PendingInteraction,
  removedPlayerId: PlayerId,
  remainingTradeIds: ReadonlySet<string>,
): PendingInteraction {
  if (interaction === null) return null;
  if (interaction.type === 'DISCARD_RESOURCES') {
    const queue = interaction.queue.filter((playerId) => playerId !== removedPlayerId);
    return queue.length === 0
      ? null
      : {
          ...interaction,
          queue,
          requiredCounts: withoutKey(interaction.requiredCounts, removedPlayerId),
        };
  }
  if (interaction.type === 'CHOOSE_STEAL_TARGET') {
    if (interaction.playerId === removedPlayerId) return null;
    const eligibleTargets = interaction.eligibleTargets.filter(
      (playerId) => playerId !== removedPlayerId,
    );
    return eligibleTargets.length === 0 ? null : { ...interaction, eligibleTargets };
  }
  if (interaction.type === 'TRADE_RESPONSES') {
    return interaction.playerId === removedPlayerId || !remainingTradeIds.has(interaction.tradeId)
      ? null
      : interaction;
  }
  if (interaction.type === 'KN_SELECTION') {
    const queue = interaction.queue.filter((playerId) => playerId !== removedPlayerId);
    if (queue.length === 0) return null;
    if (interaction.playerId !== removedPlayerId) return { ...interaction, queue };
    const nextPlayerId = queue[0];
    if (nextPlayerId === undefined) return null;
    const eligibleIds =
      interaction.purpose === 'BARBARIAN_CITY_LOSS'
        ? Object.values(stateForPendingRepair.board.vertices)
            .filter(
              (vertex) =>
                vertex.building?.ownerId === nextPlayerId &&
                vertex.building.type === 'MANSION' &&
                (vertex.building.metropolis === null || vertex.building.metropolis === undefined),
            )
            .map((vertex) => vertex.id)
        : interaction.purpose === 'PROGRESS_DISCARD'
          ? (stateForPendingRepair.players[nextPlayerId]?.knProgressCardIds ?? [])
          : interaction.eligibleIds;
    return { ...interaction, playerId: nextPlayerId, eligibleIds, queue };
  }
  return interaction.playerId === removedPlayerId ? null : interaction;
}

function nextRemainingPlayerId(
  state: GameState,
  removedPlayerId: PlayerId,
  remainingPlayerIds: ReadonlySet<PlayerId>,
): PlayerId | null {
  const ordered = [...state.config.players].sort((first, second) => first.order - second.order);
  const removedIndex = ordered.findIndex((player) => player.id === removedPlayerId);
  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const candidate = ordered[(Math.max(0, removedIndex) + offset) % ordered.length]?.id;
    if (candidate !== undefined && remainingPlayerIds.has(candidate)) return candidate;
  }
  return null;
}

function repairSetupTurn(
  state: GameState,
  removedPlayerId: PlayerId,
  remainingPlayerIds: ReadonlySet<PlayerId>,
): GameState['turn'] {
  const oldPlayerIds = [...state.config.players]
    .sort((first, second) => first.order - second.order)
    .map((player) => player.id);
  const oldOrder = [...oldPlayerIds, ...[...oldPlayerIds].reverse()];
  const filteredOrder = oldOrder.filter((playerId) => playerId !== removedPlayerId);
  const oldIndex = state.turn.setupPlacementIndex ?? 0;
  if (filteredOrder.length === 0) {
    return {
      ...state.turn,
      activePlayerId: null,
      phase: 'GAME_OVER',
      setupPlacementIndex: null,
      setupPlacementVertexId: null,
    };
  }

  const activeWasRemoved = state.turn.activePlayerId === removedPlayerId;
  let sourceIndex = oldIndex;
  if (activeWasRemoved) {
    sourceIndex = oldOrder.findIndex(
      (playerId, index) => index > oldIndex && remainingPlayerIds.has(playerId),
    );
    if (sourceIndex < 0) {
      return {
        ...state.turn,
        activePlayerId: filteredOrder[0] ?? null,
        phase: 'WAITING_FOR_ROLL',
        dice: null,
        cardsPlayedThisTurn: 0,
        cardIdsBoughtThisTurn: [],
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
        knDice: null,
      };
    }
  }
  const nextIndex =
    oldOrder.slice(0, sourceIndex + 1).filter((playerId) => playerId !== removedPlayerId).length -
    1;
  return {
    ...state.turn,
    activePlayerId: filteredOrder[nextIndex] ?? filteredOrder[0] ?? null,
    phase: activeWasRemoved ? 'SETUP_PLACE_HOUSE' : state.turn.phase,
    setupPlacementIndex: Math.max(0, nextIndex),
    setupPlacementVertexId: activeWasRemoved ? null : state.turn.setupPlacementVertexId,
  };
}

/** Removes an expired online seat while preserving a playable authoritative state. */
export function removePlayerFromGame(state: GameState, removedPlayerId: PlayerId): GameState {
  const removedPlayer = state.players[removedPlayerId];
  if (removedPlayer === undefined) return state;

  const remainingConfigs = state.config.players
    .filter((player) => player.id !== removedPlayerId)
    .sort((first, second) => first.order - second.order)
    .map((player, order) => ({ ...player, order }));
  const remainingPlayerIds = new Set(remainingConfigs.map((player) => player.id));
  const removedKnightIds = new Set(removedPlayer.knights.map((knight) => knight.id));
  const vertices = Object.fromEntries(
    Object.entries(state.board.vertices).map(([vertexId, vertex]) => [
      vertexId,
      {
        ...vertex,
        building: vertex.building?.ownerId === removedPlayerId ? null : vertex.building,
        knightId:
          vertex.knightId !== null &&
          vertex.knightId !== undefined &&
          removedKnightIds.has(vertex.knightId)
            ? null
            : (vertex.knightId ?? null),
      },
    ]),
  );
  const edges = Object.fromEntries(
    Object.entries(state.board.edges).map(([edgeId, edge]) => [
      edgeId,
      edge.roadOwnerId === removedPlayerId ? { ...edge, roadOwnerId: null } : edge,
    ]),
  );

  const removedBaseCards = Object.values(state.progressCards)
    .filter((card) => card.ownerId === removedPlayerId)
    .map((card) => card.instanceId);
  const progressCards = Object.fromEntries(
    Object.entries(state.progressCards).map(([cardId, card]) => [
      cardId,
      card.ownerId === removedPlayerId ? { ...card, ownerId: null } : card,
    ]),
  );
  const tradeOffers = Object.fromEntries(
    Object.entries(state.tradeOffers).filter(
      ([, trade]) =>
        trade.fromPlayerId !== removedPlayerId &&
        trade.acceptedByPlayerId !== removedPlayerId &&
        !trade.recipientIds.includes(removedPlayerId),
    ),
  );
  const remainingTradeIds = new Set(Object.keys(tradeOffers));
  const pendingInteraction = repairPendingInteraction(
    state,
    state.pendingInteraction,
    removedPlayerId,
    remainingTradeIds,
  );

  const setupActive = state.turn.setupPlacementIndex !== null;
  let turn = setupActive
    ? repairSetupTurn(state, removedPlayerId, remainingPlayerIds)
    : state.turn.activePlayerId === removedPlayerId
      ? {
          ...state.turn,
          activePlayerId: nextRemainingPlayerId(state, removedPlayerId, remainingPlayerIds),
          turnNumber: state.turn.turnNumber + 1,
          phase:
            remainingConfigs.length === 0 ? ('GAME_OVER' as const) : ('WAITING_FOR_ROLL' as const),
          dice: null,
          cardsPlayedThisTurn: 0,
          cardIdsBoughtThisTurn: [],
          setupPlacementIndex: null,
          setupPlacementVertexId: null,
          knDice: null,
        }
      : state.turn;
  if (
    pendingInteraction === null &&
    state.pendingInteraction !== null &&
    ['DISCARD_RESOURCES', 'MOVE_ROBBER', 'CHOOSE_STEAL_TARGET', 'CARD_RESOLUTION'].includes(
      turn.phase,
    )
  ) {
    turn = {
      ...turn,
      phase: turn.dice === null ? 'WAITING_FOR_ROLL' : 'ACTION_PHASE',
    };
  }

  let kn = state.kn;
  if (kn !== null) {
    const removedKNCards = Object.values(kn.progressCards).filter(
      (card) => card.ownerId === removedPlayerId,
    );
    const progressDiscards: Record<KNProgressFamily, readonly CardInstanceId[]> = {
      SCIENCE: [...kn.progressDiscards.SCIENCE],
      TRADE: [...kn.progressDiscards.TRADE],
      POLITICS: [...kn.progressDiscards.POLITICS],
    };
    for (const card of removedKNCards) {
      const family = getKNProgressCardDefinition(card.definitionId)?.family;
      if (family !== undefined) {
        progressDiscards[family] = appendUnique(progressDiscards[family], [card.instanceId]);
      }
    }
    kn = {
      ...kn,
      progressDiscards,
      progressCards: Object.fromEntries(
        Object.entries(kn.progressCards).map(([cardId, card]) => [
          cardId,
          card.ownerId === removedPlayerId ? { ...card, ownerId: null } : card,
        ]),
      ),
      metropolisOwners: Object.fromEntries(
        Object.entries(kn.metropolisOwners).map(([family, ownerId]) => [
          family,
          ownerId === removedPlayerId ? null : ownerId,
        ]),
      ) as KNState['metropolisOwners'],
      merchant: kn.merchant?.ownerId === removedPlayerId ? null : kn.merchant,
      pendingRoll: kn.pendingRoll?.playerId === removedPlayerId ? null : kn.pendingRoll,
      attackSummary:
        kn.attackSummary === null
          ? null
          : {
              ...kn.attackSummary,
              contributions: withoutKey(kn.attackSummary.contributions, removedPlayerId),
              defenderAwardPlayerId:
                kn.attackSummary.defenderAwardPlayerId === removedPlayerId
                  ? null
                  : kn.attackSummary.defenderAwardPlayerId,
              affectedPlayerIds: kn.attackSummary.affectedPlayerIds.filter(
                (playerId) => playerId !== removedPlayerId,
              ),
            },
    };
  }

  let nextState: GameState = {
    ...state,
    config: { ...state.config, players: remainingConfigs },
    players: withoutKey(state.players, removedPlayerId),
    board: { ...state.board, vertices, edges },
    bank: resourceBundle(
      RESOURCES.map((resource) => [
        resource.id,
        (state.bank[resource.id] ?? 0) + (removedPlayer.resources[resource.id] ?? 0),
      ]),
    ),
    commodityBank: resourceBundle(
      COMMODITIES.map((commodity) => [
        commodity.id,
        (state.commodityBank[commodity.id] ?? 0) + (removedPlayer.commodities[commodity.id] ?? 0),
      ]),
    ),
    turn,
    progressDiscard: appendUnique(state.progressDiscard, removedBaseCards),
    progressCards,
    tradeOffers,
    pendingInteraction,
    winnerId: state.winnerId === removedPlayerId ? null : state.winnerId,
    kn,
  };
  nextState = { ...nextState, bonuses: calculateBonusHolders(nextState) };
  return nextState;
}
