import { getKNProgressCardDefinition } from '../engine/content/kn-progress-cards';
import { resourceBundle } from '../engine/content/types';
import type { GameEvent } from '../engine/core/events';
import type {
  GameState,
  KNProgressCardInstance,
  ProgressCardInstance,
} from '../engine/core/game-state';
import { cardInstanceId, resourceId } from '../engine/core/ids';
import type { CardInstanceId, PlayerId } from '../engine/core/ids';
import type { OnlineGameView, PublicPlayerCardInfo } from './protocol';

const EMPTY_FAMILY_COUNTS = { SCIENCE: 0, TRADE: 0, POLITICS: 0 } as const;

function bundleCount(bundle: Readonly<Record<string, number | undefined>>): number {
  return Object.values(bundle).reduce<number>((total, amount) => total + (amount ?? 0), 0);
}

export function summarizePlayerCards(
  state: GameState,
): Readonly<Record<string, PublicPlayerCardInfo>> {
  return Object.fromEntries(
    Object.values(state.players).map((player) => {
      const progressFamilies = { ...EMPTY_FAMILY_COUNTS };
      for (const instanceId of player.knProgressCardIds) {
        const card = state.kn?.progressCards[instanceId];
        const definition =
          card === undefined ? undefined : getKNProgressCardDefinition(card.definitionId);
        if (definition !== undefined) progressFamilies[definition.family] += 1;
      }
      return [
        player.id,
        {
          resourceCards: bundleCount(player.resources),
          commodityCards: bundleCount(player.commodities),
          progressCards:
            state.kn === null ? player.progressCardIds.length : player.knProgressCardIds.length,
          progressFamilies,
        },
      ] as const;
    }),
  );
}

function hiddenIds(prefix: string, count: number): readonly CardInstanceId[] {
  return Array.from({ length: count }, (_, index) => cardInstanceId(`${prefix}-${index}`));
}

function visibleClassicCards(
  state: GameState,
  viewerPlayerId: PlayerId,
): Readonly<Record<string, ProgressCardInstance>> {
  return Object.fromEntries(
    Object.values(state.progressCards)
      .filter(
        (card) =>
          state.turn.phase === 'GAME_OVER' ||
          card.ownerId === viewerPlayerId ||
          card.playedTurn !== null ||
          state.progressDiscard.includes(card.instanceId),
      )
      .map((card) => [card.instanceId, card] as const),
  );
}

function visibleKNCards(
  state: GameState,
  viewerPlayerId: PlayerId,
  recentEvents: readonly GameEvent[],
): Readonly<Record<string, KNProgressCardInstance>> {
  if (state.kn === null) return {};
  const privatelyRevealedIds = new Set(
    state.pendingInteraction?.type === 'KN_SELECTION' &&
      state.pendingInteraction.playerId === viewerPlayerId &&
      state.pendingInteraction.purpose === 'SPY_CARD'
      ? state.pendingInteraction.eligibleIds
      : [],
  );
  for (const event of recentEvents) {
    if (event.type !== 'KN_PROGRESS_CARD_RESOLVED' || event.targetIds?.[0] !== viewerPlayerId) {
      continue;
    }
    const definition = getKNProgressCardDefinition(event.cardDefinitionId);
    const transferredCardId = event.targetIds[1];
    if (definition?.effect === 'SPY' && transferredCardId !== undefined) {
      privatelyRevealedIds.add(transferredCardId);
    }
  }
  return Object.fromEntries(
    Object.values(state.kn.progressCards)
      .filter(
        (card) =>
          card.ownerId === viewerPlayerId ||
          privatelyRevealedIds.has(card.instanceId) ||
          card.playedTurn !== null ||
          card.revealed ||
          Object.values(state.kn?.progressDiscards ?? {}).some((discard) =>
            discard.includes(card.instanceId),
          ),
      )
      .map((card) => [card.instanceId, card] as const),
  );
}

function projectEvents(
  events: readonly GameEvent[],
  viewerPlayerId: PlayerId,
): readonly GameEvent[] {
  return events.map((event) => {
    if (
      event.type === 'RESOURCE_STOLEN' &&
      event.playerId !== viewerPlayerId &&
      event.targetPlayerId !== viewerPlayerId
    ) {
      return { ...event, resourceId: resourceId('hidden-card'), hidden: true };
    }
    if (
      event.type === 'WEDDING_CARDS_TRANSFERRED' &&
      event.playerId !== viewerPlayerId &&
      event.targetPlayerId !== viewerPlayerId
    ) {
      return { ...event, resources: resourceBundle([]), hiddenCount: bundleCount(event.resources) };
    }
    if (event.type === 'PROGRESS_CARD_BOUGHT' && event.playerId !== viewerPlayerId) {
      return {
        ...event,
        cardInstanceId: cardInstanceId(`hidden-progress-draw-${event.playerId}`),
        cardDefinitionId: 'hidden-progress-card' as typeof event.cardDefinitionId,
      };
    }
    if (event.type === 'KN_PROGRESS_CARD_DRAWN' && event.playerId !== viewerPlayerId) {
      return {
        ...event,
        cardInstanceId: cardInstanceId(`hidden-kn-draw-${event.playerId}-${event.family}`),
      };
    }
    if (event.type === 'KN_PROGRESS_CARD_DISCARDED' && event.playerId !== viewerPlayerId) {
      return {
        ...event,
        cardInstanceId: cardInstanceId(`hidden-kn-discard-${event.playerId}-${event.family}`),
      };
    }
    if (event.type === 'KN_PROGRESS_CARD_RESOLVED') {
      const definition = getKNProgressCardDefinition(event.cardDefinitionId);
      if (definition?.effect === 'MASTER_MERCHANT') {
        const targetPlayerId = event.targetIds?.[0];
        return event.playerId === viewerPlayerId || targetPlayerId === viewerPlayerId
          ? event
          : { ...event, resources: resourceBundle([]), targetIds: [] };
      }
      if (definition?.effect === 'SPY' && event.playerId !== viewerPlayerId) {
        const targetPlayerId = event.targetIds?.[0];
        return targetPlayerId === viewerPlayerId
          ? event
          : { ...event, targetIds: targetPlayerId === undefined ? [] : [targetPlayerId] };
      }
    }
    if (
      event.type === 'KN_PROGRESS_CARD_RESOLVED' &&
      event.playerId !== viewerPlayerId &&
      event.targetIds !== undefined
    ) {
      return { ...event, targetIds: [] };
    }
    return event;
  });
}

/**
 * Builds a structurally compatible client snapshot without shipping hidden deck order,
 * opponent hands, deterministic RNG state, or the seed that could recreate them.
 */
export function projectGameState(
  state: GameState,
  viewerPlayerId: PlayerId,
  recentEvents: readonly GameEvent[] = [],
): GameState {
  const masterMerchantTargetId =
    state.pendingInteraction?.type === 'KN_SELECTION' &&
    state.pendingInteraction.playerId === viewerPlayerId &&
    state.pendingInteraction.purpose === 'MASTER_MERCHANT_CARDS'
      ? (state.pendingInteraction.context.targetPlayerId as PlayerId | undefined)
      : undefined;
  const players = Object.fromEntries(
    Object.values(state.players).map((player) => [
      player.id,
      player.id === viewerPlayerId
        ? player
        : player.id === masterMerchantTargetId
          ? {
              ...player,
              progressCardIds: [],
              knProgressCardIds: [],
            }
          : {
              ...player,
              resources: resourceBundle([]),
              commodities: resourceBundle([]),
              progressCardIds: [],
              knProgressCardIds: [],
            },
    ]),
  );
  const pendingInteraction = (() => {
    const interaction = state.pendingInteraction;
    if (interaction?.type !== 'KN_SELECTION') return interaction;
    if (interaction.simultaneous === true && interaction.queue.includes(viewerPlayerId)) {
      return { ...interaction, playerId: viewerPlayerId, context: {} };
    }
    return interaction.playerId === viewerPlayerId
      ? interaction
      : { ...interaction, eligibleIds: [], context: {} };
  })();
  const hideBank = state.config.hideBankCards === true;

  return {
    ...state,
    config: { ...state.config, seed: 'server-redacted' },
    players,
    bank: hideBank
      ? resourceBundle(
          Object.keys(state.bank).map((id) => [
            resourceId(id),
            state.config.rules.bankCardsPerResource,
          ]),
        )
      : state.bank,
    commodityBank: hideBank
      ? resourceBundle(
          Object.keys(state.commodityBank).map((id) => [
            resourceId(id),
            state.config.rules.bankCardsPerResource,
          ]),
        )
      : state.commodityBank,
    progressDeck: hiddenIds('hidden-progress-deck', state.progressDeck.length),
    progressCards: visibleClassicCards(state, viewerPlayerId),
    statistics: state.turn.phase === 'GAME_OVER' ? state.statistics : undefined,
    pendingInteraction,
    random: {
      algorithm: 'mulberry32',
      seed: 'server-redacted',
      value: 0,
      draws: 0,
    },
    balancedDice:
      state.balancedDice === null
        ? null
        : {
            remainingPairIds: Array.from(
              { length: state.balancedDice.remainingPairIds.length },
              (_, index) => index,
            ),
            recentTotals: state.balancedDice.recentTotals,
          },
    kn:
      state.kn === null
        ? null
        : {
            ...state.kn,
            progressDecks: {
              SCIENCE: hiddenIds('hidden-science-deck', state.kn.progressDecks.SCIENCE.length),
              TRADE: hiddenIds('hidden-trade-deck', state.kn.progressDecks.TRADE.length),
              POLITICS: hiddenIds('hidden-politics-deck', state.kn.progressDecks.POLITICS.length),
            },
            progressCards: visibleKNCards(state, viewerPlayerId, recentEvents),
          },
  };
}

export function createOnlineGameView(
  state: GameState,
  viewerPlayerId: PlayerId,
  revision: number,
  recentEvents: readonly GameEvent[],
  eventHistory: readonly GameEvent[],
  paused: boolean,
  debugMode: boolean,
  deadlineAt: number | null,
  tradeDeadlineAt: number | null,
): OnlineGameView {
  return {
    revision,
    state: projectGameState(state, viewerPlayerId, recentEvents),
    recentEvents: projectEvents(recentEvents, viewerPlayerId),
    eventHistory: projectEvents(eventHistory, viewerPlayerId),
    paused,
    debugMode,
    deadlineAt,
    tradeDeadlineAt,
    serverTimeMs: Date.now(),
    playerCards: summarizePlayerCards(state),
  };
}
