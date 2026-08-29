import { RESOURCES } from '../content/resources';
import { HAND_GOODS, isCommodityId } from '../content/commodities';
import type { ResourceDefinition } from '../content/types';
import { resourceBundle } from '../content/types';
import type { ResourceBundle } from '../content/types';
import type { GameAction } from '../core/actions';
import { acceptAction, rejectAction } from '../core/dispatch-result';
import type { DispatchResult } from '../core/dispatch-result';
import type { GameEvent } from '../core/events';
import type { GameState, TradeOffer } from '../core/game-state';
import type { PlayerId, PortId, ResourceId, TradeId } from '../core/ids';
import { KN_MODE_ID } from '../modes/kn';
import {
  addResourceBundles,
  canAfford,
  combinedBank,
  playerHand,
  splitBank,
  subtractResourceBundles,
  withPlayerHand,
} from './resource-rules';

function tradeGoods(state: GameState): readonly ResourceDefinition[] {
  return state.config.modeId === KN_MODE_ID ? HAND_GOODS : RESOURCES;
}

function normalizeTradeBundle(state: GameState, resources: ResourceBundle): ResourceBundle | null {
  const goods = tradeGoods(state);
  const knownIds = new Set(goods.map((good) => good.id));
  for (const [resourceId, amount] of Object.entries(resources)) {
    if (
      !knownIds.has(resourceId as ResourceId) ||
      amount === undefined ||
      !Number.isSafeInteger(amount) ||
      amount < 0
    ) {
      return null;
    }
  }

  const normalized = resourceBundle(
    goods.flatMap((resource) => {
      const amount = resources[resource.id] ?? 0;
      return amount > 0 ? ([[resource.id, amount]] as const) : [];
    }),
  );
  return goods.some((resource) => (normalized[resource.id] ?? 0) > 0) ? normalized : null;
}

function bundlesOverlap(state: GameState, first: ResourceBundle, second: ResourceBundle): boolean {
  return tradeGoods(state).some(
    (resource) => (first[resource.id] ?? 0) > 0 && (second[resource.id] ?? 0) > 0,
  );
}

function tradeBundleTotal(state: GameState, bundle: ResourceBundle): number {
  return tradeGoods(state).reduce((total, good) => total + (bundle[good.id] ?? 0), 0);
}

function playerOwnsPort(state: GameState, playerId: PlayerId, portId: PortId): boolean {
  const port = state.board.ports[portId];
  return (
    port !== undefined &&
    port.vertexIds.some(
      (vertexId) => state.board.vertices[vertexId]?.building?.ownerId === playerId,
    )
  );
}

export type BankTradeRatio = 2 | 3 | 4;

export function getBankTradeRatio(
  state: GameState,
  playerId: PlayerId,
  resourceId: ResourceId,
): BankTradeRatio {
  let ratio: BankTradeRatio = state.config.rules.bankTradeRatio;
  const player = state.players[playerId];
  if (state.config.modeId === KN_MODE_ID && player !== undefined) {
    if (isCommodityId(resourceId) && player.cityImprovements.TRADE >= 3) ratio = 2;
    if (player.merchantFleetGoodId === resourceId) ratio = 2;
    if (state.kn?.merchant?.ownerId === playerId && state.kn.merchant.resourceId === resourceId) {
      ratio = 2;
    }
  }
  for (const port of Object.values(state.board.ports)) {
    if (
      playerOwnsPort(state, playerId, port.id) &&
      (port.resourceId === null || (port.resourceId === resourceId && !isCommodityId(resourceId)))
    ) {
      if (port.tradeRatio < ratio) ratio = port.tradeRatio;
    }
  }
  return ratio;
}

export function bankTrade(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'BANK_TRADE' }>,
): DispatchResult {
  if (state.turn.activePlayerId !== action.actorId) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'Only the active player can trade with the bank.');
  }
  if (state.turn.phase !== 'ACTION_PHASE') {
    return rejectAction(
      state,
      'WRONG_PHASE',
      'Bank trades are only available during action phase.',
    );
  }
  if (state.pendingInteraction !== null) {
    return rejectAction(
      state,
      'PENDING_INTERACTION_REQUIRED',
      'Resolve the current interaction before trading with the bank.',
    );
  }
  const player = state.players[action.actorId];
  if (player === undefined) {
    return rejectAction(state, 'INVALID_TARGET', 'The trading player does not exist.');
  }
  const offered = normalizeTradeBundle(state, action.offered);
  const requested = normalizeTradeBundle(state, action.requested);
  if (offered === null || requested === null || bundlesOverlap(state, offered, requested)) {
    return rejectAction(
      state,
      'INVALID_TRADE',
      'Offer and request valid, different card types for this bank trade.',
    );
  }

  let earnedBankCards = 0;
  for (const good of tradeGoods(state)) {
    const amount = offered[good.id] ?? 0;
    if (amount === 0) continue;
    const ratio = getBankTradeRatio(state, action.actorId, good.id);
    if (amount % ratio !== 0) {
      return rejectAction(
        state,
        'INVALID_TRADE',
        `${good.displayName} must be offered in groups of ${ratio} at your current bank rate.`,
      );
    }
    earnedBankCards += amount / ratio;
  }
  const requestedCardCount = tradeBundleTotal(state, requested);
  if (
    !Number.isSafeInteger(earnedBankCards) ||
    !Number.isSafeInteger(requestedCardCount) ||
    earnedBankCards !== requestedCardCount
  ) {
    return rejectAction(
      state,
      'INVALID_TRADE',
      `The offered rate groups buy ${earnedBankCards} cards, but ${requestedCardCount} were requested.`,
    );
  }

  const currentHand = playerHand(player);
  const currentBank = combinedBank(state.bank, state.commodityBank);
  if (!canAfford(currentHand, offered)) {
    return rejectAction(
      state,
      'INSUFFICIENT_RESOURCES',
      'You no longer own every card included in this bank trade.',
    );
  }
  if (!canAfford(currentBank, requested)) {
    return rejectAction(
      state,
      'INSUFFICIENT_BANK_RESOURCES',
      'The bank cannot supply every requested card.',
    );
  }

  const nextPlayerHand = addResourceBundles(
    subtractResourceBundles(currentHand, offered),
    requested,
  );
  const nextCombinedBank = addResourceBundles(
    subtractResourceBundles(currentBank, requested),
    offered,
  );
  const nextBanks = splitBank(nextCombinedBank);
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: withPlayerHand(player, nextPlayerHand),
    },
    bank: nextBanks.bank,
    commodityBank: nextBanks.commodityBank,
  };
  const events: GameEvent[] = [
    {
      type: 'TRADE_COMPLETED',
      tradeId: null,
      playerId: action.actorId,
      recipientId: null,
      offered,
      requested,
    },
  ];
  return acceptAction(state, action, nextState, events);
}

export function createTradeOffer(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'CREATE_TRADE' }>,
): DispatchResult {
  if (state.turn.activePlayerId !== action.actorId) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'Only the active player can offer a trade.');
  }
  if (state.turn.phase !== 'ACTION_PHASE') {
    return rejectAction(
      state,
      'WRONG_PHASE',
      'Player trades are only available during action phase.',
    );
  }
  if (state.pendingInteraction !== null) {
    return rejectAction(
      state,
      'PENDING_INTERACTION_REQUIRED',
      'Resolve the current interaction before offering another trade.',
    );
  }
  if (state.tradeOffers[action.tradeId] !== undefined) {
    return rejectAction(state, 'TRADE_ID_IN_USE', 'That trade identifier has already been used.');
  }
  if (
    Object.values(state.tradeOffers).some(
      (trade) => trade.fromPlayerId === action.actorId && trade.status === 'OPEN',
    )
  ) {
    return rejectAction(state, 'INVALID_TRADE', 'Resolve the current trade offer first.');
  }
  const recipientIds = [...new Set(action.recipientIds)];
  if (
    recipientIds.length === 0 ||
    recipientIds.length !== action.recipientIds.length ||
    recipientIds.some(
      (recipientId) => recipientId === action.actorId || state.players[recipientId] === undefined,
    )
  ) {
    return rejectAction(
      state,
      'INVALID_TARGET',
      'Choose one or more valid opponents for this trade.',
    );
  }

  const offered = normalizeTradeBundle(state, action.offered);
  const requested = normalizeTradeBundle(state, action.requested);
  if (offered === null || requested === null || bundlesOverlap(state, offered, requested)) {
    return rejectAction(
      state,
      'INVALID_TRADE',
      'Offer and request at least one card, using different valid resource types.',
    );
  }
  const player = state.players[action.actorId];
  if (player === undefined) {
    return rejectAction(state, 'INVALID_TARGET', 'The trading player does not exist.');
  }
  if (!canAfford(playerHand(player), offered)) {
    return rejectAction(
      state,
      'INSUFFICIENT_RESOURCES',
      'You no longer own every resource included in this offer.',
    );
  }

  const trade: TradeOffer = {
    id: action.tradeId,
    fromPlayerId: action.actorId,
    recipientIds,
    responses: Object.fromEntries(
      recipientIds.map((recipientId) => [recipientId, 'PENDING' as const]),
    ),
    offered,
    requested,
    status: 'OPEN',
    createdTurn: state.turn.turnNumber,
    acceptedByPlayerId: null,
  };
  const nextState: GameState = {
    ...state,
    tradeOffers: { ...state.tradeOffers, [trade.id]: trade },
    pendingInteraction: {
      type: 'TRADE_RESPONSES',
      tradeId: trade.id,
      playerId: action.actorId,
    },
  };
  const events: GameEvent[] = [
    {
      type: 'TRADE_OFFERED',
      tradeId: trade.id,
      playerId: action.actorId,
      recipientIds,
    },
  ];
  return acceptAction(state, action, nextState, events);
}

export interface TradeAcceptance {
  readonly canAccept: boolean;
  readonly reason: string | null;
}

export function getTradeAcceptance(
  state: GameState,
  tradeId: TradeId,
  playerId: PlayerId,
): TradeAcceptance {
  const trade = state.tradeOffers[tradeId];
  if (trade === undefined || trade.status !== 'OPEN' || !trade.recipientIds.includes(playerId)) {
    return { canAccept: false, reason: 'This trade offer is no longer open.' };
  }
  if (trade.responses[playerId] !== 'PENDING') {
    return { canAccept: false, reason: 'You have already responded to this trade offer.' };
  }
  return getTradeCompletion(state, trade, playerId);
}

function getTradeCompletion(
  state: GameState,
  trade: TradeOffer,
  playerId: PlayerId,
): TradeAcceptance {
  const proposer = state.players[trade.fromPlayerId];
  const recipient = state.players[playerId];
  if (proposer === undefined || recipient === undefined) {
    return { canAccept: false, reason: 'A player in this trade is no longer available.' };
  }
  if (!canAfford(playerHand(proposer), trade.offered)) {
    return { canAccept: false, reason: 'The offering player no longer has the offered cards.' };
  }
  if (!canAfford(playerHand(recipient), trade.requested)) {
    return { canAccept: false, reason: 'You do not have all of the requested cards.' };
  }
  return { canAccept: true, reason: null };
}

export function respondToTrade(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'RESPOND_TO_TRADE' }>,
): DispatchResult {
  if (state.turn.phase !== 'ACTION_PHASE') {
    return rejectAction(state, 'WRONG_PHASE', 'Trade offers can only resolve during action phase.');
  }
  const interaction = state.pendingInteraction;
  if (interaction?.type !== 'TRADE_RESPONSES' || interaction.tradeId !== action.tradeId) {
    return rejectAction(
      state,
      'PENDING_INTERACTION_REQUIRED',
      'This trade offer is not waiting for responses.',
    );
  }
  const trade = state.tradeOffers[action.tradeId];
  if (trade === undefined) {
    return rejectAction(state, 'TRADE_NOT_FOUND', 'The trade offer could not be found.');
  }
  if (
    trade.status !== 'OPEN' ||
    !trade.recipientIds.includes(action.actorId) ||
    trade.responses[action.actorId] !== 'PENDING'
  ) {
    return rejectAction(state, 'TRADE_STALE', 'This trade offer is no longer open.');
  }

  if (action.accepted) {
    const acceptance = getTradeAcceptance(state, trade.id, action.actorId);
    if (!acceptance.canAccept) {
      return rejectAction(
        state,
        'TRADE_STALE',
        acceptance.reason ?? 'This trade is no longer valid.',
      );
    }
  }

  const response = action.accepted ? ('ACCEPTED' as const) : ('REJECTED' as const);
  const responses = { ...trade.responses, [action.actorId]: response };
  const allRecipientsRejected = trade.recipientIds.every(
    (recipientId) => responses[recipientId] === 'REJECTED',
  );
  const nextState: GameState = {
    ...state,
    tradeOffers: {
      ...state.tradeOffers,
      [trade.id]: {
        ...trade,
        responses,
        status: allRecipientsRejected ? 'CANCELLED' : trade.status,
      },
    },
    pendingInteraction: allRecipientsRejected ? null : state.pendingInteraction,
  };
  const events: GameEvent[] = [
    {
      type: action.accepted ? 'TRADE_ACCEPTED' : 'TRADE_REJECTED',
      tradeId: trade.id,
      playerId: trade.fromPlayerId,
      recipientId: action.actorId,
    },
  ];
  return acceptAction(state, action, nextState, events);
}

export function confirmTrade(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'CONFIRM_TRADE' }>,
): DispatchResult {
  if (state.turn.phase !== 'ACTION_PHASE') {
    return rejectAction(state, 'WRONG_PHASE', 'Trade offers can only resolve during action phase.');
  }
  const interaction = state.pendingInteraction;
  if (interaction?.type !== 'TRADE_RESPONSES' || interaction.tradeId !== action.tradeId) {
    return rejectAction(
      state,
      'PENDING_INTERACTION_REQUIRED',
      'This trade offer is not waiting for confirmation.',
    );
  }
  const trade = state.tradeOffers[action.tradeId];
  if (trade === undefined) {
    return rejectAction(state, 'TRADE_NOT_FOUND', 'The trade offer could not be found.');
  }
  if (
    trade.status !== 'OPEN' ||
    trade.fromPlayerId !== action.actorId ||
    trade.responses[action.recipientId] !== 'ACCEPTED'
  ) {
    return rejectAction(state, 'TRADE_STALE', 'Choose an opponent who accepted this offer.');
  }
  const acceptance = getTradeCompletion(state, trade, action.recipientId);
  if (!acceptance.canAccept) {
    return rejectAction(
      state,
      'TRADE_STALE',
      acceptance.reason ?? 'This trade is no longer valid.',
    );
  }
  const proposer = state.players[trade.fromPlayerId];
  const recipient = state.players[action.recipientId];
  if (proposer === undefined || recipient === undefined) {
    return rejectAction(state, 'TRADE_STALE', 'A player in this trade is no longer available.');
  }

  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [proposer.id]: withPlayerHand(
        proposer,
        addResourceBundles(
          subtractResourceBundles(playerHand(proposer), trade.offered),
          trade.requested,
        ),
      ),
      [recipient.id]: withPlayerHand(
        recipient,
        addResourceBundles(
          subtractResourceBundles(playerHand(recipient), trade.requested),
          trade.offered,
        ),
      ),
    },
    tradeOffers: {
      ...state.tradeOffers,
      [trade.id]: {
        ...trade,
        status: 'ACCEPTED',
        acceptedByPlayerId: action.recipientId,
      },
    },
    pendingInteraction: null,
  };
  const events: GameEvent[] = [
    {
      type: 'TRADE_COMPLETED',
      tradeId: trade.id,
      playerId: trade.fromPlayerId,
      recipientId: action.recipientId,
      offered: trade.offered,
      requested: trade.requested,
    },
  ];
  return acceptAction(state, action, nextState, events);
}

function closeTrade(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'CANCEL_TRADE' | 'EXPIRE_TRADE' }>,
): DispatchResult {
  const trade = state.tradeOffers[action.tradeId];
  if (trade === undefined) {
    return rejectAction(state, 'TRADE_NOT_FOUND', 'The trade offer could not be found.');
  }
  if (trade.status !== 'OPEN' || trade.fromPlayerId !== action.actorId) {
    return rejectAction(state, 'TRADE_STALE', 'This trade offer is no longer open.');
  }
  const nextState: GameState = {
    ...state,
    tradeOffers: {
      ...state.tradeOffers,
      [trade.id]: { ...trade, status: 'CANCELLED' },
    },
    pendingInteraction:
      state.pendingInteraction?.type === 'TRADE_RESPONSES' &&
      state.pendingInteraction.tradeId === trade.id
        ? null
        : state.pendingInteraction,
  };
  const events: GameEvent[] = [
    action.type === 'EXPIRE_TRADE'
      ? { type: 'TRADE_EXPIRED', tradeId: trade.id, playerId: trade.fromPlayerId }
      : { type: 'TRADE_CANCELLED', tradeId: trade.id, playerId: trade.fromPlayerId },
  ];
  return acceptAction(state, action, nextState, events);
}

export function cancelTrade(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'CANCEL_TRADE' }>,
): DispatchResult {
  return closeTrade(state, action);
}

export function expireTrade(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'EXPIRE_TRADE' }>,
): DispatchResult {
  return closeTrade(state, action);
}

export interface CancelledTradeOffers {
  readonly tradeOffers: GameState['tradeOffers'];
  readonly events: readonly GameEvent[];
}

export function cancelOpenTradeOffers(state: GameState, playerId: PlayerId): CancelledTradeOffers {
  const cancelledIds = Object.values(state.tradeOffers)
    .filter((trade) => trade.status === 'OPEN' && trade.fromPlayerId === playerId)
    .map((trade) => trade.id);
  if (cancelledIds.length === 0) {
    return { tradeOffers: state.tradeOffers, events: [] };
  }

  const cancelledIdSet = new Set<TradeId>(cancelledIds);
  return {
    tradeOffers: Object.fromEntries(
      Object.entries(state.tradeOffers).map(([id, trade]) => [
        id,
        cancelledIdSet.has(trade.id) ? { ...trade, status: 'CANCELLED' as const } : trade,
      ]),
    ),
    events: cancelledIds.map((tradeId) => ({ type: 'TRADE_CANCELLED', tradeId, playerId })),
  };
}
