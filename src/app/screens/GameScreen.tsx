import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import '../app.css';

import { useAppStore } from '../stores/app-store';
import { useOnlineStore } from '../stores/online-store';
import { audioManager } from '../audio/audio-manager';
import { BoardViewport } from '../../board-renderer/BoardViewport';
import type {
  BoardTarget,
  BoardViewportPoint,
  ProgressCardFlyover,
  ResourceFlyover,
} from '../../board-renderer/render-model';
import { PLAYER_COLORS } from '../../engine/content/colors';
import { PROGRESS_CARDS } from '../../engine/content/progress-cards';
import { RESOURCES, RESOURCE_IDS, TERRAINS } from '../../engine/content/resources';
import { COMMODITY_IDS, HAND_GOODS, isCommodityId } from '../../engine/content/commodities';
import { getKNProgressCardDefinition } from '../../engine/content/kn-progress-cards';
import { resourceBundle } from '../../engine/content/types';
import type { KNProgressFamily, ResourceBundle } from '../../engine/content/types';
import type { GameEvent } from '../../engine/core/events';
import type { GameState, KnightState, PlayerState } from '../../engine/core/game-state';
import { actionId, tradeId } from '../../engine/core/ids';
import type {
  CardInstanceId,
  EdgeId,
  HexId,
  KnightId,
  ResourceId,
  TradeId,
  VertexId,
} from '../../engine/core/ids';
import { hasAdminDisplayName } from '../../multiplayer/admin-access';
import {
  getConstructionAvailability,
  getPotentialHouseVertexIds,
  getPotentialMansionVertexIds,
  getPotentialRoadEdgeIds,
  getValidHouseVertexIds,
  getValidMansionVertexIds,
  getValidRoadEdgeIds,
} from '../../engine/rules/build-rules';
import type { ConstructionType } from '../../engine/rules/build-rules';
import { getValidRobberHexIds } from '../../engine/rules/robber-rules';
import {
  getLegalFreeRoadEdgeIds,
  getProgressCardDefinition,
  getProgressCardPurchaseAvailability,
} from '../../engine/rules/progress-card-rules';
import {
  calculateLongestRoadLength,
  calculatePublicScore,
  calculateRoadChainThroughEdge,
  calculateScore,
} from '../../engine/rules/scoring-rules';
import {
  getLegalSetupHouseVertexIds,
  getLegalSetupRoadEdgeIds,
  getSetupBuildingType,
  getSetupProgress,
} from '../../engine/rules/setup-rules';
import { getBankTradeRatio } from '../../engine/rules/trade-rules';
import { combinedBank } from '../../engine/rules/resource-rules';
import { Button } from '../../ui/components/Button';
import { Modal } from '../../ui/components/Modal';
import { ActivityLog } from '../../ui/game/ActivityLog';
import {
  ActionSupplyBadge,
  CityActionIcon,
  EndTurnActionIcon,
  HouseActionIcon,
  ProgressActionIcon,
  PurchaseCostPreview,
  RoadActionIcon,
  TradeActionIcon,
  WallActionIcon,
} from '../../ui/game/ActionArtwork';
import { BankPanel } from '../../ui/game/BankPanel';
import {
  BoardBuildPopover,
  type BoardBuildChoice,
  type BoardPurchaseType,
} from '../../ui/game/BoardBuildPopover';
import { DicePanel } from '../../ui/game/DicePanel';
import { DiscardModal } from '../../ui/game/DiscardModal';
import { HandTray } from '../../ui/game/HandTray';
import { PlayerPanel } from '../../ui/game/PlayerPanel';
import { ProgressCardChoiceModal } from '../../ui/game/ProgressCardChoiceModal';
import { StealTargetModal } from '../../ui/game/StealTargetModal';
import { TradeModal } from '../../ui/game/TradeModal';
import { TradeResponsePanel } from '../../ui/game/TradeResponseModal';
import { TurnTimer } from '../../ui/game/TurnTimer';
import { VictoryModal } from '../../ui/game/VictoryModal';
import { KNInteractionModal } from '../../ui/game/KNInteractionModal';
import { KNChoiceTray } from '../../ui/game/KNChoiceTray';
import { KNActionPanel, type KnightCommand } from '../../ui/game/KNActionPanel';
import { KnightBoardPopover } from '../../ui/game/KnightBoardPopover';
import { BarbarianTracker } from '../../ui/game/BarbarianTracker';
import {
  getKnightActionReason,
  getLegalKnightDisplacementTargetIds,
  getLegalKnightMoveVertexIds,
  getLegalKnightPlacementVertexIds,
  getLegalRobberChasingKnightIds,
  getLegalWallVertexIds,
  KNIGHT_COST,
  WALL_COST,
} from '../../engine/rules/kn-construction-rules';

const TIMER_BOOST_EVENT_TYPES = new Set<GameEvent['type']>([
  'BUILDING_PLACED',
  'BUILDING_UPGRADED',
  'ROAD_BUILT',
  'TRADE_COMPLETED',
  'COMMERCIAL_HARBOR_EXCHANGED',
  'PROGRESS_CARD_BOUGHT',
  'PROGRESS_CARD_PLAYED',
  'KNIGHT_BUILT',
  'KNIGHT_ACTIVATED',
  'KNIGHT_UPGRADED',
  'KNIGHT_MOVED',
  'KNIGHT_DISPLACED',
  'WALL_BUILT',
  'IMPROVEMENT_BOUGHT',
  'KN_PROGRESS_CARD_RESOLVED',
  'MERCHANT_MOVED',
  'METROPOLIS_CHANGED',
]);

function phaseLabel(phase: GameState['turn']['phase']): string {
  const labels: Record<GameState['turn']['phase'], string> = {
    INITIALIZING: 'Board ready',
    SETUP_PLACE_HOUSE: 'Place a house',
    SETUP_PLACE_ROAD: 'Place a road',
    WAITING_FOR_ROLL: 'Roll Dice',
    RESOLVING_PRODUCTION: 'Producing resources',
    DISCARD_RESOURCES: 'Discard resources',
    MOVE_ROBBER: 'Move Robber',
    CHOOSE_STEAL_TARGET: 'Choose target',
    ACTION_PHASE: 'Take Actions',
    CARD_RESOLUTION: 'Resolve progress card',
    GAME_OVER: 'Game over',
  };
  return labels[phase];
}

function accessiblePhaseLabel(phase: GameState['turn']['phase']): string {
  const labels: Record<GameState['turn']['phase'], string> = {
    INITIALIZING: 'Initializing',
    SETUP_PLACE_HOUSE: 'Place a house',
    SETUP_PLACE_ROAD: 'Place a road',
    WAITING_FOR_ROLL: 'Waiting for roll',
    RESOLVING_PRODUCTION: 'Resolving production',
    DISCARD_RESOURCES: 'Discard resources',
    MOVE_ROBBER: 'Robber placement phase',
    CHOOSE_STEAL_TARGET: 'Choose steal target',
    ACTION_PHASE: 'Action phase',
    CARD_RESOLUTION: 'Resolve progress card',
    GAME_OVER: 'Game over',
  };
  return labels[phase];
}

type KNSelectionInteraction = Extract<
  NonNullable<GameState['pendingInteraction']>,
  { readonly type: 'KN_SELECTION' }
>;

function knSelectionActivityLabel(purpose: KNSelectionInteraction['purpose']): string {
  switch (purpose) {
    case 'AQUEDUCT_RESOURCE':
      return 'Choosing an Aqueduct card';
    case 'DEFENDER_TIE_DECK':
      return 'Choosing a defender reward';
    case 'BARBARIAN_CITY_LOSS':
      return 'Choosing a City to lose';
    case 'PROGRESS_DISCARD':
      return 'Returning a Progress Card';
    case 'RELOCATE_DISPLACED_KNIGHT':
      return 'Moving a displaced Knight';
    case 'SMITH_KNIGHT':
      return 'Upgrading a Knight';
    case 'DESERTER_KNIGHT':
      return 'Choosing a Knight for Deserter';
    case 'DESERTER_PLACE_KNIGHT':
      return 'Placing a Knight';
    case 'SABOTEUR_DISCARD':
      return 'Discarding cards for Saboteur';
    case 'WEDDING_CARDS':
      return 'Choosing cards for Wedding';
    case 'SPY_PLAYER':
      return 'Choosing a player for Spy';
    case 'SPY_CARD':
      return 'Choosing a Progress Card for Spy';
    case 'MASTER_MERCHANT_PLAYER':
    case 'MASTER_MERCHANT_CARDS':
      return 'Resolving Master Merchant';
    case 'MERCHANT_HEX':
      return 'Placing the Merchant';
    case 'BISHOP_HEX':
      return 'Moving the robber with Bishop';
    case 'INVENTOR_FIRST_TOKEN':
    case 'INVENTOR_SECOND_TOKEN':
      return 'Choosing number tokens for Inventor';
    case 'RECLAMATION_HEX':
    case 'RECLAMATION_RESOURCE':
      return 'Choosing a tile for Reclamation';
    case 'COMMERCIAL_HARBOR_PLAYER':
    case 'COMMERCIAL_HARBOR_RESOURCE':
    case 'COMMERCIAL_HARBOR_COMMODITY':
      return 'Resolving Commercial Harbor';
    case 'METROPOLIS_CITY':
      return 'Choosing a Metropolis City';
    case 'ALCHEMIST_DICE':
      return 'Choosing Alchemist dice';
    case 'ENGINEER_WALL':
      return 'Choosing a City for a Wall';
    case 'MEDICINE_CITY':
      return 'Choosing a City for Medicine';
    case 'ROAD_BUILDING':
      return 'Placing free Roads';
    case 'MERCHANT_FLEET_GOOD':
      return 'Choosing a Merchant Fleet card';
    case 'RESOURCE_MONOPOLY':
    case 'COMMODITY_MONOPOLY':
      return 'Choosing a card for Monopoly';
    case 'DESERTER_PLAYER':
      return 'Choosing a player for Deserter';
    case 'DIPLOMAT_ROAD':
    case 'DIPLOMAT_RELOCATE_ROAD':
      return 'Moving a Road with Diplomat';
    case 'WAR_DRUMS_POSITION':
      return 'Choosing the Barbarian position';
  }
}

function activitySentence(
  state: GameState,
  playerIds: readonly PlayerState['id'][],
  activityLabel: string,
): string {
  const names = playerIds.map((playerId) => state.players[playerId]?.name ?? 'A player');
  const subject =
    names.length === 1
      ? names[0]!
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.length} players`;
  return `${subject} ${names.length === 1 ? 'is' : 'are'} ${activityLabel[0]?.toLocaleLowerCase() ?? ''}${activityLabel.slice(1)}`;
}

function isUncommittedKNCardPreview(
  state: GameState,
  interaction: KNSelectionInteraction,
): boolean {
  return (
    state.turn.phase === 'CARD_RESOLUTION' &&
    interaction.sourceCardId !== undefined &&
    interaction.canCancel &&
    interaction.context.committed !== true
  );
}

function pendingPlayerActivities(state: GameState): Readonly<Record<string, string>> {
  const interaction = state.pendingInteraction;
  if (interaction === null) return {};
  if (interaction.type === 'DISCARD_RESOURCES') {
    return Object.fromEntries(interaction.queue.map((playerId) => [playerId, 'Discarding cards']));
  }
  if (interaction.type === 'KN_SELECTION') {
    const players = interaction.simultaneous === true ? interaction.queue : [interaction.playerId];
    const label = isUncommittedKNCardPreview(state, interaction)
      ? 'Taking actions'
      : knSelectionActivityLabel(interaction.purpose);
    return Object.fromEntries(players.map((playerId) => [playerId, label]));
  }
  if (interaction.type === 'TRADE_RESPONSES') {
    const trade = state.tradeOffers[interaction.tradeId];
    return Object.fromEntries(
      (trade?.recipientIds ?? [])
        .filter((playerId) => (trade?.responses[playerId] ?? 'PENDING') === 'PENDING')
        .map((playerId) => [playerId, 'Considering a trade']),
    );
  }
  const playerId = interaction.playerId;
  const label =
    interaction.type === 'MOVE_ROBBER'
      ? 'Moving the robber'
      : interaction.type === 'CHOOSE_STEAL_TARGET'
        ? 'Choosing a player to rob'
        : interaction.type === 'PLACE_FREE_ROADS'
          ? 'Placing free Roads'
          : 'Choosing Progress Card resources';
  return { [playerId]: label };
}

function describeTarget(state: GameState, target: BoardTarget | null): string {
  if (target === null) return 'Hover a tile, road edge, corner, or port to inspect its stable ID.';

  if (target.kind === 'HEX') {
    const hex = state.board.hexes[target.id];
    const terrain = TERRAINS.find((definition) => definition.id === hex?.terrainId);
    if (hex === undefined) return target.id;
    return `${terrain?.displayName ?? 'Unknown terrain'} · ${hex.numberToken ?? 'no token'} · ${target.id}`;
  }

  if (target.kind === 'PORT') {
    const port = state.board.ports[target.id];
    if (port === undefined) return target.id;
    return `${port.resourceId ?? 'Any resource'} ${port.tradeRatio}:1 port · ${target.id}`;
  }

  return `${target.kind === 'EDGE' ? 'Road edge' : 'Building corner'} · ${target.id}`;
}

function resourceCount(resources: ResourceBundle): number {
  return HAND_GOODS.reduce((total, resource) => total + (resources[resource.id] ?? 0), 0);
}

function resourceBundleLabel(resources: ResourceBundle): string {
  return HAND_GOODS.flatMap((resource) => {
    const amount = resources[resource.id] ?? 0;
    return amount > 0 ? [`${amount} ${resource.displayName}`] : [];
  }).join(' · ');
}

function productionFlyovers(
  events: readonly GameEvent[],
  state: GameState | null,
  visiblePlayerId: PlayerState['id'] | null,
  restrictToViewer = false,
): readonly ResourceFlyover[] {
  if (state === null || visiblePlayerId === null) return [];
  const flyovers: ResourceFlyover[] = [];
  let sequence = 0;
  const production = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'RESOURCES_PRODUCED' }> =>
      event.type === 'RESOURCES_PRODUCED',
  );
  if (production?.source === 'DICE' && production.rollTotal !== null) {
    const grants = production.grants[visiblePlayerId];
    const producingHexes = new Map<ResourceId, HexId[]>();
    for (const hex of Object.values(state.board.hexes)) {
      if (
        hex.numberToken !== production.rollTotal ||
        hex.id === state.board.robberHexId ||
        hex.resourceId === null ||
        production.unavailableResourceIds.includes(hex.resourceId)
      ) {
        continue;
      }
      const sources = producingHexes.get(hex.resourceId) ?? [];
      for (const vertexId of hex.vertexIds) {
        const building = state.board.vertices[vertexId]?.building;
        if (building?.ownerId !== visiblePlayerId) continue;
        if (building.type !== 'MANSION' || state.kn === null) {
          const cardsProduced = building.type === 'MANSION' ? 2 : 1;
          for (let index = 0; index < cardsProduced; index += 1) sources.push(hex.id);
          continue;
        }
        sources.push(hex.id);
        const commodityId =
          hex.resourceId === 'wood'
            ? COMMODITY_IDS.paper
            : hex.resourceId === 'livestock'
              ? COMMODITY_IDS.cloth
              : hex.resourceId === 'ore'
                ? COMMODITY_IDS.coin
                : null;
        if (commodityId === null) sources.push(hex.id);
        else {
          const commoditySources = producingHexes.get(commodityId) ?? [];
          commoditySources.push(hex.id);
          producingHexes.set(commodityId, commoditySources);
        }
      }
      producingHexes.set(hex.resourceId, sources);
    }

    if (grants !== undefined) {
      for (const resource of state.kn === null ? RESOURCES : HAND_GOODS) {
        const amount = grants[resource.id] ?? 0;
        const sources = producingHexes.get(resource.id) ?? [];
        for (let index = 0; index < amount && sources.length > 0; index += 1) {
          const sourceHexId = sources[index % sources.length]!;
          flyovers.push({
            id: `${state.config.gameId}-${state.actionSequence}-production-${resource.id}-${index}-${sourceHexId}`,
            source: { kind: 'HEX', hexId: sourceHexId },
            resourceId: resource.id,
            delayMs: sequence * 140,
          });
          sequence += 1;
        }
      }
    }
  }
  if (production?.source === 'SETUP') {
    const grants = production.grants[visiblePlayerId];
    const setupVertex =
      state.turn.setupPlacementVertexId === null
        ? undefined
        : state.board.vertices[state.turn.setupPlacementVertexId];
    if (grants !== undefined && setupVertex !== undefined) {
      for (const resource of RESOURCES) {
        const amount = grants[resource.id] ?? 0;
        const sourceHexIds = setupVertex.adjacentHexIds.filter(
          (hexId) => state.board.hexes[hexId]?.resourceId === resource.id,
        );
        for (let index = 0; index < amount && sourceHexIds.length > 0; index += 1) {
          const sourceHexId = sourceHexIds[index % sourceHexIds.length]!;
          flyovers.push({
            id: `${state.config.gameId}-${state.actionSequence}-setup-${resource.id}-${index}-${sourceHexId}`,
            source: { kind: 'HEX', hexId: sourceHexId },
            resourceId: resource.id,
            delayMs: sequence * 140,
          });
          sequence += 1;
        }
      }
    }
  }

  const progress = events.find(
    (
      event,
    ): event is Extract<
      GameEvent,
      { readonly type: 'PROGRESS_CARD_RESOLVED' | 'KN_PROGRESS_CARD_RESOLVED' }
    > => event.type === 'PROGRESS_CARD_RESOLVED' || event.type === 'KN_PROGRESS_CARD_RESOLVED',
  );
  const knProgressDefinition =
    progress?.type === 'KN_PROGRESS_CARD_RESOLVED'
      ? getKNProgressCardDefinition(progress.cardDefinitionId)
      : undefined;
  const progressTargetIds =
    progress?.type === 'KN_PROGRESS_CARD_RESOLVED' ? progress.targetIds : undefined;
  if (
    progress?.resources !== undefined &&
    (!restrictToViewer ||
      progress.playerId === visiblePlayerId ||
      (knProgressDefinition?.effect === 'MASTER_MERCHANT' &&
        progressTargetIds?.[0] === visiblePlayerId))
  ) {
    const masterMerchantSourceId =
      knProgressDefinition?.effect === 'MASTER_MERCHANT'
        ? (progressTargetIds?.[0] as PlayerState['id'] | undefined)
        : undefined;
    for (const resource of HAND_GOODS) {
      const amount = progress.resources[resource.id] ?? 0;
      for (let index = 0; index < amount; index += 1) {
        flyovers.push({
          id: `${state.config.gameId}-${state.actionSequence}-bank-${progress.cardInstanceId}-${resource.id}-${index}`,
          source:
            masterMerchantSourceId === undefined
              ? { kind: 'BANK' }
              : { kind: 'PLAYER', playerId: masterMerchantSourceId },
          ...(masterMerchantSourceId === undefined
            ? {}
            : { target: { kind: 'PLAYER' as const, playerId: progress.playerId } }),
          resourceId: resource.id,
          delayMs: sequence * 140,
        });
        sequence += 1;
      }
    }
  }
  if (
    progress?.resourceId !== undefined &&
    progress.transfers !== undefined &&
    (!restrictToViewer ||
      progress.playerId === visiblePlayerId ||
      Object.hasOwn(progress.transfers, visiblePlayerId))
  ) {
    for (const [playerId, amount] of Object.entries(progress.transfers)) {
      for (let index = 0; index < amount; index += 1) {
        flyovers.push({
          id: `${state.config.gameId}-${state.actionSequence}-monopoly-${progress.cardInstanceId}-${playerId}-${index}`,
          source: { kind: 'PLAYER', playerId: playerId as PlayerState['id'] },
          target: { kind: 'PLAYER', playerId: progress.playerId },
          resourceId: progress.resourceId,
          delayMs: sequence * 140,
        });
        sequence += 1;
      }
    }
  }

  for (const stolen of events.filter(
    (event): event is Extract<GameEvent, { readonly type: 'RESOURCE_STOLEN' }> =>
      event.type === 'RESOURCE_STOLEN',
  )) {
    if (stolen.playerId !== visiblePlayerId && stolen.targetPlayerId !== visiblePlayerId) continue;
    flyovers.push({
      id: `${state.config.gameId}-${state.actionSequence}-steal-${stolen.targetPlayerId}-${stolen.resourceId}-${sequence}`,
      source: { kind: 'PLAYER', playerId: stolen.targetPlayerId },
      targetPlayerId: stolen.playerId,
      resourceId: stolen.resourceId,
      delayMs: sequence * 140,
    });
    sequence += 1;
  }
  for (const exchange of events.filter(
    (event): event is Extract<GameEvent, { readonly type: 'COMMERCIAL_HARBOR_EXCHANGED' }> =>
      event.type === 'COMMERCIAL_HARBOR_EXCHANGED',
  )) {
    if (
      restrictToViewer &&
      exchange.playerId !== visiblePlayerId &&
      exchange.targetPlayerId !== visiblePlayerId
    )
      continue;
    for (const movement of [
      {
        id: `offered-${exchange.offeredResourceId}`,
        sourcePlayerId: exchange.playerId,
        targetPlayerId: exchange.targetPlayerId,
        resourceId: exchange.offeredResourceId,
      },
      {
        id: `received-${exchange.receivedCommodityId}`,
        sourcePlayerId: exchange.targetPlayerId,
        targetPlayerId: exchange.playerId,
        resourceId: exchange.receivedCommodityId,
      },
    ] as const) {
      flyovers.push({
        id: `${state.config.gameId}-${state.actionSequence}-harbor-${movement.id}-${sequence}`,
        source: { kind: 'PLAYER', playerId: movement.sourcePlayerId },
        target: { kind: 'PLAYER', playerId: movement.targetPlayerId },
        resourceId: movement.resourceId,
        delayMs: sequence * 140,
      });
      sequence += 1;
    }
  }
  for (const aqueduct of events.filter(
    (event): event is Extract<GameEvent, { readonly type: 'AQUEDUCT_RESOURCE_CHOSEN' }> =>
      event.type === 'AQUEDUCT_RESOURCE_CHOSEN',
  )) {
    if (restrictToViewer && aqueduct.playerId !== visiblePlayerId) continue;
    flyovers.push({
      id: `${state.config.gameId}-${state.actionSequence}-aqueduct-${aqueduct.resourceId}`,
      source: { kind: 'BANK' },
      resourceId: aqueduct.resourceId,
      delayMs: sequence * 140,
    });
    sequence += 1;
  }
  for (const wedding of events.filter(
    (event): event is Extract<GameEvent, { readonly type: 'WEDDING_CARDS_TRANSFERRED' }> =>
      event.type === 'WEDDING_CARDS_TRANSFERRED',
  )) {
    if (
      restrictToViewer &&
      wedding.playerId !== visiblePlayerId &&
      wedding.targetPlayerId !== visiblePlayerId
    )
      continue;
    for (const good of HAND_GOODS) {
      const amount = wedding.resources[good.id] ?? 0;
      for (let index = 0; index < amount; index += 1) {
        flyovers.push({
          id: `${state.config.gameId}-${state.actionSequence}-wedding-${wedding.targetPlayerId}-${good.id}-${index}`,
          source: { kind: 'PLAYER', playerId: wedding.targetPlayerId },
          target: { kind: 'PLAYER', playerId: wedding.playerId },
          targetPlayerId: wedding.playerId,
          resourceId: good.id,
          delayMs: sequence * 140,
        });
        sequence += 1;
      }
    }
  }
  for (const discarded of events.filter(
    (event): event is Extract<GameEvent, { readonly type: 'RESOURCES_DISCARDED' }> =>
      event.type === 'RESOURCES_DISCARDED',
  )) {
    if (restrictToViewer && discarded.playerId !== visiblePlayerId) continue;
    for (const good of HAND_GOODS) {
      const amount = discarded.resources[good.id] ?? 0;
      for (let index = 0; index < amount; index += 1) {
        flyovers.push({
          id: `${state.config.gameId}-${state.actionSequence}-discard-${discarded.playerId}-${good.id}-${index}`,
          source: { kind: 'PLAYER', playerId: discarded.playerId },
          target: { kind: 'BANK' },
          resourceId: good.id,
          delayMs: sequence * 140,
        });
        sequence += 1;
      }
    }
  }
  for (const trade of events.filter(
    (event): event is Extract<GameEvent, { readonly type: 'TRADE_COMPLETED' }> =>
      event.type === 'TRADE_COMPLETED',
  )) {
    if (
      restrictToViewer &&
      trade.playerId !== visiblePlayerId &&
      trade.recipientId !== visiblePlayerId
    )
      continue;
    for (const good of HAND_GOODS) {
      const offeredAmount = trade.offered[good.id] ?? 0;
      for (let index = 0; index < offeredAmount; index += 1) {
        flyovers.push({
          id: `${state.config.gameId}-${state.actionSequence}-trade-offered-${trade.tradeId ?? 'bank'}-${good.id}-${index}`,
          source: { kind: 'PLAYER', playerId: trade.playerId },
          target:
            trade.recipientId === null
              ? { kind: 'BANK' }
              : { kind: 'PLAYER', playerId: trade.recipientId },
          resourceId: good.id,
          delayMs: sequence * 140,
        });
        sequence += 1;
      }
      const requestedAmount = trade.requested[good.id] ?? 0;
      for (let index = 0; index < requestedAmount; index += 1) {
        flyovers.push({
          id: `${state.config.gameId}-${state.actionSequence}-trade-requested-${trade.tradeId ?? 'bank'}-${good.id}-${index}`,
          source:
            trade.recipientId === null
              ? { kind: 'BANK' }
              : { kind: 'PLAYER', playerId: trade.recipientId },
          target: { kind: 'PLAYER', playerId: trade.playerId },
          resourceId: good.id,
          delayMs: sequence * 140,
        });
        sequence += 1;
      }
    }
  }

  return flyovers;
}

function progressCardMovementFlyovers(
  events: readonly GameEvent[],
  state: GameState | null,
  visiblePlayerId: PlayerState['id'] | null,
): readonly ProgressCardFlyover[] {
  if (state === null || visiblePlayerId === null) return [];
  return events.flatMap<ProgressCardFlyover>((event, index) => {
    if (event.type === 'PROGRESS_CARD_BOUGHT') {
      if (event.playerId !== visiblePlayerId) return [];
      return [
        {
          id: `${state.config.gameId}-${state.actionSequence}-progress-draw-${event.cardInstanceId}-${index}`,
          source: { kind: 'DECK' } as const,
          targetPlayerId: event.playerId,
          cardDefinitionId: event.cardDefinitionId,
          delayMs: 0,
        },
      ];
    }
    if (event.type === 'KN_PROGRESS_CARD_DRAWN') {
      if (event.playerId !== visiblePlayerId) return [];
      const drawnCard = state.kn?.progressCards[event.cardInstanceId];
      if (drawnCard === undefined) return [];
      return [
        {
          id: `${state.config.gameId}-${state.actionSequence}-kn-progress-draw-${event.cardInstanceId}-${index}`,
          source: { kind: 'DECK', family: event.family } as const,
          targetPlayerId: event.playerId,
          cardDefinitionId: drawnCard.definitionId,
          delayMs: 0,
        },
      ];
    }
    if (event.type !== 'KN_PROGRESS_CARD_RESOLVED' || event.targetIds?.length !== 2) return [];
    const sourceDefinition = getKNProgressCardDefinition(event.cardDefinitionId);
    if (sourceDefinition?.effect !== 'SPY') return [];
    const [sourcePlayerId, stolenCardId] = event.targetIds;
    if (sourcePlayerId === undefined || stolenCardId === undefined) return [];
    if (event.playerId !== visiblePlayerId && sourcePlayerId !== visiblePlayerId) return [];
    const stolenCard = state.kn?.progressCards[stolenCardId];
    if (stolenCard === undefined) return [];
    return [
      {
        id: `${state.config.gameId}-${state.actionSequence}-spy-${stolenCardId}-${index}`,
        source: { kind: 'PLAYER', playerId: sourcePlayerId as PlayerState['id'] } as const,
        targetPlayerId: event.playerId,
        cardDefinitionId: stolenCard.definitionId,
        delayMs: 0,
      },
    ];
  });
}

function latestNumberTokenSwapEventKey(
  events: readonly GameEvent[],
  gameId: string,
): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === 'INVENTORS_MADNESS_SWAPPED') {
      return JSON.stringify([
        'MADNESS',
        gameId,
        event.turnNumber,
        event.hexIds[0],
        event.hexIds[1],
      ]);
    }
    if (event?.type !== 'KN_PROGRESS_CARD_RESOLVED' || event.targetIds?.length !== 2) {
      continue;
    }
    const definition = getKNProgressCardDefinition(event.cardDefinitionId);
    const firstHexId = event.targetIds[0];
    const secondHexId = event.targetIds[1];
    if (
      definition?.effect === 'INVENTOR' &&
      firstHexId !== undefined &&
      secondHexId !== undefined
    ) {
      return JSON.stringify(['INVENTOR', gameId, event.cardInstanceId, firstHexId, secondHexId]);
    }
  }
  return null;
}

type ConstructionBoardTarget = Extract<BoardTarget, { readonly kind: 'EDGE' | 'VERTEX' }>;

interface BoardBuildMenuState {
  readonly types: readonly BoardPurchaseType[];
  readonly target: ConstructionBoardTarget;
  readonly position: BoardViewportPoint;
}

interface KnightBoardMenuState {
  readonly knightId: KnightId;
  readonly position: BoardViewportPoint;
}

interface DiscardSelectionState {
  readonly playerId: PlayerState['id'];
  readonly turnNumber: number;
  readonly resources: ResourceBundle;
}

interface KNHandSelectionState {
  readonly key: string;
  readonly selections: readonly string[];
}

interface InventorDraftState {
  readonly interactionFirstHexId: HexId;
  readonly firstHexId: HexId | null;
  readonly secondHexId: HexId | null;
}

interface PotentialConstructionTargets {
  readonly roadIds: readonly EdgeId[];
  readonly houseIds: readonly VertexId[];
  readonly cityIds: readonly VertexId[];
  readonly knightIds: readonly VertexId[];
  readonly wallIds: readonly VertexId[];
}

type KNBoardAction =
  | {
      readonly type: 'BUILD_KNIGHT';
      readonly eligibleVertexIds: readonly VertexId[];
    }
  | {
      readonly type: 'BUILD_WALL';
      readonly eligibleVertexIds: readonly VertexId[];
    }
  | {
      readonly type: 'MOVE_KNIGHT';
      readonly knightId: KnightId;
      readonly targetKnightByVertexId: Readonly<Record<string, KnightId>>;
      readonly chaseVertexId: VertexId | null;
      readonly eligibleVertexIds: readonly VertexId[];
    };

interface KnightMovementOptions {
  readonly eligibleVertexIds: readonly VertexId[];
  readonly targetKnightByVertexId: Readonly<Record<string, KnightId>>;
  readonly chaseVertexId: VertexId | null;
}

function knightActivationReason(player: PlayerState, knight: KnightState): string | null {
  if (knight.active) return 'That Knight is already active.';
  if ((player.resources[RESOURCE_IDS.grain] ?? 0) < 1) {
    return 'Activating a Knight costs one Grain.';
  }
  return null;
}

function knightUpgradeReason(
  state: GameState,
  player: PlayerState,
  knight: KnightState,
): string | null {
  if (knight.level >= 3) return 'That Knight is already Mighty.';
  if (knight.upgradedTurn === state.turn.turnNumber) {
    return 'A Knight cannot be upgraded twice in one turn.';
  }
  const nextLevel = knight.level + 1;
  if (nextLevel === 3 && player.cityImprovements.POLITICS < 3) {
    return 'Politics level 3 (Fortress) unlocks Mighty Knights.';
  }
  if (player.knights.filter((candidate) => candidate.level === nextLevel).length >= 2) {
    return `Both level ${nextLevel} Knight pieces are in use.`;
  }
  if (
    (player.resources[RESOURCE_IDS.livestock] ?? 0) < 1 ||
    (player.resources[RESOURCE_IDS.ore] ?? 0) < 1
  ) {
    return 'A Knight upgrade costs one Sheep and one Ore.';
  }
  return null;
}

function knightMovementOptions(
  state: GameState,
  player: PlayerState,
  knight: KnightState,
): KnightMovementOptions {
  if (getKnightActionReason(state, knight) !== null) {
    return { eligibleVertexIds: [], targetKnightByVertexId: {}, chaseVertexId: null };
  }
  const moveVertexIds = getLegalKnightMoveVertexIds(state, player.id, knight.id);
  const displacementIds = getLegalKnightDisplacementTargetIds(state, player.id, knight.id);
  const displacedKnights = Object.values(state.players)
    .flatMap((candidate) => candidate.knights)
    .filter((candidate) => displacementIds.includes(candidate.id));
  const targetKnightByVertexId = Object.fromEntries(
    displacedKnights.map((candidate) => [candidate.vertexId, candidate.id]),
  );
  const chaseVertexId = getLegalRobberChasingKnightIds(state, player.id).includes(knight.id)
    ? knight.vertexId
    : null;
  return {
    eligibleVertexIds: [
      ...new Set([
        ...moveVertexIds,
        ...displacedKnights.map((candidate) => candidate.vertexId),
        ...(chaseVertexId === null ? [] : [chaseVertexId]),
      ]),
    ],
    targetKnightByVertexId,
    chaseVertexId,
  };
}

function knightMovementReason(
  state: GameState,
  player: PlayerState,
  knight: KnightState,
): string | null {
  const actionReason = getKnightActionReason(state, knight);
  if (actionReason !== null) return actionReason;
  if (knightMovementOptions(state, player, knight).eligibleVertexIds.length === 0) {
    return 'This Knight has no open Road destination and is not touching the robber.';
  }
  return null;
}

function recentEventMessage(events: readonly GameEvent[], state: GameState): string | null {
  const gameWon = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'GAME_WON' }> =>
      event.type === 'GAME_WON',
  );
  if (gameWon !== undefined) {
    return `${state.players[gameWon.playerId]?.name ?? 'A player'} won with ${gameWon.score} victory points.`;
  }

  const production = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'RESOURCES_PRODUCED' }> =>
      event.type === 'RESOURCES_PRODUCED',
  );
  if (production !== undefined) {
    const gains = Object.entries(production.grants)
      .map(([playerId, resources]) => {
        const amount = resourceCount(resources);
        const name = state.players[playerId]?.name ?? 'Unknown player';
        return `${name} +${amount} card${amount === 1 ? '' : 's'}`;
      })
      .join(' · ');
    const shortages = production.unavailableResourceIds
      .map(
        (resourceId) =>
          RESOURCES.find((resource) => resource.id === resourceId)?.displayName ?? resourceId,
      )
      .join(', ');
    const prefix =
      production.source === 'SETUP' ? 'Starting resources' : `Roll ${production.rollTotal ?? '—'}`;
    const resolved = gains.length > 0 ? gains : 'no resources produced';
    return shortages.length > 0
      ? `${prefix}: ${resolved}. Bank shortage canceled ${shortages}.`
      : `${prefix}: ${resolved}.`;
  }

  const robberStarted = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'ROBBER_SEQUENCE_STARTED' }> =>
      event.type === 'ROBBER_SEQUENCE_STARTED',
  );
  if (robberStarted !== undefined) {
    return robberStarted.robberUnlocked === false
      ? 'A 7 was rolled. The robber stays locked until the first barbarian attack.'
      : 'A 7 was rolled. The robber sequence must be resolved.';
  }

  const stolen = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'RESOURCE_STOLEN' }> =>
      event.type === 'RESOURCE_STOLEN',
  );
  if (stolen !== undefined) {
    const playerName = state.players[stolen.playerId]?.name ?? 'A player';
    const targetName = state.players[stolen.targetPlayerId]?.name ?? 'another player';
    return `${playerName} stole one random resource card from ${targetName}.`;
  }

  const discarded = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'RESOURCES_DISCARDED' }> =>
      event.type === 'RESOURCES_DISCARDED',
  );
  if (discarded !== undefined) {
    const amount = discarded.hiddenCount ?? resourceCount(discarded.resources);
    return `${state.players[discarded.playerId]?.name ?? 'A player'} discarded ${amount} resource cards.`;
  }

  const robberMoved = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'ROBBER_MOVED' }> =>
      event.type === 'ROBBER_MOVED',
  );
  if (robberMoved !== undefined) {
    const playerName = state.players[robberMoved.playerId]?.name ?? 'A player';
    return state.turn.phase === 'CHOOSE_STEAL_TARGET'
      ? `${playerName} moved the robber. Choose an eligible player to rob.`
      : `${playerName} moved the robber. No eligible player could be robbed.`;
  }

  const tradeCompleted = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'TRADE_COMPLETED' }> =>
      event.type === 'TRADE_COMPLETED',
  );
  if (tradeCompleted !== undefined) {
    const playerName = state.players[tradeCompleted.playerId]?.name ?? 'A player';
    if (tradeCompleted.recipientId === null) {
      return `${playerName} traded ${resourceBundleLabel(tradeCompleted.offered)} with the bank for ${resourceBundleLabel(tradeCompleted.requested)}.`;
    }
    const recipientName = state.players[tradeCompleted.recipientId]?.name ?? 'another player';
    return `${playerName} and ${recipientName} completed a player trade.`;
  }

  const harborExchange = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'COMMERCIAL_HARBOR_EXCHANGED' }> =>
      event.type === 'COMMERCIAL_HARBOR_EXCHANGED',
  );
  if (harborExchange !== undefined) {
    const playerName = state.players[harborExchange.playerId]?.name ?? 'A player';
    const targetName = state.players[harborExchange.targetPlayerId]?.name ?? 'another player';
    return `${playerName} completed a Commercial Harbor exchange with ${targetName}.`;
  }

  const tradeRejected = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'TRADE_REJECTED' }> =>
      event.type === 'TRADE_REJECTED',
  );
  if (tradeRejected !== undefined) {
    const recipientName = state.players[tradeRejected.recipientId]?.name ?? 'The opponent';
    return `${recipientName} rejected the trade offer.`;
  }

  const tradeAccepted = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'TRADE_ACCEPTED' }> =>
      event.type === 'TRADE_ACCEPTED',
  );
  if (tradeAccepted !== undefined) {
    const recipientName = state.players[tradeAccepted.recipientId]?.name ?? 'An opponent';
    return `${recipientName} accepted the trade offer. The proposer can confirm it.`;
  }

  if (events.some((event) => event.type === 'TRADE_EXPIRED')) {
    return 'The trade offer expired.';
  }

  const tradeOffered = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'TRADE_OFFERED' }> =>
      event.type === 'TRADE_OFFERED',
  );
  if (tradeOffered !== undefined) {
    const playerName = state.players[tradeOffered.playerId]?.name ?? 'A player';
    return `${playerName} offered a trade to ${tradeOffered.recipientIds.length} opponent${tradeOffered.recipientIds.length === 1 ? '' : 's'}.`;
  }

  const tradeUpdated = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'TRADE_UPDATED' }> =>
      event.type === 'TRADE_UPDATED',
  );
  if (tradeUpdated !== undefined) {
    const playerName = state.players[tradeUpdated.playerId]?.name ?? 'A player';
    return `${playerName} updated the trade offer. Every opponent must respond again.`;
  }

  const cardResolved = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'PROGRESS_CARD_RESOLVED' }> =>
      event.type === 'PROGRESS_CARD_RESOLVED',
  );
  if (cardResolved !== undefined) {
    const definition = PROGRESS_CARDS.find(
      (candidate) => candidate.id === cardResolved.cardDefinitionId,
    );
    return `${state.players[cardResolved.playerId]?.name ?? 'A player'} resolved ${definition?.displayName ?? 'a progress card'}.`;
  }

  const cardPlayed = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'PROGRESS_CARD_PLAYED' }> =>
      event.type === 'PROGRESS_CARD_PLAYED',
  );
  if (cardPlayed !== undefined) {
    const definition = getProgressCardDefinition(state.progressCards[cardPlayed.cardInstanceId]);
    return `${state.players[cardPlayed.playerId]?.name ?? 'A player'} played ${definition?.displayName ?? 'a progress card'}.`;
  }

  const cardBought = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'PROGRESS_CARD_BOUGHT' }> =>
      event.type === 'PROGRESS_CARD_BOUGHT',
  );
  if (cardBought !== undefined) {
    return `${state.players[cardBought.playerId]?.name ?? 'A player'} bought a progress card.`;
  }

  const longestRoad = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'LONGEST_ROAD_CHANGED' }> =>
      event.type === 'LONGEST_ROAD_CHANGED',
  );
  if (longestRoad !== undefined) {
    return longestRoad.playerId === null
      ? 'Longest Road is currently unclaimed.'
      : `${state.players[longestRoad.playerId]?.name ?? 'A player'} now holds Longest Road.`;
  }

  const largestForce = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'LARGEST_FORCE_CHANGED' }> =>
      event.type === 'LARGEST_FORCE_CHANGED',
  );
  if (largestForce !== undefined) {
    return largestForce.playerId === null
      ? 'Largest Force is currently unclaimed.'
      : `${state.players[largestForce.playerId]?.name ?? 'A player'} now holds Largest Force.`;
  }

  const upgraded = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'BUILDING_UPGRADED' }> =>
      event.type === 'BUILDING_UPGRADED',
  );
  if (upgraded !== undefined) {
    return `${state.players[upgraded.playerId]?.name ?? 'A player'} upgraded a house to a city.`;
  }

  const building = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'BUILDING_PLACED' }> =>
      event.type === 'BUILDING_PLACED',
  );
  if (building !== undefined) {
    return `${state.players[building.playerId]?.name ?? 'A player'} built a ${building.buildingType.toLowerCase()}.`;
  }

  const road = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'ROAD_BUILT' }> =>
      event.type === 'ROAD_BUILT',
  );
  if (road !== undefined) {
    return `${state.players[road.playerId]?.name ?? 'A player'} built a road.`;
  }

  const turnStarted = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'TURN_STARTED' }> =>
      event.type === 'TURN_STARTED',
  );
  if (turnStarted === undefined) return null;
  const cancelledTrade = events.some((event) => event.type === 'TRADE_CANCELLED');
  const nextPlayerName = state.players[turnStarted.playerId]?.name ?? 'Next player';
  return cancelledTrade
    ? `The open trade offer was cancelled. ${nextPlayerName} starts the turn.`
    : `${nextPlayerName} starts the turn.`;
}

export function GameScreen() {
  const navigate = useNavigate();
  const gameState = useAppStore((state) => state.gameState);
  const recentGameEvents = useAppStore((state) => state.recentGameEvents);
  const gameEventHistory = useAppStore((state) => state.gameEventHistory);
  const gamePaused = useAppStore((state) => state.gamePaused);
  const clearGame = useAppStore((state) => state.clearGame);
  const returnGameToLobby = useAppStore((state) => state.returnGameToLobby);
  const rematch = useAppStore((state) => state.rematch);
  const dispatchLocalGameAction = useAppStore((state) => state.dispatchGameAction);
  const pauseGame = useAppStore((state) => state.pauseGame);
  const unpauseGame = useAppStore((state) => state.unpauseGame);
  const adminMode = useAppStore((state) => state.adminMode);
  const toggleAdminMode = useAppStore((state) => state.toggleAdminMode);
  const grantAllProgressCards = useAppStore((state) => state.grantAllProgressCards);
  const openSettings = useAppStore((state) => state.openSettings);
  const settings = useAppStore((state) => state.settings);
  const onlineCredentials = useOnlineStore((state) => state.credentials);
  const onlineRoom = useOnlineStore((state) => state.room);
  const onlineClockOffsetMs = useOnlineStore((state) => state.clockOffsetMs);
  const onlineError = useOnlineStore((state) => state.error);
  const onlineActionPending = useOnlineStore((state) => state.actionPending);
  const onlineCommandPending = useOnlineStore((state) => state.commandPending);
  const initializeOnline = useOnlineStore((state) => state.initialize);
  const submitOnlineAction = useOnlineStore((state) => state.submitAction);
  const rematchOnline = useOnlineStore((state) => state.rematch);
  const returnOnlineLobby = useOnlineStore((state) => state.returnToLobby);
  const pauseOnlineMatch = useOnlineStore((state) => state.pauseMatch);
  const unpauseOnlineMatch = useOnlineStore((state) => state.unpauseMatch);
  const setOnlineDebugMode = useOnlineStore((state) => state.setDebugMode);
  const grantOnlineProgressCards = useOnlineStore((state) => state.grantAllProgressCards);
  const leaveOnlineRoom = useOnlineStore((state) => state.leaveRoom);
  const isOnlineMatch = onlineRoom?.game !== null && onlineRoom?.game !== undefined;
  const onlineViewerPlayerId = isOnlineMatch ? onlineRoom.viewerPlayerId : null;
  const onlineViewerIsHost = isOnlineMatch && onlineRoom.viewerPlayerId === onlineRoom.hostPlayerId;
  const dispatchGameAction = isOnlineMatch ? submitOnlineAction : dispatchLocalGameAction;
  const audioSessionId = gameState?.config.gameId ?? null;
  const [boardReady, setBoardReady] = useState(false);
  const boardAudioReady = import.meta.env.MODE === 'test' || boardReady;
  const audioEventKey =
    gameState === null || recentGameEvents.length === 0
      ? null
      : `${gameState.config.gameId}:${isOnlineMatch ? (onlineRoom.game?.revision ?? 0) : gameState.actionSequence}:${recentGameEvents
          .map((event) => event.type)
          .join(',')}`;
  const lastPlayedAudioEventKey = useRef<string | null>(null);
  const playedNumberTokenSwapKeys = useRef(new Set<string>());
  const [showDebug, setShowDebug] = useState(false);
  const [inspectedTarget, setInspectedTarget] = useState<BoardTarget | null>(null);
  const [roadChainPeekPosition, setRoadChainPeekPosition] = useState<BoardViewportPoint | null>(
    null,
  );
  const [localActionError, setActionError] = useState<string | null>(null);
  const actionError = onlineError?.message ?? localActionError;
  const [constructionType, setConstructionType] = useState<ConstructionType | null>(null);
  const [boardBuildMenu, setBoardBuildMenu] = useState<BoardBuildMenuState | null>(null);
  const [knightBoardMenu, setKnightBoardMenu] = useState<KnightBoardMenuState | null>(null);
  const [tradeModalTurnKey, setTradeModalTurnKey] = useState<string | null>(null);
  const [tradeOffered, setTradeOffered] = useState<ResourceBundle>(resourceBundle([]));
  const [tradeRequested, setTradeRequested] = useState<ResourceBundle>(resourceBundle([]));
  const [editingTradeId, setEditingTradeId] = useState<TradeId | null>(null);
  const [progressCardIntentId, setProgressCardIntentId] = useState<CardInstanceId | null>(null);
  const [knProgressCardIntentId, setKNProgressCardIntentId] = useState<CardInstanceId | null>(null);
  const [knBoardAction, setKNBoardAction] = useState<KNBoardAction | null>(null);
  const [knightCommand, setKnightCommand] = useState<KnightCommand | null>(null);
  const [discardSelection, setDiscardSelection] = useState<DiscardSelectionState | null>(null);
  const [knHandSelection, setKNHandSelection] = useState<KNHandSelectionState | null>(null);
  const [inventorDraft, setInventorDraft] = useState<InventorDraftState | null>(null);
  const [warDrumsPosition, setWarDrumsPosition] = useState<number | null>(null);
  const [numberTokenSwapAnimation, setNumberTokenSwapAnimation] = useState<{
    readonly key: string;
    readonly hexIds: readonly [HexId, HexId];
  } | null>(null);
  const [handSelectionWarning, setHandSelectionWarning] = useState<{
    readonly resourceId: ResourceId;
    readonly signal: number;
  } | null>(null);
  const [leaveDestination, setLeaveDestination] = useState<'/' | '/lobby' | null>(null);
  const [rematchError, setRematchError] = useState<string | null>(null);
  const [dismissedLongestRoadNoticeKey, setDismissedLongestRoadNoticeKey] = useState<string | null>(
    null,
  );
  const currentTradeTurnKey =
    gameState === null
      ? null
      : `${gameState.config.gameId}:${gameState.turn.turnNumber}:${gameState.turn.activePlayerId ?? 'none'}`;
  const tradeModalOpen = currentTradeTurnKey !== null && tradeModalTurnKey === currentTradeTurnKey;

  useEffect(() => {
    if (gameState === null && onlineCredentials !== null && onlineRoom === null) {
      void initializeOnline();
    }
  }, [gameState, initializeOnline, onlineCredentials, onlineRoom]);

  useEffect(() => {
    if (onlineCredentials !== null && onlineRoom?.phase === 'LOBBY' && onlineRoom.game === null) {
      void navigate(`/online/${onlineRoom.code}`, { replace: true });
    }
  }, [navigate, onlineCredentials, onlineRoom]);

  const longestRoadAward = recentGameEvents.find(
    (event): event is Extract<GameEvent, { readonly type: 'LONGEST_ROAD_CHANGED' }> =>
      event.type === 'LONGEST_ROAD_CHANGED' && event.playerId !== null,
  );
  const longestRoadPlayer =
    longestRoadAward?.playerId === null || longestRoadAward === undefined
      ? undefined
      : gameState?.players[longestRoadAward.playerId];
  const longestRoadNoticeKey =
    longestRoadPlayer === undefined || gameState === null
      ? null
      : `${gameState.config.gameId}:${gameState.actionSequence}:${longestRoadPlayer.id}`;
  const longestRoadNotice =
    longestRoadPlayer === undefined ||
    longestRoadNoticeKey === null ||
    dismissedLongestRoadNoticeKey === longestRoadNoticeKey
      ? null
      : {
          playerName: longestRoadPlayer.name,
          color:
            PLAYER_COLORS.find((candidate) => candidate.id === longestRoadPlayer.colorId)?.hex ??
            '#d9bc72',
        };

  useEffect(() => {
    if (audioSessionId === null || !boardAudioReady) return undefined;
    audioManager.startMusic(audioSessionId);
    return () => audioManager.stopMusic();
  }, [audioSessionId, boardAudioReady]);

  useEffect(() => {
    audioManager.setMusicVolume(settings.masterVolume, settings.musicVolume);
  }, [settings.masterVolume, settings.musicVolume]);

  useEffect(() => {
    if (audioSessionId === null || !boardAudioReady || (gameState?.actionSequence ?? 0) !== 0)
      return;
    audioManager.playGameBegin(audioSessionId, settings.masterVolume, settings.sfxVolume);
  }, [
    audioSessionId,
    boardAudioReady,
    gameState?.actionSequence,
    settings.masterVolume,
    settings.sfxVolume,
  ]);

  useEffect(() => {
    if (audioEventKey === null || audioEventKey === lastPlayedAudioEventKey.current) return;
    lastPlayedAudioEventKey.current = audioEventKey;
    audioManager.playEvents(
      recentGameEvents,
      settings.masterVolume,
      settings.sfxVolume,
      isOnlineMatch ? onlineViewerPlayerId : null,
    );
  }, [
    audioEventKey,
    isOnlineMatch,
    onlineViewerPlayerId,
    recentGameEvents,
    settings.masterVolume,
    settings.sfxVolume,
  ]);

  useEffect(() => {
    if (longestRoadNoticeKey === null) return undefined;
    const dismiss = globalThis.setTimeout(
      () => setDismissedLongestRoadNoticeKey(longestRoadNoticeKey),
      3400,
    );
    return () => globalThis.clearTimeout(dismiss);
  }, [longestRoadNoticeKey]);

  useEffect(() => {
    if (
      constructionType === null &&
      boardBuildMenu === null &&
      knightBoardMenu === null &&
      knBoardAction === null &&
      knightCommand === null
    )
      return undefined;
    const cancelWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConstructionType(null);
        setBoardBuildMenu(null);
        setKnightBoardMenu(null);
        setKNBoardAction(null);
        setKnightCommand(null);
        setActionError(null);
      }
    };
    globalThis.addEventListener('keydown', cancelWithEscape);
    return () => globalThis.removeEventListener('keydown', cancelWithEscape);
  }, [boardBuildMenu, constructionType, knBoardAction, knightBoardMenu, knightCommand]);

  const orderedPlayerConfigs = useMemo(
    () =>
      gameState === null
        ? []
        : [...gameState.config.players].sort((first, second) => first.order - second.order),
    [gameState],
  );
  const partyLeader = orderedPlayerConfigs[0];
  const partyLeaderName =
    (isOnlineMatch
      ? onlineRoom.players.find((player) => player.id === onlineRoom.hostPlayerId)?.name
      : partyLeader?.name) ?? 'Party leader';
  const potentialConstructionTargets = useMemo<PotentialConstructionTargets>(() => {
    const actorId = gameState?.turn.activePlayerId;
    if (
      gameState === null ||
      actorId === null ||
      actorId === undefined ||
      (isOnlineMatch && actorId !== onlineViewerPlayerId) ||
      gameState.turn.phase !== 'ACTION_PHASE'
    ) {
      return { roadIds: [], houseIds: [], cityIds: [], knightIds: [], wallIds: [] };
    }
    return {
      roadIds: getPotentialRoadEdgeIds(gameState, actorId),
      houseIds: getPotentialHouseVertexIds(gameState, actorId),
      cityIds: getPotentialMansionVertexIds(gameState, actorId),
      knightIds: gameState.kn === null ? [] : getLegalKnightPlacementVertexIds(gameState, actorId),
      wallIds: gameState.kn === null ? [] : getLegalWallVertexIds(gameState, actorId),
    };
  }, [gameState, isOnlineMatch, onlineViewerPlayerId]);
  const eligibleKnightIds = useMemo<Readonly<Record<KnightCommand, readonly KnightId[]>>>(() => {
    const actorId = gameState?.turn.activePlayerId;
    const player =
      actorId === null || actorId === undefined ? undefined : gameState?.players[actorId];
    if (
      gameState === null ||
      player === undefined ||
      (isOnlineMatch && actorId !== onlineViewerPlayerId) ||
      gameState.kn === null ||
      gameState.turn.phase !== 'ACTION_PHASE' ||
      gameState.pendingInteraction !== null
    ) {
      return { ACTIVATE: [], UPGRADE: [], MOVE: [] };
    }
    return {
      ACTIVATE: player.knights
        .filter((knight) => knightActivationReason(player, knight) === null)
        .map((knight) => knight.id),
      UPGRADE: player.knights
        .filter((knight) => knightUpgradeReason(gameState, player, knight) === null)
        .map((knight) => knight.id),
      MOVE: player.knights
        .filter((knight) => knightMovementReason(gameState, player, knight) === null)
        .map((knight) => knight.id),
    };
  }, [gameState, isOnlineMatch, onlineViewerPlayerId]);
  const emphasizedVertexIds = useMemo<readonly VertexId[]>(
    () =>
      knBoardAction?.type === 'MOVE_KNIGHT' && knBoardAction.chaseVertexId !== null
        ? [knBoardAction.chaseVertexId]
        : [],
    [knBoardAction],
  );
  const selectableTargets = useMemo<readonly BoardTarget[]>(() => {
    if (gameState === null) return [];
    if (
      isOnlineMatch &&
      gameState.turn.activePlayerId !== onlineViewerPlayerId &&
      !(
        gameState.pendingInteraction?.type === 'KN_SELECTION' &&
        gameState.pendingInteraction.playerId === onlineViewerPlayerId
      )
    ) {
      return [];
    }
    if (knBoardAction !== null) {
      return knBoardAction.eligibleVertexIds.map((id) => ({ kind: 'VERTEX' as const, id }));
    }
    if (knightCommand !== null) {
      const actorId = gameState.turn.activePlayerId;
      const player = actorId === null ? undefined : gameState.players[actorId];
      if (player === undefined) return [];
      const eligibleIds = new Set(eligibleKnightIds[knightCommand]);
      return player.knights
        .filter((knight) => eligibleIds.has(knight.id))
        .map((knight) => ({ kind: 'VERTEX' as const, id: knight.vertexId }));
    }
    const knChoice =
      gameState.pendingInteraction?.type === 'KN_SELECTION' ? gameState.pendingInteraction : null;
    if (knChoice !== null) {
      if (isOnlineMatch && knChoice.playerId !== onlineViewerPlayerId) return [];
      if (knChoice.purpose === 'SMITH_KNIGHT' || knChoice.purpose === 'DESERTER_KNIGHT') {
        const eligibleKnightIds = new Set(knChoice.eligibleIds);
        return Object.values(gameState.players)
          .flatMap((player) => player.knights)
          .filter((knight) => eligibleKnightIds.has(knight.id))
          .map((knight) => ({ kind: 'VERTEX' as const, id: knight.vertexId }));
      }
      const hexPurposes = new Set([
        'INVENTOR_FIRST_TOKEN',
        'INVENTOR_SECOND_TOKEN',
        'RECLAMATION_HEX',
        'RECLAMATION_RESOURCE',
        'MERCHANT_HEX',
        'BISHOP_HEX',
      ]);
      const edgePurposes = new Set(['ROAD_BUILDING', 'DIPLOMAT_ROAD', 'DIPLOMAT_RELOCATE_ROAD']);
      const vertexPurposes = new Set([
        'ENGINEER_WALL',
        'MEDICINE_CITY',
        'DESERTER_PLACE_KNIGHT',
        'RELOCATE_DISPLACED_KNIGHT',
        'BARBARIAN_CITY_LOSS',
        'METROPOLIS_CITY',
      ]);
      if (hexPurposes.has(knChoice.purpose)) {
        const ids =
          knChoice.purpose === 'RECLAMATION_RESOURCE'
            ? ((knChoice.context.eligibleHexIds as readonly string[] | undefined) ?? [])
            : knChoice.eligibleIds;
        return ids.map((id) => ({ kind: 'HEX' as const, id: id as HexId }));
      }
      if (edgePurposes.has(knChoice.purpose)) {
        return knChoice.eligibleIds.map((id) => ({ kind: 'EDGE' as const, id: id as EdgeId }));
      }
      if (vertexPurposes.has(knChoice.purpose)) {
        return knChoice.eligibleIds.map((id) => ({ kind: 'VERTEX' as const, id: id as VertexId }));
      }
    }
    if (gameState.turn.phase === 'SETUP_PLACE_HOUSE') {
      if (isOnlineMatch && gameState.turn.activePlayerId !== onlineViewerPlayerId) return [];
      return getLegalSetupHouseVertexIds(gameState).map((id) => ({ kind: 'VERTEX', id }));
    }
    if (gameState.turn.phase === 'SETUP_PLACE_ROAD') {
      if (isOnlineMatch && gameState.turn.activePlayerId !== onlineViewerPlayerId) return [];
      return getLegalSetupRoadEdgeIds(gameState).map((id) => ({ kind: 'EDGE', id }));
    }
    const actorId = gameState.turn.activePlayerId;
    if (
      gameState.turn.phase === 'CARD_RESOLUTION' &&
      gameState.pendingInteraction?.type === 'PLACE_FREE_ROADS' &&
      actorId !== null &&
      (!isOnlineMatch || actorId === onlineViewerPlayerId)
    ) {
      return getLegalFreeRoadEdgeIds(gameState, actorId).map((id) => ({ kind: 'EDGE', id }));
    }
    if (
      gameState.turn.phase === 'MOVE_ROBBER' &&
      actorId !== null &&
      (!isOnlineMatch || actorId === onlineViewerPlayerId)
    ) {
      return getValidRobberHexIds(gameState, actorId).map((id) => ({ kind: 'HEX', id }));
    }
    if (
      gameState.turn.phase !== 'ACTION_PHASE' ||
      actorId === null ||
      (isOnlineMatch && actorId !== onlineViewerPlayerId)
    )
      return [];
    if (constructionType === 'ROAD') {
      return getValidRoadEdgeIds(gameState, actorId).map((id) => ({ kind: 'EDGE', id }));
    }
    if (constructionType === 'HOUSE') {
      return getValidHouseVertexIds(gameState, actorId).map((id) => ({ kind: 'VERTEX', id }));
    }
    if (constructionType === 'MANSION') {
      return getValidMansionVertexIds(gameState, actorId).map((id) => ({ kind: 'VERTEX', id }));
    }
    const ownedKnightVertexIds =
      gameState.players[actorId]?.knights.map((knight) => knight.vertexId) ?? [];
    return [
      ...potentialConstructionTargets.roadIds.map((id) => ({ kind: 'EDGE' as const, id })),
      ...potentialConstructionTargets.cityIds.map((id) => ({ kind: 'VERTEX' as const, id })),
      ...potentialConstructionTargets.houseIds.map((id) => ({ kind: 'VERTEX' as const, id })),
      ...potentialConstructionTargets.knightIds.map((id) => ({ kind: 'VERTEX' as const, id })),
      ...potentialConstructionTargets.wallIds.map((id) => ({ kind: 'VERTEX' as const, id })),
      ...ownedKnightVertexIds.map((id) => ({ kind: 'VERTEX' as const, id })),
    ];
  }, [
    constructionType,
    eligibleKnightIds,
    gameState,
    isOnlineMatch,
    knBoardAction,
    knightCommand,
    onlineViewerPlayerId,
    potentialConstructionTargets,
  ]);
  const constructionAvailability = useMemo(() => {
    const actorId = gameState?.turn.activePlayerId;
    if (
      gameState === null ||
      actorId === null ||
      actorId === undefined ||
      (isOnlineMatch && actorId !== onlineViewerPlayerId) ||
      gameState.turn.phase !== 'ACTION_PHASE'
    )
      return [];
    return (['ROAD', 'HOUSE', 'MANSION'] as const).map((type) =>
      getConstructionAvailability(gameState, actorId, type),
    );
  }, [gameState, isOnlineMatch, onlineViewerPlayerId]);
  const playerColors = useMemo<Readonly<Record<string, string>>>(() => {
    if (gameState === null) return {};
    return Object.fromEntries(
      gameState.config.players.map((player) => [
        player.id,
        PLAYER_COLORS.find((color) => color.id === player.colorId)?.hex ?? '#f6f0dc',
      ]),
    );
  }, [gameState]);
  const inspectedRoadChain = useMemo(() => {
    if (gameState === null || inspectedTarget?.kind !== 'EDGE') return null;
    const edge = gameState.board.edges[inspectedTarget.id];
    if (edge?.roadOwnerId === null || edge?.roadOwnerId === undefined) return null;
    const edgeIds = calculateRoadChainThroughEdge(gameState, edge.id);
    if (edgeIds.length === 0) return null;
    return {
      edgeIds,
      ownerId: edge.roadOwnerId,
      ownerName: gameState.players[edge.roadOwnerId]?.name ?? 'Player',
      color: playerColors[edge.roadOwnerId] ?? '#f0cf6a',
    };
  }, [gameState, inspectedTarget, playerColors]);
  const highlightedHexIds = useMemo(() => {
    if (gameState?.turn.dice === null || gameState?.turn.dice === undefined) return [];
    const total = gameState.turn.dice[0] + gameState.turn.dice[1];
    return Object.values(gameState.board.hexes)
      .filter((hex) => hex.numberToken === total)
      .map((hex) => hex.id);
  }, [gameState]);
  const animatedTarget = useMemo<BoardTarget | null>(() => {
    const robber = recentGameEvents.find(
      (event): event is Extract<GameEvent, { readonly type: 'ROBBER_MOVED' }> =>
        event.type === 'ROBBER_MOVED',
    );
    if (robber !== undefined) return { kind: 'HEX', id: robber.hexId };
    const road = recentGameEvents.find(
      (event): event is Extract<GameEvent, { readonly type: 'ROAD_BUILT' }> =>
        event.type === 'ROAD_BUILT',
    );
    if (road !== undefined) return { kind: 'EDGE', id: road.edgeId };
    const building = recentGameEvents.find(
      (
        event,
      ): event is Extract<GameEvent, { readonly type: 'BUILDING_PLACED' | 'BUILDING_UPGRADED' }> =>
        event.type === 'BUILDING_PLACED' || event.type === 'BUILDING_UPGRADED',
    );
    if (building !== undefined) return { kind: 'VERTEX', id: building.vertexId };
    const knight = recentGameEvents.find(
      (
        event,
      ): event is Extract<
        GameEvent,
        { readonly type: 'KNIGHT_BUILT' | 'KNIGHT_MOVED' | 'KNIGHT_DISPLACED' }
      > =>
        event.type === 'KNIGHT_BUILT' ||
        event.type === 'KNIGHT_MOVED' ||
        event.type === 'KNIGHT_DISPLACED',
    );
    if (knight !== undefined) return { kind: 'VERTEX', id: knight.vertexId };
    const wallOrMetropolis = recentGameEvents.find(
      (
        event,
      ): event is Extract<GameEvent, { readonly type: 'WALL_BUILT' | 'METROPOLIS_CHANGED' }> =>
        event.type === 'WALL_BUILT' || event.type === 'METROPOLIS_CHANGED',
    );
    if (wallOrMetropolis !== undefined) {
      return { kind: 'VERTEX', id: wallOrMetropolis.vertexId };
    }
    const merchant = recentGameEvents.find(
      (event): event is Extract<GameEvent, { readonly type: 'MERCHANT_MOVED' }> =>
        event.type === 'MERCHANT_MOVED',
    );
    return merchant === undefined ? null : { kind: 'HEX', id: merchant.hexId };
  }, [recentGameEvents]);
  const robberMove = useMemo(() => {
    const moved = recentGameEvents.find(
      (event): event is Extract<GameEvent, { readonly type: 'ROBBER_MOVED' }> =>
        event.type === 'ROBBER_MOVED',
    );
    return moved?.fromHexId === null || moved?.fromHexId === undefined
      ? null
      : { fromHexId: moved.fromHexId, toHexId: moved.hexId };
  }, [recentGameEvents]);
  const animateResourceHand = recentGameEvents.some(
    (event) =>
      event.type === 'RESOURCES_PRODUCED' ||
      event.type === 'TRADE_COMPLETED' ||
      event.type === 'COMMERCIAL_HARBOR_EXCHANGED' ||
      event.type === 'RESOURCE_STOLEN' ||
      event.type === 'PROGRESS_CARD_RESOLVED' ||
      event.type === 'KN_PROGRESS_CARD_RESOLVED' ||
      event.type === 'AQUEDUCT_RESOURCE_CHOSEN' ||
      event.type === 'WEDDING_CARDS_TRANSFERRED' ||
      event.type === 'RESOURCES_DISCARDED',
  );
  const resourceFlyovers = useMemo(
    () =>
      productionFlyovers(
        recentGameEvents,
        gameState,
        onlineViewerPlayerId ?? gameState?.turn.activePlayerId ?? null,
        isOnlineMatch,
      ),
    [gameState, isOnlineMatch, onlineViewerPlayerId, recentGameEvents],
  );
  const progressCardFlyovers = useMemo(
    () =>
      progressCardMovementFlyovers(
        recentGameEvents,
        gameState,
        onlineViewerPlayerId ?? gameState?.turn.activePlayerId ?? null,
      ),
    [gameState, onlineViewerPlayerId, recentGameEvents],
  );
  const latestNumberTokenSwapKey = latestNumberTokenSwapEventKey(
    gameEventHistory,
    gameState?.config.gameId ?? 'unavailable-game',
  );

  useEffect(() => {
    if (
      latestNumberTokenSwapKey === null ||
      playedNumberTokenSwapKeys.current.has(latestNumberTokenSwapKey)
    ) {
      return undefined;
    }
    const parsed = JSON.parse(latestNumberTokenSwapKey) as [
      string,
      string,
      string | number,
      HexId,
      HexId,
    ];
    const hexIds = [parsed[3], parsed[4]] as const;
    const showAnimation = globalThis.setTimeout(() => {
      playedNumberTokenSwapKeys.current.add(latestNumberTokenSwapKey);
      while (playedNumberTokenSwapKeys.current.size > 24) {
        const oldestKey = playedNumberTokenSwapKeys.current.values().next().value;
        if (oldestKey === undefined) break;
        playedNumberTokenSwapKeys.current.delete(oldestKey);
      }
      setNumberTokenSwapAnimation({ key: latestNumberTokenSwapKey, hexIds });
    }, 0);
    return () => globalThis.clearTimeout(showAnimation);
  }, [latestNumberTokenSwapKey]);

  const activeNumberTokenSwapKey = numberTokenSwapAnimation?.key ?? null;
  useEffect(() => {
    if (activeNumberTokenSwapKey === null) return undefined;
    const clearAnimation = globalThis.setTimeout(() => {
      setNumberTokenSwapAnimation((current) =>
        current?.key === activeNumberTokenSwapKey ? null : current,
      );
    }, 2_350);
    return () => globalThis.clearTimeout(clearAnimation);
  }, [activeNumberTokenSwapKey]);
  const numberTokenSwap = numberTokenSwapAnimation?.hexIds ?? null;
  const terrainChange = useMemo(() => {
    const reclaimed = recentGameEvents.find(
      (event): event is Extract<GameEvent, { readonly type: 'TERRAIN_RECLAIMED' }> =>
        event.type === 'TERRAIN_RECLAIMED',
    );
    return reclaimed === undefined
      ? null
      : { hexId: reclaimed.hexId, fromResourceId: reclaimed.fromResourceId };
  }, [recentGameEvents]);
  if (gameState === null) {
    if (onlineCredentials !== null) {
      return (
        <main className="online-lobby-screen online-lobby-screen--loading">
          <section>
            <span className="online-loader" aria-hidden="true" />
            <h1>Restoring online match</h1>
            <p>{onlineError?.message ?? 'Reconnecting to your private seat…'}</p>
          </section>
        </main>
      );
    }
    return <Navigate to="/lobby" replace />;
  }

  const activePlayer =
    gameState.turn.activePlayerId === null
      ? undefined
      : gameState.players[gameState.turn.activePlayerId];
  const playerActivities = pendingPlayerActivities(gameState);
  const viewerPlayer =
    onlineViewerPlayerId === null ? activePlayer : gameState.players[onlineViewerPlayerId];
  const developerControlsVisible =
    import.meta.env.DEV || adminMode || hasAdminDisplayName(viewerPlayer?.name ?? '');
  let progressTooltipResetSequence = -1;
  for (let index = gameState.actionHistory.length - 1; index >= 0; index -= 1) {
    if (
      gameState.actionHistory[index]?.eventTypes.some(
        (eventType) =>
          eventType === 'PROGRESS_CARD_RESOLVED' || eventType === 'KN_PROGRESS_CARD_RESOLVED',
      )
    ) {
      progressTooltipResetSequence = gameState.actionHistory[index]?.sequence ?? -1;
      break;
    }
  }
  const progressTooltipResetSignal = `${progressTooltipResetSequence}`;
  const inspection =
    inspectedRoadChain === null
      ? describeTarget(gameState, inspectedTarget)
      : `${inspectedRoadChain.ownerName}’s road chain · ${inspectedRoadChain.edgeIds.length} road${inspectedRoadChain.edgeIds.length === 1 ? '' : 's'}`;
  const turnFeedback = recentEventMessage(recentGameEvents, gameState);
  const setupProgress = getSetupProgress(gameState);
  const discardInteraction =
    gameState.pendingInteraction?.type === 'DISCARD_RESOURCES'
      ? gameState.pendingInteraction
      : null;
  const firstDiscardPlayerId = discardInteraction?.queue[0];
  const discardPlayerId = isOnlineMatch
    ? onlineViewerPlayerId !== null && discardInteraction?.queue.includes(onlineViewerPlayerId)
      ? onlineViewerPlayerId
      : undefined
    : firstDiscardPlayerId;
  const discardPlayer =
    firstDiscardPlayerId === undefined ? undefined : gameState.players[firstDiscardPlayerId];
  const controlledDiscardPlayer =
    discardPlayerId === undefined ? undefined : gameState.players[discardPlayerId];
  const requiredDiscardCount =
    discardPlayerId === undefined ? undefined : discardInteraction?.requiredCounts[discardPlayerId];
  const selectedDiscardResources =
    discardPlayerId !== undefined &&
    discardSelection?.playerId === discardPlayerId &&
    discardSelection.turnNumber === gameState.turn.turnNumber
      ? discardSelection.resources
      : resourceBundle([]);
  const knightBoardMenuKnight =
    knightBoardMenu === null
      ? undefined
      : activePlayer?.knights.find((knight) => knight.id === knightBoardMenu.knightId);
  const knightBoardActivateReason =
    activePlayer === undefined || knightBoardMenuKnight === undefined
      ? 'That Knight is no longer available.'
      : (knightActivationReason(activePlayer, knightBoardMenuKnight) ?? 'Activate this Knight.');
  const knightBoardUpgradeReason =
    activePlayer === undefined || knightBoardMenuKnight === undefined
      ? 'That Knight is no longer available.'
      : (knightUpgradeReason(gameState, activePlayer, knightBoardMenuKnight) ??
        'Upgrade this Knight by one level.');
  const knightBoardMoveReason =
    activePlayer === undefined || knightBoardMenuKnight === undefined
      ? 'That Knight is no longer available.'
      : (knightMovementReason(gameState, activePlayer, knightBoardMenuKnight) ??
        'Choose an open Road destination, a weaker Knight, or its own corner to chase the robber.');
  const stealInteraction =
    gameState.pendingInteraction?.type === 'CHOOSE_STEAL_TARGET'
      ? gameState.pendingInteraction
      : null;
  const stealTargets =
    stealInteraction?.eligibleTargets.flatMap((playerId) => {
      const player = gameState.players[playerId];
      return player === undefined ? [] : [player];
    }) ?? [];
  const tradeInteraction =
    gameState.pendingInteraction?.type === 'TRADE_RESPONSES' ? gameState.pendingInteraction : null;
  const responseTrade =
    tradeInteraction === null ? undefined : gameState.tradeOffers[tradeInteraction.tradeId];
  const responseProposer =
    responseTrade === undefined ? undefined : gameState.players[responseTrade.fromPlayerId];
  const responseRecipients =
    responseTrade?.recipientIds.flatMap((playerId) => {
      const player = gameState.players[playerId];
      return player === undefined ? [] : [player];
    }) ?? [];
  const canEditResponseTrade =
    responseTrade !== undefined &&
    responseTrade.status === 'OPEN' &&
    gameState.turn.phase === 'ACTION_PHASE' &&
    gameState.turn.activePlayerId === responseTrade.fromPlayerId &&
    (!isOnlineMatch || onlineViewerPlayerId === responseTrade.fromPlayerId) &&
    !onlineActionPending;
  const progressChoiceInteraction =
    gameState.pendingInteraction?.type === 'SELECT_RESOURCES' ||
    gameState.pendingInteraction?.type === 'SELECT_RESOURCE_TYPE'
      ? gameState.pendingInteraction
      : null;
  const knChoiceInteraction =
    gameState.pendingInteraction?.type === 'KN_SELECTION' ? gameState.pendingInteraction : null;
  const knBoardChoicePurposes = new Set([
    'INVENTOR_FIRST_TOKEN',
    'INVENTOR_SECOND_TOKEN',
    'RECLAMATION_HEX',
    'RECLAMATION_RESOURCE',
    'MERCHANT_HEX',
    'BISHOP_HEX',
    'ROAD_BUILDING',
    'DIPLOMAT_ROAD',
    'DIPLOMAT_RELOCATE_ROAD',
    'ENGINEER_WALL',
    'MEDICINE_CITY',
    'SMITH_KNIGHT',
    'DESERTER_KNIGHT',
    'DESERTER_PLACE_KNIGHT',
    'RELOCATE_DISPLACED_KNIGHT',
    'BARBARIAN_CITY_LOSS',
    'METROPOLIS_CITY',
  ]);
  const knBoardChoice =
    knChoiceInteraction !== null &&
    (!isOnlineMatch || knChoiceInteraction.playerId === onlineViewerPlayerId) &&
    knBoardChoicePurposes.has(knChoiceInteraction.purpose)
      ? knChoiceInteraction
      : null;
  const inventorSelectionActive =
    knBoardChoice?.purpose === 'INVENTOR_FIRST_TOKEN' ||
    knBoardChoice?.purpose === 'INVENTOR_SECOND_TOKEN' ||
    knBoardChoice?.purpose === 'RECLAMATION_HEX' ||
    knBoardChoice?.purpose === 'RECLAMATION_RESOURCE';
  const inventorInteractionFirstHexId =
    knBoardChoice?.purpose === 'INVENTOR_SECOND_TOKEN'
      ? ((knBoardChoice.context.firstHexId as HexId | undefined) ?? null)
      : null;
  const activeInventorDraft =
    inventorInteractionFirstHexId !== null &&
    inventorDraft?.interactionFirstHexId === inventorInteractionFirstHexId
      ? inventorDraft
      : null;
  const inventorSelectedHexId =
    activeInventorDraft === null ? inventorInteractionFirstHexId : activeInventorDraft.firstHexId;
  const inventorPendingHexId = activeInventorDraft?.secondHexId ?? null;
  const reclamationSelectedHexId =
    knBoardChoice?.purpose === 'RECLAMATION_RESOURCE'
      ? ((knBoardChoice.context.selectedHexId as HexId | undefined) ?? null)
      : null;
  const knTrayChoice =
    knChoiceInteraction !== null &&
    (!isOnlineMatch || knChoiceInteraction.playerId === onlineViewerPlayerId) &&
    [
      'AQUEDUCT_RESOURCE',
      'DEFENDER_TIE_DECK',
      'ALCHEMIST_DICE',
      'RESOURCE_MONOPOLY',
      'COMMODITY_MONOPOLY',
      'MERCHANT_FLEET_GOOD',
      'RECLAMATION_RESOURCE',
      'COMMERCIAL_HARBOR_PLAYER',
      'COMMERCIAL_HARBOR_RESOURCE',
      'COMMERCIAL_HARBOR_COMMODITY',
      'MASTER_MERCHANT_PLAYER',
      'MASTER_MERCHANT_CARDS',
      'DESERTER_PLAYER',
      'SABOTEUR_DISCARD',
      'WEDDING_CARDS',
      'PROGRESS_DISCARD',
      'SPY_PLAYER',
      'SPY_CARD',
    ].includes(knChoiceInteraction.purpose)
      ? knChoiceInteraction
      : null;
  const knTraySelectedHexId =
    typeof knTrayChoice?.context.selectedHexId === 'string'
      ? knTrayChoice.context.selectedHexId
      : '';
  const knTrackChoice =
    knChoiceInteraction?.purpose === 'WAR_DRUMS_POSITION' &&
    (!isOnlineMatch || knChoiceInteraction.playerId === onlineViewerPlayerId)
      ? knChoiceInteraction
      : null;
  const knDirectHandChoice =
    knTrayChoice !== null &&
    [
      'COMMERCIAL_HARBOR_RESOURCE',
      'SABOTEUR_DISCARD',
      'WEDDING_CARDS',
      'PROGRESS_DISCARD',
    ].includes(knTrayChoice.purpose)
      ? knTrayChoice
      : null;
  const knDirectHandTargetPlayerId = knDirectHandChoice?.context.targetPlayerId;
  const knDirectHandChoiceKey =
    knDirectHandChoice === null
      ? null
      : `${knDirectHandChoice.purpose}-${knDirectHandChoice.playerId}-${knDirectHandChoice.sourceCardId ?? 'mandatory'}-${typeof knDirectHandTargetPlayerId === 'string' ? knDirectHandTargetPlayerId : ''}`;
  const selectedKNHandIds =
    knDirectHandChoiceKey !== null && knHandSelection?.key === knDirectHandChoiceKey
      ? knHandSelection.selections
      : [];
  const selectedKNHandResources = resourceBundle(
    HAND_GOODS.map((good) => [
      good.id,
      selectedKNHandIds.filter((selection) => selection === good.id).length,
    ]),
  );
  const selectedKNProgressCardIds =
    knDirectHandChoice?.purpose === 'PROGRESS_DISCARD'
      ? selectedKNHandIds.map((id) => id as CardInstanceId)
      : [];
  const progressCardIntentDefinition =
    progressCardIntentId === null
      ? undefined
      : getProgressCardDefinition(gameState.progressCards[progressCardIntentId]);
  const inlineProgressCardIntentId =
    progressCardIntentDefinition?.effect === 'MOVE_ROBBER' ||
    progressCardIntentDefinition?.effect === 'PLACE_TWO_ROADS'
      ? progressCardIntentId
      : null;
  const progressCardModalId =
    progressChoiceInteraction?.sourceCardId ??
    (inlineProgressCardIntentId === null ? progressCardIntentId : null);
  const canCancelProgressCard = progressCardIntentId !== null && progressChoiceInteraction === null;
  const freeRoadInteraction =
    gameState.pendingInteraction?.type === 'PLACE_FREE_ROADS' ? gameState.pendingInteraction : null;
  const tradeOpponents = orderedPlayerConfigs.flatMap((config) => {
    const player = gameState.players[config.id];
    return player === undefined || player.id === viewerPlayer?.id ? [] : [player];
  });
  const bankTradeRatios =
    activePlayer === undefined
      ? {}
      : Object.fromEntries(
          (gameState.kn === null ? RESOURCES : HAND_GOODS).map((resource) => [
            resource.id,
            getBankTradeRatio(gameState, activePlayer.id, resource.id),
          ]),
        );
  const progressPurchase =
    activePlayer === undefined
      ? null
      : getProgressCardPurchaseAvailability(gameState, activePlayer.id);
  const setupInstruction =
    gameState.turn.phase === 'SETUP_PLACE_HOUSE'
      ? `Choose a glowing corner for your ${getSetupBuildingType(gameState) === 'MANSION' ? 'City' : 'House'}.`
      : gameState.turn.phase === 'SETUP_PLACE_ROAD'
        ? 'Choose a glowing edge attached to that house.'
        : null;
  const constructionInstruction =
    constructionType === 'ROAD'
      ? 'Choose a glowing edge for the new road. Press Escape or select Buy Road again to stop.'
      : constructionType === 'HOUSE'
        ? 'Choose a glowing corner for the new house. Press Escape or select Buy House again to stop.'
        : constructionType === 'MANSION'
          ? 'Choose one of your glowing houses to upgrade. Press Escape or select Buy City again to stop.'
          : null;
  const interactionInstruction =
    knBoardAction !== null
      ? knBoardAction.type === 'BUILD_KNIGHT'
        ? 'Choose a glowing corner connected to your Roads for the new Basic Knight.'
        : knBoardAction.type === 'BUILD_WALL'
          ? 'Choose a glowing City to fortify with a Wall.'
          : 'Choose a glowing Road destination, a weaker Knight, or the Knight’s own corner to chase the robber.'
      : knightCommand !== null
        ? `Choose one of your glowing Knights to ${knightCommand.toLocaleLowerCase()}.`
        : knBoardChoice?.purpose === 'SMITH_KNIGHT'
          ? 'Choose one of your glowing Knights to upgrade.'
          : knBoardChoice?.purpose === 'INVENTOR_FIRST_TOKEN'
            ? 'Choose the first bouncing number token.'
            : knBoardChoice?.purpose === 'INVENTOR_SECOND_TOKEN'
              ? 'Choose a second bouncing number token to swap them.'
              : knBoardChoice?.purpose === 'DESERTER_KNIGHT'
                ? 'Choose one of the opponent’s glowing Knights to remove.'
                : knBoardChoice?.purpose === 'RECLAMATION_HEX' ||
                    knBoardChoice?.purpose === 'RECLAMATION_RESOURCE'
                  ? 'Choose a glowing producing tile, then select its new resource.'
                  : knBoardChoice?.purpose === 'BISHOP_HEX'
                    ? 'Choose the robber’s glowing destination.'
                    : setupInstruction !== null
                      ? setupInstruction
                      : gameState.turn.phase === 'MOVE_ROBBER'
                        ? 'Choose any glowing hex except the robber’s current tile.'
                        : freeRoadInteraction !== null
                          ? `Choose a glowing edge for a free road · ${freeRoadInteraction.remainingPlacements} placement${freeRoadInteraction.remainingPlacements === 1 ? '' : 's'} remaining.`
                          : constructionInstruction;

  const leaveGame = (destination: '/' | '/lobby') => {
    if (isOnlineMatch) {
      if (destination === '/lobby') {
        const roomCode = onlineRoom.code;
        void returnOnlineLobby().then((returned) => {
          if (!returned) {
            setActionError(
              useOnlineStore.getState().error?.message ??
                'Could not return this match to the lobby.',
            );
            return;
          }
          void navigate(`/online/${roomCode}`, { replace: true });
        });
        return;
      }
      void leaveOnlineRoom().then(() => {
        void navigate(destination, { replace: true });
      });
      return;
    }
    void navigate(destination, { flushSync: true });
    if (destination === '/lobby') returnGameToLobby();
    else clearGame();
  };

  const handleActionResult = (
    result: ReturnType<typeof dispatchGameAction>,
    keepConstructionMode = false,
    keepTradeModal = false,
  ) => {
    if (result === null) {
      setActionError('No active match is available for this action.');
    } else if (!result.ok) {
      setActionError(result.error.message);
      audioManager.playInvalid(settings.masterVolume, settings.sfxVolume);
    } else {
      setActionError(null);
      setInspectedTarget(null);
      setBoardBuildMenu(null);
      setKnightBoardMenu(null);
      setKnightCommand(null);
      setKNBoardAction(null);
      if (!keepConstructionMode) setConstructionType(null);
      if (!keepTradeModal) {
        setTradeModalTurnKey(null);
        setEditingTradeId(null);
      }
    }
  };

  const selectBoardTarget = (target: BoardTarget, position?: BoardViewportPoint) => {
    const actorId = gameState.turn.activePlayerId;
    if (actorId === null) {
      setActionError('No active player is available for this action.');
      return;
    }

    if (
      knBoardAction !== null &&
      target.kind === 'VERTEX' &&
      knBoardAction.eligibleVertexIds.includes(target.id)
    ) {
      const id = actionId(`local-${globalThis.crypto.randomUUID()}`);
      const result =
        knBoardAction.type === 'BUILD_KNIGHT'
          ? dispatchGameAction({ id, type: 'BUILD_KNIGHT', actorId, vertexId: target.id })
          : knBoardAction.type === 'BUILD_WALL'
            ? dispatchGameAction({ id, type: 'BUILD_WALL', actorId, vertexId: target.id })
            : knBoardAction.chaseVertexId === target.id
              ? dispatchGameAction({
                  id,
                  type: 'CHASE_ROBBER',
                  actorId,
                  knightId: knBoardAction.knightId,
                })
              : knBoardAction.targetKnightByVertexId[target.id] === undefined
                ? dispatchGameAction({
                    id,
                    type: 'MOVE_KNIGHT',
                    actorId,
                    knightId: knBoardAction.knightId,
                    vertexId: target.id,
                  })
                : dispatchGameAction({
                    id,
                    type: 'DISPLACE_KNIGHT',
                    actorId,
                    knightId: knBoardAction.knightId,
                    targetKnightId: knBoardAction.targetKnightByVertexId[target.id]!,
                  });
      if (result?.ok) setKNBoardAction(null);
      handleActionResult(result);
      return;
    }

    if (knightCommand !== null && target.kind === 'VERTEX') {
      const player = gameState.players[actorId];
      const knight = player?.knights.find((candidate) => candidate.vertexId === target.id);
      if (
        player !== undefined &&
        knight !== undefined &&
        eligibleKnightIds[knightCommand].includes(knight.id)
      ) {
        if (knightCommand === 'MOVE') {
          beginKNBoardAction('MOVE_KNIGHT', knight.id);
        } else {
          handleActionResult(
            dispatchGameAction({
              id: actionId(`local-${globalThis.crypto.randomUUID()}`),
              type: knightCommand === 'ACTIVATE' ? 'ACTIVATE_KNIGHT' : 'UPGRADE_KNIGHT',
              actorId,
              knightId: knight.id,
            }),
          );
        }
        return;
      }
    }

    if (knBoardChoice !== null) {
      const knightSelection =
        target.kind === 'VERTEX' &&
        (knBoardChoice.purpose === 'SMITH_KNIGHT' || knBoardChoice.purpose === 'DESERTER_KNIGHT')
          ? Object.values(gameState.players)
              .flatMap((player) => player.knights)
              .find(
                (knight) =>
                  knight.vertexId === target.id && knBoardChoice.eligibleIds.includes(knight.id),
              )?.id
          : target.id;
      if (knightSelection === undefined || !knBoardChoice.eligibleIds.includes(knightSelection)) {
        setActionError('Choose one of the glowing board targets.');
        return;
      }
      if (knBoardChoice.purpose === 'INVENTOR_SECOND_TOKEN') {
        const selectedHexId = knightSelection as HexId;
        const interactionFirstHexId = knBoardChoice.context.firstHexId as HexId;
        const currentDraft =
          inventorDraft?.interactionFirstHexId === interactionFirstHexId
            ? inventorDraft
            : {
                interactionFirstHexId,
                firstHexId: interactionFirstHexId,
                secondHexId: null,
              };
        if (selectedHexId === currentDraft.firstHexId) {
          setInventorDraft({ ...currentDraft, firstHexId: null });
        } else if (selectedHexId === currentDraft.secondHexId) {
          setInventorDraft({ ...currentDraft, secondHexId: null });
        } else if (currentDraft.firstHexId === null) {
          setInventorDraft({ ...currentDraft, firstHexId: selectedHexId });
        } else if (currentDraft.secondHexId === null) {
          setInventorDraft({ ...currentDraft, secondHexId: selectedHexId });
        } else {
          setActionError(
            'Click either highlighted number token first, then choose its replacement.',
          );
          return;
        }
        setActionError(null);
        return;
      }
      const result = dispatchGameAction({
        id: actionId(`local-${globalThis.crypto.randomUUID()}`),
        type: 'RESOLVE_PROGRESS_SELECTION',
        actorId: knBoardChoice.playerId,
        selections: [knightSelection],
      });
      if (result?.ok && knBoardChoice.purpose === 'INVENTOR_FIRST_TOKEN') {
        const firstHexId = knightSelection as HexId;
        setInventorDraft({ interactionFirstHexId: firstHexId, firstHexId, secondHexId: null });
      }
      handleActionResult(result);
      return;
    }

    if (gameState.turn.phase === 'ACTION_PHASE' && constructionType === null) {
      const ownedKnight =
        target.kind === 'VERTEX'
          ? gameState.players[actorId]?.knights.find((knight) => knight.vertexId === target.id)
          : undefined;
      if (ownedKnight !== undefined) {
        setKnightBoardMenu({
          knightId: ownedKnight.id,
          position: position ?? {
            x: (globalThis.innerWidth || 1200) / 2,
            y: (globalThis.innerHeight || 800) / 2,
          },
        });
        setBoardBuildMenu(null);
        setActionError(null);
        setInspectedTarget(target);
        return;
      }
      const directTypes: BoardPurchaseType[] = [];
      if (target.kind === 'EDGE' && potentialConstructionTargets.roadIds.includes(target.id)) {
        directTypes.push('ROAD');
      }
      if (target.kind === 'VERTEX') {
        if (potentialConstructionTargets.cityIds.includes(target.id)) directTypes.push('MANSION');
        if (potentialConstructionTargets.houseIds.includes(target.id)) directTypes.push('HOUSE');
        if (potentialConstructionTargets.knightIds.includes(target.id)) directTypes.push('KNIGHT');
        if (potentialConstructionTargets.wallIds.includes(target.id)) directTypes.push('WALL');
      }

      if (directTypes.length > 0 && (target.kind === 'EDGE' || target.kind === 'VERTEX')) {
        setBoardBuildMenu({
          types: directTypes,
          target,
          position: position ?? {
            x: (globalThis.innerWidth || 1200) / 2,
            y: (globalThis.innerHeight || 800) / 2,
          },
        });
        setKnightBoardMenu(null);
        setActionError(null);
        setInspectedTarget(target);
        return;
      }
    }

    const id = actionId(`local-${globalThis.crypto.randomUUID()}`);
    let result: ReturnType<typeof dispatchGameAction> = null;
    if (gameState.turn.phase === 'SETUP_PLACE_HOUSE' && target.kind === 'VERTEX') {
      result = dispatchGameAction({ id, type: 'PLACE_SETUP_HOUSE', actorId, vertexId: target.id });
    } else if (gameState.turn.phase === 'SETUP_PLACE_ROAD' && target.kind === 'EDGE') {
      result = dispatchGameAction({ id, type: 'PLACE_SETUP_ROAD', actorId, edgeId: target.id });
    } else if (gameState.turn.phase === 'MOVE_ROBBER' && target.kind === 'HEX') {
      result = dispatchGameAction({ id, type: 'MOVE_ROBBER', actorId, hexId: target.id });
    } else if (
      gameState.turn.phase === 'CARD_RESOLUTION' &&
      freeRoadInteraction !== null &&
      target.kind === 'EDGE'
    ) {
      result = dispatchGameAction({ id, type: 'BUILD_ROAD', actorId, edgeId: target.id });
    } else if (gameState.turn.phase === 'ACTION_PHASE') {
      if (constructionType === 'ROAD' && target.kind === 'EDGE') {
        result = dispatchGameAction({ id, type: 'BUILD_ROAD', actorId, edgeId: target.id });
      } else if (constructionType === 'HOUSE' && target.kind === 'VERTEX') {
        result = dispatchGameAction({ id, type: 'BUILD_HOUSE', actorId, vertexId: target.id });
      } else if (constructionType === 'MANSION' && target.kind === 'VERTEX') {
        result = dispatchGameAction({ id, type: 'UPGRADE_MANSION', actorId, vertexId: target.id });
      }
    }

    if (result === null)
      setActionError('That board target is not available during the current phase.');
    else handleActionResult(result);
  };

  const buildFromBoardMenu = (type: BoardPurchaseType) => {
    const actorId = gameState.turn.activePlayerId;
    if (actorId === null || boardBuildMenu === null) return;
    const id = actionId(`local-${globalThis.crypto.randomUUID()}`);
    const { target } = boardBuildMenu;
    const result =
      type === 'ROAD' && target.kind === 'EDGE'
        ? dispatchGameAction({ id, type: 'BUILD_ROAD', actorId, edgeId: target.id })
        : type === 'HOUSE' && target.kind === 'VERTEX'
          ? dispatchGameAction({ id, type: 'BUILD_HOUSE', actorId, vertexId: target.id })
          : type === 'MANSION' && target.kind === 'VERTEX'
            ? dispatchGameAction({ id, type: 'UPGRADE_MANSION', actorId, vertexId: target.id })
            : type === 'KNIGHT' && target.kind === 'VERTEX'
              ? dispatchGameAction({ id, type: 'BUILD_KNIGHT', actorId, vertexId: target.id })
              : type === 'WALL' && target.kind === 'VERTEX'
                ? dispatchGameAction({ id, type: 'BUILD_WALL', actorId, vertexId: target.id })
                : null;
    handleActionResult(result);
  };

  const rollDice = () => {
    if (gameState.turn.activePlayerId === null) return;
    handleActionResult(
      dispatchGameAction({
        id: actionId(`local-${globalThis.crypto.randomUUID()}`),
        type: 'ROLL_DICE',
        actorId: gameState.turn.activePlayerId,
      }),
    );
  };

  const endTurn = () => {
    if (gameState.turn.activePlayerId === null) return;
    handleActionResult(
      dispatchGameAction({
        id: actionId(`local-${globalThis.crypto.randomUUID()}`),
        type: 'END_TURN',
        actorId: gameState.turn.activePlayerId,
      }),
    );
  };

  const chooseConstruction = (type: ConstructionType) => {
    setBoardBuildMenu(null);
    setKnightBoardMenu(null);
    setKnightCommand(null);
    setKNBoardAction(null);
    if (constructionType === type) {
      setConstructionType(null);
      setActionError(null);
      return;
    }
    setConstructionType(type);
    setInspectedTarget(null);
    setActionError(null);
  };

  const prepareTradeModal = (
    offered: ResourceBundle = resourceBundle([]),
    requested: ResourceBundle = resourceBundle([]),
    tradeToEdit: TradeId | null = null,
  ) => {
    setConstructionType(null);
    setBoardBuildMenu(null);
    setKnightBoardMenu(null);
    setKnightCommand(null);
    setInspectedTarget(null);
    setActionError(null);
    setTradeOffered(offered);
    setTradeRequested(requested);
    setEditingTradeId(tradeToEdit);
    setTradeModalTurnKey(currentTradeTurnKey);
    setKNBoardAction(null);
  };

  const toggleTradeModal = () => {
    if (tradeModalOpen) {
      setTradeModalTurnKey(null);
      setTradeOffered(resourceBundle([]));
      setTradeRequested(resourceBundle([]));
      setEditingTradeId(null);
      setActionError(null);
      return;
    }
    if (canEditResponseTrade && responseTrade !== undefined) {
      prepareTradeModal(responseTrade.offered, responseTrade.requested, responseTrade.id);
      return;
    }
    prepareTradeModal();
  };

  const dispatchKNAction = (
    action:
      | { readonly type: 'ACTIVATE_KNIGHT'; readonly knightId: KnightId }
      | { readonly type: 'UPGRADE_KNIGHT'; readonly knightId: KnightId }
      | { readonly type: 'CHASE_ROBBER'; readonly knightId: KnightId }
      | { readonly type: 'BUY_IMPROVEMENT'; readonly track: KNProgressFamily },
  ) => {
    const actorId = gameState.turn.activePlayerId;
    if (actorId === null) return;
    const result = dispatchGameAction({
      id: actionId(`local-${globalThis.crypto.randomUUID()}`),
      actorId,
      ...action,
    });
    handleActionResult(result);
  };

  const beginKNBoardAction = (
    actionType: 'BUILD_KNIGHT' | 'BUILD_WALL' | 'MOVE_KNIGHT',
    knightId?: KnightId,
  ) => {
    const actorId = gameState.turn.activePlayerId;
    if (actorId === null) return;
    if (actionType === 'BUILD_KNIGHT') {
      if (knBoardAction?.type === 'BUILD_KNIGHT') {
        setKNBoardAction(null);
        setActionError(null);
        return;
      }
      setKNBoardAction({
        type: actionType,
        eligibleVertexIds: getLegalKnightPlacementVertexIds(gameState, actorId),
      });
    } else if (actionType === 'BUILD_WALL') {
      setKNBoardAction({
        type: actionType,
        eligibleVertexIds: getLegalWallVertexIds(gameState, actorId),
      });
    } else if (actionType === 'MOVE_KNIGHT' && knightId !== undefined) {
      const player = gameState.players[actorId];
      const knight = player?.knights.find((candidate) => candidate.id === knightId);
      if (player === undefined || knight === undefined) return;
      const options = knightMovementOptions(gameState, player, knight);
      setKNBoardAction({
        type: actionType,
        knightId,
        ...options,
      });
    }
    setConstructionType(null);
    setBoardBuildMenu(null);
    setKnightBoardMenu(null);
    setKnightCommand(null);
    setTradeModalTurnKey(null);
    setEditingTradeId(null);
    setActionError(null);
  };

  const toggleKnightCommand = (command: KnightCommand) => {
    setKnightBoardMenu(null);
    setBoardBuildMenu(null);
    setConstructionType(null);
    setKNBoardAction(null);
    setActionError(null);
    setKnightCommand((current) => (current === command ? null : command));
  };

  const cancelKnightMode = () => {
    setKnightCommand(null);
    if (knBoardAction?.type === 'BUILD_KNIGHT') setKNBoardAction(null);
    setKnightBoardMenu(null);
    setActionError(null);
  };

  const completeBankTrade = (offered: ResourceBundle, requested: ResourceBundle) => {
    const actorId = gameState.turn.activePlayerId;
    if (actorId === null) return;
    const goods = gameState.kn === null ? RESOURCES : HAND_GOODS;
    const offeredGoods = goods.filter((resource) => (offered[resource.id] ?? 0) > 0);
    const requestedGoods = goods.filter((resource) => (requested[resource.id] ?? 0) > 0);
    const warn = (message: string) => {
      setActionError(message);
      audioManager.playInvalid(settings.masterVolume, settings.sfxVolume);
    };
    const requestedCount = resourceCount(requested);
    if (requestedCount === 0) {
      warn('Choose at least one card to receive from the bank.');
      return;
    }
    if (offeredGoods.length === 0) {
      warn('Choose cards from your hand to offer the bank.');
      return;
    }
    if (offeredGoods.some((good) => (requested[good.id] ?? 0) > 0)) {
      warn('A card type cannot be offered and requested in the same bank trade.');
      return;
    }

    let earnedBankCards = 0;
    for (const offeredGood of offeredGoods) {
      const offeredAmount = offered[offeredGood.id] ?? 0;
      const ratio = bankTradeRatios[offeredGood.id] ?? 4;
      if (offeredAmount % ratio !== 0) {
        warn(
          `${offeredGood.displayName} must be offered in groups of ${ratio} at your current bank or port rate.`,
        );
        return;
      }
      earnedBankCards += offeredAmount / ratio;
    }
    if (earnedBankCards !== requestedCount) {
      warn(
        `Your offered cards buy ${earnedBankCards} bank card${earnedBankCards === 1 ? '' : 's'}, but you requested ${requestedCount}.`,
      );
      return;
    }

    const currentBank = combinedBank(gameState.bank, gameState.commodityBank);
    const unavailableGood = requestedGoods.find(
      (good) => (currentBank[good.id] ?? 0) < (requested[good.id] ?? 0),
    );
    if (unavailableGood !== undefined) {
      warn(`The bank does not have enough ${unavailableGood.displayName} cards.`);
      return;
    }
    const result = dispatchGameAction({
      id: actionId(`local-${globalThis.crypto.randomUUID()}`),
      type: 'BANK_TRADE',
      actorId,
      offered,
      requested,
    });
    if (result?.ok) {
      setTradeOffered(resourceBundle([]));
      setTradeRequested(resourceBundle([]));
      setEditingTradeId(null);
    }
    handleActionResult(result);
  };

  const selectResourceForTrade = (resourceId: ResourceId) => {
    if (activePlayer === undefined) return;
    const owned = isCommodityId(resourceId)
      ? (activePlayer.commodities[resourceId] ?? 0)
      : (activePlayer.resources[resourceId] ?? 0);
    if (owned < 1) return;
    if (!tradeModalOpen) {
      if (canEditResponseTrade && responseTrade !== undefined) {
        if ((responseTrade.requested[resourceId] ?? 0) > 0) {
          prepareTradeModal(responseTrade.offered, responseTrade.requested, responseTrade.id);
          setActionError('A card type cannot be offered and requested in the same trade.');
          audioManager.playInvalid(settings.masterVolume, settings.sfxVolume);
          return;
        }
        const selected = responseTrade.offered[resourceId] ?? 0;
        prepareTradeModal(
          selected >= owned
            ? responseTrade.offered
            : { ...responseTrade.offered, [resourceId]: selected + 1 },
          responseTrade.requested,
          responseTrade.id,
        );
        return;
      }
      prepareTradeModal(resourceBundle([[resourceId, 1]]));
      return;
    }
    if ((tradeRequested[resourceId] ?? 0) > 0) {
      setActionError('A card type cannot be offered and requested in the same trade.');
      audioManager.playInvalid(settings.masterVolume, settings.sfxVolume);
      return;
    }
    setTradeOffered((current) => {
      const selected = current[resourceId] ?? 0;
      return selected >= owned ? current : { ...current, [resourceId]: selected + 1 };
    });
    setActionError(null);
  };

  const adjustTradeSelection = (
    side: 'OFFERED' | 'REQUESTED',
    resourceId: ResourceId,
    change: -1 | 1,
  ) => {
    if (side === 'REQUESTED' && change > 0 && (tradeOffered[resourceId] ?? 0) > 0) {
      setActionError('A card type cannot be offered and requested in the same trade.');
      return;
    }
    const setter = side === 'OFFERED' ? setTradeOffered : setTradeRequested;
    setter((current) => {
      const amount = current[resourceId] ?? 0;
      const maximum = side === 'REQUESTED' ? gameState.config.rules.bankCardsPerResource : amount;
      if ((change < 0 && amount === 0) || (change > 0 && amount >= maximum)) return current;
      return { ...current, [resourceId]: amount + change };
    });
    setActionError(null);
  };

  const createPlayerTrade = (offered: ResourceBundle, requested: ResourceBundle) => {
    const actorId = gameState.turn.activePlayerId;
    if (actorId === null) return;
    const result =
      editingTradeId === null
        ? dispatchGameAction({
            id: actionId(`local-${globalThis.crypto.randomUUID()}`),
            type: 'CREATE_TRADE',
            actorId,
            tradeId: tradeId(`local-${globalThis.crypto.randomUUID()}`),
            recipientIds: tradeOpponents.map((opponent) => opponent.id),
            offered,
            requested,
          })
        : dispatchGameAction({
            id: actionId(`local-${globalThis.crypto.randomUUID()}`),
            type: 'UPDATE_TRADE',
            actorId,
            tradeId: editingTradeId,
            offered,
            requested,
          });
    if (result?.ok) {
      setTradeModalTurnKey(null);
      setTradeOffered(resourceBundle([]));
      setTradeRequested(resourceBundle([]));
      setEditingTradeId(null);
    }
    handleActionResult(result);
  };

  const respondToPlayerTrade = (playerId: PlayerState['id'], accepted: boolean) => {
    if (tradeInteraction === null) return;
    handleActionResult(
      dispatchGameAction({
        id: actionId(`local-${globalThis.crypto.randomUUID()}`),
        type: 'RESPOND_TO_TRADE',
        actorId: playerId,
        tradeId: tradeInteraction.tradeId,
        accepted,
      }),
    );
  };

  const confirmPlayerTrade = (recipientId: PlayerState['id']) => {
    if (responseTrade === undefined) return;
    handleActionResult(
      dispatchGameAction({
        id: actionId(`local-${globalThis.crypto.randomUUID()}`),
        type: 'CONFIRM_TRADE',
        actorId: responseTrade.fromPlayerId,
        tradeId: responseTrade.id,
        recipientId,
      }),
    );
  };

  const closePlayerTradeOffer = (expired: boolean) => {
    if (responseTrade === undefined) return;
    setTradeModalTurnKey(null);
    setEditingTradeId(null);
    const result = dispatchGameAction({
      id: actionId(`local-${globalThis.crypto.randomUUID()}`),
      type: expired ? 'EXPIRE_TRADE' : 'CANCEL_TRADE',
      actorId: responseTrade.fromPlayerId,
      tradeId: responseTrade.id,
    });
    if (result !== null && !result.ok) setActionError(result.error.message);
  };

  const confirmDiscard = (resources: ResourceBundle) => {
    if (discardPlayerId === undefined) return;
    const result = dispatchGameAction({
      id: actionId(`local-${globalThis.crypto.randomUUID()}`),
      type: 'DISCARD_RESOURCES',
      actorId: discardPlayerId,
      resources,
    });
    if (result?.ok) setDiscardSelection(null);
    handleActionResult(result);
  };

  const selectResourceForDiscard = (resourceId: ResourceId) => {
    if (
      discardPlayerId === undefined ||
      controlledDiscardPlayer === undefined ||
      requiredDiscardCount === undefined
    ) {
      return;
    }
    const owned = isCommodityId(resourceId)
      ? (controlledDiscardPlayer.commodities[resourceId] ?? 0)
      : (controlledDiscardPlayer.resources[resourceId] ?? 0);
    setDiscardSelection((current) => {
      const resources =
        current?.playerId === discardPlayerId && current.turnNumber === gameState.turn.turnNumber
          ? current.resources
          : {};
      const selected = resources[resourceId] ?? 0;
      if (selected >= owned || resourceCount(resources) >= requiredDiscardCount) return current;
      return {
        playerId: discardPlayerId,
        turnNumber: gameState.turn.turnNumber,
        resources: { ...resources, [resourceId]: selected + 1 },
      };
    });
    setActionError(null);
  };

  const returnResourceFromDiscard = (resourceId: ResourceId) => {
    if (discardPlayerId === undefined) return;
    setDiscardSelection((current) => {
      if (
        current?.playerId !== discardPlayerId ||
        current.turnNumber !== gameState.turn.turnNumber
      ) {
        return current;
      }
      const selected = current.resources[resourceId] ?? 0;
      if (selected < 1) return current;
      return {
        playerId: discardPlayerId,
        turnNumber: gameState.turn.turnNumber,
        resources: { ...current.resources, [resourceId]: selected - 1 },
      };
    });
    setActionError(null);
  };

  const chooseStealTarget = (targetPlayerId: PlayerState['id']) => {
    const actorId = gameState.turn.activePlayerId;
    if (actorId === null) return;
    handleActionResult(
      dispatchGameAction({
        id: actionId(`local-${globalThis.crypto.randomUUID()}`),
        type: 'STEAL_FROM_PLAYER',
        actorId,
        targetPlayerId,
      }),
    );
  };

  const buyProgressCard = () => {
    const actorId = gameState.turn.activePlayerId;
    if (actorId === null) return;
    const result = dispatchGameAction({
      id: actionId(`local-${globalThis.crypto.randomUUID()}`),
      type: 'BUY_PROGRESS_CARD',
      actorId,
    });
    handleActionResult(result);
  };

  const playProgressCard = (cardInstanceId: CardInstanceId) => {
    setProgressCardIntentId(cardInstanceId);
    setActionError(null);
    setConstructionType(null);
    setBoardBuildMenu(null);
    setTradeModalTurnKey(null);
  };

  const playKNProgressCard = (cardInstanceId: CardInstanceId) => {
    const pending = gameState.pendingInteraction;
    if (
      pending?.type === 'KN_SELECTION' &&
      [
        'MEDICINE_CITY',
        'SMITH_KNIGHT',
        'INVENTOR_FIRST_TOKEN',
        'INVENTOR_SECOND_TOKEN',
        'RECLAMATION_HEX',
        'RECLAMATION_RESOURCE',
        'WAR_DRUMS_POSITION',
      ].includes(pending.purpose) &&
      pending.sourceCardId === cardInstanceId
    ) {
      if (!pending.canCancel) {
        setActionError('This Progress Card is committed and must be completed.');
        return;
      }
      handleActionResult(
        dispatchGameAction({
          id: actionId(`local-${globalThis.crypto.randomUUID()}`),
          type: 'RESOLVE_PROGRESS_SELECTION',
          actorId: pending.playerId,
          selections: [],
          cancelled: true,
        }),
      );
      setInventorDraft(null);
      setWarDrumsPosition(null);
      return;
    }

    const card = gameState.kn?.progressCards[cardInstanceId];
    const definition =
      card === undefined ? undefined : getKNProgressCardDefinition(card.definitionId);
    if (definition?.effect === 'MEDICINE') {
      const actorId = gameState.turn.activePlayerId;
      const player = actorId === null ? undefined : gameState.players[actorId];
      const hasHouse =
        actorId !== null &&
        Object.values(gameState.board.vertices).some(
          (vertex) => vertex.building?.ownerId === actorId && vertex.building.type === 'HOUSE',
        );
      if (player === undefined) {
        setActionError('No active player can use Medicine right now.');
        return;
      }
      if (!hasHouse) {
        setActionError('Medicine needs one of your Houses to upgrade.');
        return;
      }
      if (player.mansionsRemaining < 1) {
        setActionError('Medicine needs an available City piece.');
        return;
      }
      if (
        (player.resources[RESOURCE_IDS.ore] ?? 0) < 2 ||
        (player.resources[RESOURCE_IDS.grain] ?? 0) < 1
      ) {
        setActionError('Medicine costs two Ore and one Grain.');
        return;
      }
      confirmKNProgressCardPlay(cardInstanceId);
      return;
    }

    if (
      definition?.effect === 'SMITH' ||
      definition?.effect === 'INVENTOR' ||
      definition?.effect === 'RECLAMATION' ||
      definition?.effect === 'WAR_DRUMS'
    ) {
      confirmKNProgressCardPlay(cardInstanceId);
      return;
    }

    setKNProgressCardIntentId(cardInstanceId);
    setActionError(null);
    setConstructionType(null);
    setBoardBuildMenu(null);
    setTradeModalTurnKey(null);
  };

  const confirmKNProgressCardPlay = (cardInstanceId: CardInstanceId) => {
    const actorId = gameState.turn.activePlayerId;
    if (actorId === null) return;
    const result = dispatchGameAction({
      id: actionId(`local-${globalThis.crypto.randomUUID()}`),
      type: 'PLAY_KN_PROGRESS_CARD',
      actorId,
      cardInstanceId,
    });
    if (result?.ok) setKNProgressCardIntentId(null);
    handleActionResult(result);
  };

  const resolveKNChoice = (selections: readonly string[], cancelled = false) => {
    if (knChoiceInteraction === null) return;
    const result = dispatchGameAction({
      id: actionId(`local-${globalThis.crypto.randomUUID()}`),
      type: 'RESOLVE_PROGRESS_SELECTION',
      actorId: knChoiceInteraction.playerId,
      selections,
      cancelled,
    });
    if (result?.ok) {
      setKNHandSelection(null);
      setHandSelectionWarning(null);
      setInventorDraft(null);
      setWarDrumsPosition(null);
    }
    handleActionResult(result);
  };

  const updateKNHandSelections = (selections: readonly string[]) => {
    if (knDirectHandChoiceKey === null) return;
    setKNHandSelection({ key: knDirectHandChoiceKey, selections });
    setHandSelectionWarning(null);
    setActionError(null);
  };

  const selectKNHandResource = (resourceId: ResourceId) => {
    if (
      knDirectHandChoice === null ||
      knDirectHandChoiceKey === null ||
      knDirectHandChoice.purpose === 'PROGRESS_DISCARD'
    ) {
      return;
    }
    if (knDirectHandChoice.purpose === 'COMMERCIAL_HARBOR_RESOURCE' && isCommodityId(resourceId)) {
      setHandSelectionWarning((current) => ({
        resourceId,
        signal: (current?.signal ?? 0) + 1,
      }));
      setActionError('Commercial Harbor can only give a resource card.');
      audioManager.playInvalid(settings.masterVolume, settings.sfxVolume);
      return;
    }

    const player = gameState.players[knDirectHandChoice.playerId];
    const owned =
      player === undefined
        ? 0
        : isCommodityId(resourceId)
          ? (player.commodities[resourceId] ?? 0)
          : (player.resources[resourceId] ?? 0);
    const selectedCount = selectedKNHandIds.filter((id) => id === resourceId).length;
    if (
      !knDirectHandChoice.eligibleIds.includes(resourceId) ||
      selectedCount >= owned ||
      selectedKNHandIds.length >= knDirectHandChoice.maximumSelections
    ) {
      return;
    }
    updateKNHandSelections([...selectedKNHandIds, resourceId]);
  };

  const selectKNProgressCardForReturn = (cardInstanceId: CardInstanceId) => {
    if (
      knDirectHandChoice?.purpose !== 'PROGRESS_DISCARD' ||
      selectedKNHandIds.length >= knDirectHandChoice.maximumSelections ||
      !knDirectHandChoice.eligibleIds.includes(cardInstanceId)
    ) {
      return;
    }
    updateKNHandSelections([...selectedKNHandIds, cardInstanceId]);
  };

  const confirmProgressCardPlay = (cardInstanceId: CardInstanceId) => {
    const actorId = gameState.turn.activePlayerId;
    if (actorId === null) return;
    const result = dispatchGameAction({
      id: actionId(`local-${globalThis.crypto.randomUUID()}`),
      type: 'PLAY_PROGRESS_CARD',
      actorId,
      cardInstanceId,
    });
    if (result?.ok) setProgressCardIntentId(null);
    handleActionResult(result);
  };

  const prepareProgressCardResolution = (
    cardInstanceId: CardInstanceId,
    expectedInteraction: 'SELECT_RESOURCES' | 'SELECT_RESOURCE_TYPE',
  ): PlayerState['id'] | null => {
    const actorId = gameState.turn.activePlayerId;
    if (actorId === null) return null;
    const pending = gameState.pendingInteraction;
    if (
      pending?.type === expectedInteraction &&
      pending.playerId === actorId &&
      pending.sourceCardId === cardInstanceId
    ) {
      return actorId;
    }
    const played = dispatchGameAction({
      id: actionId(`local-${globalThis.crypto.randomUUID()}`),
      type: 'PLAY_PROGRESS_CARD',
      actorId,
      cardInstanceId,
    });
    if (played?.ok) return actorId;
    handleActionResult(played);
    return null;
  };

  const chooseCardResources = (cardInstanceId: CardInstanceId, resources: ResourceBundle) => {
    const actorId = prepareProgressCardResolution(cardInstanceId, 'SELECT_RESOURCES');
    if (actorId === null) return;
    const result = dispatchGameAction({
      id: actionId(`local-${globalThis.crypto.randomUUID()}`),
      type: 'SELECT_CARD_RESOURCES',
      actorId,
      cardInstanceId,
      resources,
    });
    if (result?.ok) setProgressCardIntentId(null);
    handleActionResult(result);
  };

  const chooseCardResourceType = (cardInstanceId: CardInstanceId, resourceId: ResourceId) => {
    const actorId = prepareProgressCardResolution(cardInstanceId, 'SELECT_RESOURCE_TYPE');
    if (actorId === null) return;
    const result = dispatchGameAction({
      id: actionId(`local-${globalThis.crypto.randomUUID()}`),
      type: 'SELECT_CARD_RESOURCE_TYPE',
      actorId,
      cardInstanceId,
      resourceId,
    });
    if (result?.ok) setProgressCardIntentId(null);
    handleActionResult(result);
  };

  const startRematch = () => {
    if (isOnlineMatch) {
      if (!onlineViewerIsHost) {
        setRematchError('Waiting for the host to start the rematch.');
        return;
      }
      void rematchOnline().then((started) => {
        if (!started) {
          setRematchError(useOnlineStore.getState().error?.message ?? 'Could not start rematch.');
        } else {
          setRematchError(null);
        }
      });
      return;
    }
    const result = rematch();
    if (!result.ok) {
      setRematchError(result.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setRematchError(null);
    setActionError(null);
    setConstructionType(null);
    setBoardBuildMenu(null);
    setTradeModalTurnKey(null);
    setProgressCardIntentId(null);
    setKNProgressCardIntentId(null);
    setKNBoardAction(null);
  };

  const copyDeveloperState = () => {
    const serialized = JSON.stringify(gameState, null, 2);
    if (globalThis.navigator.clipboard === undefined) {
      setActionError('Clipboard access is unavailable in this browser.');
      return;
    }
    void globalThis.navigator.clipboard.writeText(serialized).then(
      () => setActionError('Serialized game state copied to the clipboard.'),
      () => setActionError('The browser blocked clipboard access.'),
    );
  };

  const toggleAdminResources = () => {
    if (isOnlineMatch) {
      const enabling = !adminMode;
      void setOnlineDebugMode(enabling).then((updated) => {
        if (!updated) return;
        setActionError(
          enabling
            ? 'Developer mode enabled: you have 99 of every good, one of every Progress Card, and robber rolls are ignored. Sevens also never force you to discard.'
            : 'Developer mode disabled. Robber rolls and forced discards are restored.',
        );
      });
      return;
    }
    toggleAdminMode();
    if (!adminMode) {
      setActionError(
        `Developer mode enabled: ${activePlayer?.name ?? 'Active player'} has 99 of every good, one of every Progress Card, and robber rolls are ignored. Sevens also never force you to discard.`,
      );
      return;
    }
    setActionError('Developer mode disabled. Robber rolls and forced discards are restored.');
  };

  const grantDeveloperProgressCards = () => {
    if (isOnlineMatch) {
      void grantOnlineProgressCards().then((granted) => {
        if (granted) {
          setActionError('Developer grant: added one fresh copy of every Progress Card.');
        }
      });
      return;
    }
    grantAllProgressCards();
    setActionError('Developer grant: added one fresh copy of every Progress Card.');
  };

  const roadAvailability = constructionAvailability.find((option) => option.type === 'ROAD');
  const houseAvailability = constructionAvailability.find((option) => option.type === 'HOUSE');
  const mansionAvailability = constructionAvailability.find((option) => option.type === 'MANSION');
  const wallPlacementCount =
    activePlayer === undefined ? 0 : getLegalWallVertexIds(gameState, activePlayer.id).length;
  const canUseTurnActions =
    activePlayer !== undefined &&
    (!isOnlineMatch || activePlayer.id === onlineViewerPlayerId) &&
    !onlineActionPending &&
    gameState.turn.phase === 'ACTION_PHASE' &&
    gameState.pendingInteraction === null;
  const canComposeTrade = canUseTurnActions || canEditResponseTrade;
  const boardBuildChoices: readonly BoardBuildChoice[] =
    boardBuildMenu === null
      ? []
      : boardBuildMenu.types.map((type) => {
          if (type === 'WALL') {
            return {
              type,
              cost: WALL_COST,
              availableResources: activePlayer?.resources ?? {},
              canBuild:
                canUseTurnActions &&
                (activePlayer?.cityWallsRemaining ?? 0) > 0 &&
                (activePlayer?.resources[RESOURCE_IDS.brick] ?? 0) >= 2,
              remaining: activePlayer?.cityWallsRemaining ?? 0,
              onBuild: () => buildFromBoardMenu(type),
            };
          }
          if (type === 'KNIGHT') {
            const remaining = Math.max(
              0,
              2 - (activePlayer?.knights.filter((knight) => knight.level === 1).length ?? 0),
            );
            return {
              type,
              cost: KNIGHT_COST,
              availableResources: activePlayer?.resources ?? {},
              canBuild:
                canUseTurnActions &&
                remaining > 0 &&
                (activePlayer?.resources[RESOURCE_IDS.livestock] ?? 0) >= 1 &&
                (activePlayer?.resources[RESOURCE_IDS.ore] ?? 0) >= 1,
              remaining,
              onBuild: () => buildFromBoardMenu(type),
            };
          }
          const availability = constructionAvailability.find((option) => option.type === type);
          const remaining =
            type === 'ROAD'
              ? (activePlayer?.roadsRemaining ?? 0)
              : type === 'HOUSE'
                ? (activePlayer?.housesRemaining ?? 0)
                : (activePlayer?.mansionsRemaining ?? 0);
          return {
            type,
            cost: gameState.config.rules.buildingCosts[type],
            availableResources: activePlayer?.resources ?? {},
            canBuild: availability?.canBuild === true,
            remaining,
            onBuild: () => buildFromBoardMenu(type),
          };
        });
  const setupBuildingType = getSetupBuildingType(gameState);
  const uncommittedKNPreview =
    knChoiceInteraction !== null && isUncommittedKNCardPreview(gameState, knChoiceInteraction);
  const recentActionBoostsTimer = recentGameEvents.some((event) =>
    TIMER_BOOST_EVENT_TYPES.has(event.type),
  );
  const activePlayerName = activePlayer?.name ?? 'A player';
  const knChoiceStatusPrompt =
    knChoiceInteraction === null
      ? null
      : activitySentence(
          gameState,
          knChoiceInteraction.simultaneous === true
            ? knChoiceInteraction.queue
            : [knChoiceInteraction.playerId],
          knSelectionActivityLabel(knChoiceInteraction.purpose),
        );
  const actionModePrompt =
    knightCommand === 'MOVE'
      ? `${activePlayerName} is moving a Knight`
      : knightCommand === 'UPGRADE'
        ? `${activePlayerName} is upgrading a Knight`
        : knightCommand === 'ACTIVATE'
          ? `${activePlayerName} is activating a Knight`
          : knBoardAction?.type === 'BUILD_KNIGHT'
            ? `${activePlayerName} is placing a Knight`
            : knBoardAction?.type === 'BUILD_WALL'
              ? `${activePlayerName} is building a Wall`
              : knBoardAction?.type === 'MOVE_KNIGHT'
                ? `${activePlayerName} is moving a Knight`
                : constructionType === 'ROAD'
                  ? `${activePlayerName} is placing a Road`
                  : constructionType === 'HOUSE'
                    ? `${activePlayerName} is placing a House`
                    : constructionType === 'MANSION'
                      ? `${activePlayerName} is upgrading a City`
                      : `${activePlayerName} is taking actions`;
  const timedPhase =
    gameState.turn.phase === 'SETUP_PLACE_HOUSE'
      ? {
          duration: 180,
          key: `setup-building-${gameState.turn.setupPlacementIndex ?? 0}`,
          prompt: `${activePlayerName} is placing a ${setupBuildingType === 'MANSION' ? 'City' : 'House'}`,
          actorId: gameState.turn.activePlayerId,
        }
      : gameState.turn.phase === 'SETUP_PLACE_ROAD'
        ? {
            duration: 60,
            key: `setup-road-${gameState.turn.setupPlacementIndex ?? 0}`,
            prompt: `${activePlayerName} is placing a Road`,
            actorId: gameState.turn.activePlayerId,
          }
        : gameState.turn.phase === 'DISCARD_RESOURCES' && firstDiscardPlayerId !== undefined
          ? {
              duration: 30,
              key: `discard-${gameState.turn.turnNumber}-simultaneous`,
              prompt: activitySentence(
                gameState,
                discardInteraction?.queue ?? [firstDiscardPlayerId],
                'Discarding cards',
              ),
              actorId: discardPlayerId ?? firstDiscardPlayerId,
            }
          : gameState.turn.phase === 'MOVE_ROBBER' || gameState.turn.phase === 'CHOOSE_STEAL_TARGET'
            ? {
                duration: 20,
                key: `robber-${gameState.turn.turnNumber}`,
                prompt:
                  gameState.turn.phase === 'MOVE_ROBBER'
                    ? `${activePlayerName} is moving the robber`
                    : `${activePlayerName} is choosing a player to rob`,
                actorId: gameState.turn.activePlayerId,
              }
            : gameState.turn.phase === 'WAITING_FOR_ROLL'
              ? {
                  duration: 10,
                  key: `roll-${gameState.turn.turnNumber}`,
                  prompt: `${activePlayerName} is rolling the dice`,
                  actorId: gameState.turn.activePlayerId,
                }
              : gameState.turn.phase === 'ACTION_PHASE'
                ? {
                    duration: recentActionBoostsTimer
                      ? 20
                      : (gameState.config.turnTimeSeconds ?? 60),
                    key: `actions-${gameState.turn.turnNumber}`,
                    prompt: actionModePrompt,
                    actorId: gameState.turn.activePlayerId,
                  }
                : gameState.turn.phase === 'CARD_RESOLUTION' && knChoiceInteraction !== null
                  ? uncommittedKNPreview
                    ? {
                        duration: gameState.config.turnTimeSeconds ?? 60,
                        key: `actions-${gameState.turn.turnNumber}`,
                        prompt: actionModePrompt,
                        actorId: gameState.turn.activePlayerId,
                      }
                    : {
                        duration: knChoiceInteraction.purpose === 'DEFENDER_TIE_DECK' ? 15 : 30,
                        key: `kn-choice-${gameState.actionSequence}-${knChoiceInteraction.purpose}-${knChoiceInteraction.playerId}`,
                        prompt: knChoiceStatusPrompt ?? `${activePlayerName} is resolving a card`,
                        actorId: knChoiceInteraction.playerId,
                      }
                  : null;
  const boardChoicePrompt =
    knBoardChoice?.purpose === 'METROPOLIS_CITY'
      ? 'Place Metropolis'
      : knBoardChoice?.purpose === 'MERCHANT_HEX'
        ? 'Place Merchant'
        : knBoardChoice?.purpose === 'BISHOP_HEX'
          ? 'Move Robber'
          : knBoardChoice?.purpose === 'SMITH_KNIGHT'
            ? 'Upgrade Knight'
            : null;
  let lastTimerBoostSequence = -1;
  for (let index = gameState.actionHistory.length - 1; index >= 0; index -= 1) {
    const entry = gameState.actionHistory[index];
    if (
      entry?.eventTypes.some((eventType) =>
        TIMER_BOOST_EVENT_TYPES.has(eventType as GameEvent['type']),
      )
    ) {
      lastTimerBoostSequence = entry.sequence;
      break;
    }
  }
  const timerBoostSignal = `${lastTimerBoostSequence}`;
  const timerKey = `${gameState.config.gameId}:${timedPhase?.actorId ?? 'none'}:${timedPhase?.key ?? 'paused'}`;
  const activePlayerColor =
    activePlayer === undefined ? '#d9bc72' : (playerColors[activePlayer.id] ?? '#d9bc72');

  return (
    <main
      className={`game-screen ${gameState.kn === null ? '' : 'game-screen--kn'} ${settings.reducedMotion ? 'game-screen--reduced-motion' : ''} ${settings.animationSpeed === 'FAST' ? 'game-screen--fast-motion' : ''}`}
      style={{ '--active-player-color': activePlayerColor } as CSSProperties}
    >
      <span className="visually-hidden" aria-live="polite">
        {accessiblePhaseLabel(gameState.turn.phase)}
      </span>
      {longestRoadNotice === null ? null : (
        <aside
          className="longest-road-notice"
          role="status"
          style={{ '--longest-road-player-color': longestRoadNotice.color } as CSSProperties}
        >
          <span className="longest-road-notice__road" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <small>New achievement</small>
            <strong>Longest Road</strong>
            <b>{longestRoadNotice.playerName} takes the route</b>
          </div>
        </aside>
      )}
      <nav className="game-utility-nav" aria-label="Match controls">
        <div className="territory-mark" title="Territory" aria-label="Territory">
          <span aria-hidden="true">T</span>
        </div>
        <Button
          className="game-utility-button icon-button"
          variant="ghost"
          aria-label="Settings"
          title="Settings"
          onClick={openSettings}
        >
          <span aria-hidden="true">⚙</span>
        </Button>
        <Button
          className="game-utility-button icon-button game-utility-button--pause"
          variant="ghost"
          aria-label="Pause match"
          title={`${partyLeaderName} can pause the match`}
          disabled={isOnlineMatch && !onlineViewerIsHost}
          onClick={() => {
            if (isOnlineMatch) void pauseOnlineMatch();
            else pauseGame();
          }}
        >
          <span aria-hidden="true">Ⅱ</span>
        </Button>
        <Button
          className="game-utility-button icon-button"
          variant="ghost"
          aria-label="Lobby"
          title={
            isOnlineMatch && !onlineViewerIsHost && gameState.turn.phase !== 'GAME_OVER'
              ? `${partyLeaderName} can return the active match to the lobby`
              : 'Return to lobby'
          }
          disabled={
            onlineCommandPending ||
            (isOnlineMatch && !onlineViewerIsHost && gameState.turn.phase !== 'GAME_OVER')
          }
          onClick={() => setLeaveDestination('/lobby')}
        >
          <span aria-hidden="true">⌂</span>
        </Button>
        {developerControlsVisible ? (
          <>
            <Button
              className="game-utility-button game-utility-button--admin"
              variant="ghost"
              aria-label={
                adminMode
                  ? 'Disable admin mode'
                  : 'Enable developer mode with 99 goods, every Progress Card, and no robber'
              }
              aria-pressed={adminMode}
              title={
                adminMode
                  ? 'Disable developer mode and restore robber rolls'
                  : 'Grant 99 of every good, one of every Progress Card, and ignore robber rolls'
              }
              disabled={onlineCommandPending || (!adminMode && activePlayer === undefined)}
              onClick={toggleAdminResources}
            >
              <span className="game-utility-admin-mark" aria-hidden="true">
                <small>Admin</small>
                <strong>{adminMode ? 'ON' : '99'}</strong>
              </span>
            </Button>
            <Button
              className="game-utility-button game-utility-button--progress-dev"
              variant="ghost"
              aria-label={
                isOnlineMatch
                  ? 'Give yourself one of every Progress Card'
                  : 'Give the active player one of every Progress Card'
              }
              title="Developer grant: add one fresh copy of every Progress Card"
              disabled={onlineCommandPending || viewerPlayer === undefined}
              onClick={grantDeveloperProgressCards}
            >
              <span className="game-utility-admin-mark" aria-hidden="true">
                <small>Cards</small>
                <strong>+All</strong>
              </span>
            </Button>
            <label className="game-utility-toggle" title="Debug IDs">
              <input
                className="visually-hidden"
                type="checkbox"
                checked={showDebug}
                onChange={(event) => setShowDebug(event.target.checked)}
              />
              <span aria-hidden="true">#</span>
              <span className="visually-hidden">Debug IDs</span>
            </label>
          </>
        ) : null}
        <Button
          className="game-utility-button icon-button game-utility-button--danger"
          variant="ghost"
          aria-label="Leave match"
          title="Leave match"
          onClick={() => setLeaveDestination('/')}
        >
          <span aria-hidden="true">×</span>
        </Button>
      </nav>

      <div className="game-table">
        <section className="game-board-stage">
          <BoardViewport
            board={gameState.board}
            players={gameState.players}
            knState={gameState.kn}
            showDebugIds={showDebug}
            selectableTargets={selectableTargets}
            highlightedHexIds={highlightedHexIds}
            emphasizedEdgeIds={inspectedRoadChain?.edgeIds ?? []}
            emphasizedVertexIds={emphasizedVertexIds}
            inventorSelectionActive={inventorSelectionActive}
            inventorSelectedHexId={inventorSelectedHexId}
            inventorPendingHexId={inventorPendingHexId ?? reclamationSelectedHexId}
            numberTokenSwap={numberTokenSwap}
            numberTokenSwapKey={activeNumberTokenSwapKey}
            madnessHighlightedHexIds={gameState.inventorsMadness?.pendingHexIds ?? []}
            terrainChange={terrainChange}
            merchantPlacementActive={knBoardChoice?.purpose === 'MERCHANT_HEX'}
            animatedTarget={animatedTarget}
            robberMove={robberMove}
            playerColors={playerColors}
            reducedMotion={settings.reducedMotion}
            graphicsQuality={settings.graphicsQuality}
            frameRateLimit={settings.frameRateLimit}
            gameElementSize={settings.gameElementSize}
            showTargetPulses={
              settings.graphicsQuality !== 'PERFORMANCE' &&
              (gameState.turn.phase !== 'ACTION_PHASE' ||
                constructionType !== null ||
                knBoardAction !== null ||
                knightCommand !== null)
            }
            showRobberAttention={
              gameState.turn.phase === 'MOVE_ROBBER' || knBoardChoice?.purpose === 'BISHOP_HEX'
            }
            resourceFlyovers={resourceFlyovers}
            progressCardFlyovers={progressCardFlyovers}
            showKeyboardTargetControls={
              setupProgress === null &&
              gameState.turn.phase !== 'MOVE_ROBBER' &&
              (gameState.turn.phase !== 'ACTION_PHASE' ||
                constructionType !== null ||
                knBoardAction !== null ||
                knightCommand !== null)
            }
            onReady={() => setBoardReady(true)}
            onInspect={(target, position) => {
              setInspectedTarget(target);
              setRoadChainPeekPosition(target?.kind === 'EDGE' ? (position ?? null) : null);
            }}
            onSelect={selectBoardTarget}
          />
          {inspectedRoadChain === null ? null : (
            <aside
              className="road-chain-peek"
              role="status"
              aria-label={`${inspectedRoadChain.ownerName}’s road chain has ${inspectedRoadChain.edgeIds.length} road${inspectedRoadChain.edgeIds.length === 1 ? '' : 's'}`}
              style={
                {
                  '--road-chain-color': inspectedRoadChain.color,
                  '--road-chain-x': `${roadChainPeekPosition?.x ?? 24}px`,
                  '--road-chain-y': `${roadChainPeekPosition?.y ?? 72}px`,
                } as CSSProperties
              }
            >
              <span className="road-chain-peek__route" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>
                <small>{inspectedRoadChain.ownerName}</small>
                <strong>Road chain</strong>
              </span>
              <b>
                {inspectedRoadChain.edgeIds.length}
                <small>{inspectedRoadChain.edgeIds.length === 1 ? 'road' : 'roads'}</small>
              </b>
            </aside>
          )}
          <BarbarianTracker
            state={gameState}
            selectablePositions={knTrackChoice?.eligibleIds.map(Number) ?? []}
            selectedPosition={warDrumsPosition}
            onSelectPosition={(position) => {
              setWarDrumsPosition(position);
              setActionError(null);
            }}
          />
          {knTrackChoice === null || warDrumsPosition === null ? null : (
            <aside className="war-drums-confirm" role="dialog" aria-label="Confirm War Drums">
              <strong>Move fleet to {warDrumsPosition}?</strong>
              <small>
                {warDrumsPosition >= (gameState.kn?.barbarianTrackLength ?? 7)
                  ? 'This triggers the barbarian attack immediately.'
                  : 'The fleet will remain at this position.'}
              </small>
              <div>
                <Button variant="ghost" onClick={() => setWarDrumsPosition(null)}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  onClick={() => resolveKNChoice([String(warDrumsPosition)])}
                >
                  Confirm
                </Button>
              </div>
            </aside>
          )}
          {responseTrade === undefined || responseProposer === undefined ? null : (
            <TradeResponsePanel
              key={`${responseTrade.id}:${responseTrade.revision}`}
              state={gameState}
              trade={responseTrade}
              proposer={responseProposer}
              recipients={responseRecipients}
              playerColors={playerColors}
              paused={gamePaused}
              viewerPlayerId={onlineViewerPlayerId}
              deadlineAt={isOnlineMatch ? onlineRoom?.game?.tradeDeadlineAt : null}
              clockOffsetMs={onlineClockOffsetMs}
              serverAuthoritative={isOnlineMatch}
              errorMessage={actionError}
              onRespond={respondToPlayerTrade}
              onConfirm={confirmPlayerTrade}
              onEdit={() =>
                prepareTradeModal(responseTrade.offered, responseTrade.requested, responseTrade.id)
              }
              onCancel={() => closePlayerTradeOffer(false)}
              onExpire={() => {
                if (!isOnlineMatch) closePlayerTradeOffer(true);
              }}
              includeCommodities={gameState.kn !== null}
            />
          )}
          <p
            className={`board-inspector ${actionError === null ? '' : 'board-inspector--error'}`}
            aria-live="polite"
          >
            {actionError ??
              (interactionInstruction === null
                ? inspectedTarget === null
                  ? (turnFeedback ?? inspection)
                  : inspection
                : `${turnFeedback === null ? '' : `${turnFeedback} `}${interactionInstruction}`)}
          </p>

          {!import.meta.env.DEV || !showDebug ? null : (
            <section className="developer-panel developer-panel--floating">
              <h3>Developer state</h3>
              <dl>
                <div>
                  <dt>Seed</dt>
                  <dd>{gameState.config.seed}</dd>
                </div>
                <div>
                  <dt>Topology</dt>
                  <dd>
                    {Object.keys(gameState.board.hexes).length}H ·{' '}
                    {Object.keys(gameState.board.vertices).length}V ·{' '}
                    {Object.keys(gameState.board.edges).length}E
                  </dd>
                </div>
                <div>
                  <dt>RNG draws</dt>
                  <dd>{gameState.random.draws}</dd>
                </div>
                <div>
                  <dt>Deck</dt>
                  <dd>
                    {gameState.progressDeck.length}/
                    {PROGRESS_CARDS.reduce((total, card) => total + card.count, 0)}
                  </dd>
                </div>
                <div>
                  <dt>Actions</dt>
                  <dd>
                    {gameState.actionSequence} ·{' '}
                    {gameState.actionHistory.at(-1)?.actionType ?? 'none'}
                  </dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{inspectedTarget?.id ?? 'none'}</dd>
                </div>
              </dl>
              <Button variant="ghost" fullWidth onClick={copyDeveloperState}>
                Copy game state
              </Button>
            </section>
          )}
        </section>

        <aside
          className={`game-rail ${gameState.kn === null ? '' : 'game-rail--kn'}`}
          aria-label="Players and match state"
        >
          <ActivityLog events={gameEventHistory} state={gameState} />
          <BankPanel
            bank={gameState.bank}
            commodityBank={gameState.commodityBank}
            progressCardsRemaining={gameState.progressDeck.length}
            knState={gameState.kn}
            hideCounts={gameState.config.hideBankCards === true}
          />
          <section
            className={`players-panel ${gameState.kn === null ? '' : 'players-panel--kn'}`}
            aria-labelledby="players-title"
          >
            <header className="rail-section-heading">
              <div>
                <span className="eyebrow">Turn order</span>
                <h2 id="players-title">Players</h2>
              </div>
              <div className="rail-heading-badges">
                <span
                  className="victory-goal"
                  title={`${gameState.config.victoryTarget} victory points to win`}
                >
                  <small>Goal</small>
                  <strong>{gameState.config.victoryTarget}</strong>
                  <b>VP</b>
                </span>
                <span className="player-count">{orderedPlayerConfigs.length}</span>
              </div>
            </header>
            <div
              className={`game-player-list ${gameState.kn === null ? '' : 'game-player-list--kn'}`}
            >
              {orderedPlayerConfigs.map((config, index) => {
                const player = gameState.players[config.id];
                const onlinePresence = onlineRoom?.players.find(
                  (candidate) => candidate.id === config.id,
                );
                return player === undefined ? null : (
                  <PlayerPanel
                    key={player.id}
                    player={player}
                    position={index + 1}
                    active={gameState.turn.activePlayerId === player.id}
                    score={
                      isOnlineMatch
                        ? calculatePublicScore(gameState, player.id)
                        : calculateScore(gameState, player.id)
                    }
                    longestRoadLength={calculateLongestRoadLength(gameState, player.id)}
                    robberCount={player.playedForceCards}
                    holdsLongestRoad={gameState.bonuses.longestRoadHolderId === player.id}
                    holdsLargestForce={gameState.bonuses.largestForceHolderId === player.id}
                    winner={gameState.winnerId === player.id}
                    activityLabel={playerActivities[player.id] ?? null}
                    disconnectDeadlineAt={
                      onlinePresence?.connected === false
                        ? (onlinePresence.disconnectDeadlineAt ?? null)
                        : null
                    }
                    clockOffsetMs={onlineClockOffsetMs}
                    disconnectCountdownPaused={gamePaused}
                    kNMode={gameState.kn !== null}
                    knProgressCards={gameState.kn?.progressCards}
                    {...(onlineRoom?.game?.playerCards[player.id] === undefined
                      ? {}
                      : { publicCardInfo: onlineRoom.game.playerCards[player.id] })}
                    cityCount={
                      Object.values(gameState.board.vertices).filter(
                        (vertex) =>
                          vertex.building?.ownerId === player.id &&
                          vertex.building.type === 'MANSION',
                      ).length
                    }
                    wallCount={
                      Object.values(gameState.board.vertices).filter(
                        (vertex) =>
                          vertex.building?.ownerId === player.id &&
                          vertex.building.hasWall === true,
                      ).length
                    }
                    discardThreshold={gameState.config.rules.discardThreshold}
                  />
                );
              })}
            </div>
          </section>
        </aside>

        <footer className="game-dock" aria-label="Active player resource hand">
          {!tradeModalOpen || !canComposeTrade || activePlayer === undefined ? null : (
            <TradeModal
              player={activePlayer}
              opponents={tradeOpponents}
              bank={combinedBank(gameState.bank, gameState.commodityBank)}
              hideBankCounts={gameState.config.hideBankCards === true}
              bankRatios={bankTradeRatios}
              maximumRequestAmount={gameState.config.rules.bankCardsPerResource}
              offered={tradeOffered}
              requested={tradeRequested}
              editingPlayerTrade={editingTradeId !== null}
              errorMessage={actionError}
              onClose={() => {
                setTradeModalTurnKey(null);
                setTradeOffered(resourceBundle([]));
                setTradeRequested(resourceBundle([]));
                setEditingTradeId(null);
                setActionError(null);
              }}
              onBankTrade={completeBankTrade}
              onAddRequested={(resourceId) => adjustTradeSelection('REQUESTED', resourceId, 1)}
              onRemoveRequested={(resourceId) => adjustTradeSelection('REQUESTED', resourceId, -1)}
              onRemoveOffered={(resourceId) => adjustTradeSelection('OFFERED', resourceId, -1)}
              onCreateTrade={createPlayerTrade}
              includeCommodities={gameState.kn !== null}
            />
          )}
          {controlledDiscardPlayer === undefined || requiredDiscardCount === undefined ? null : (
            <DiscardModal
              player={controlledDiscardPlayer}
              requiredCount={requiredDiscardCount}
              selectedResources={selectedDiscardResources}
              errorMessage={actionError}
              onRemoveResource={returnResourceFromDiscard}
              onConfirm={confirmDiscard}
              includeCommodities={gameState.kn !== null}
            />
          )}
          {knTrayChoice === null ? null : (
            <KNChoiceTray
              key={`${knTrayChoice.purpose}-${knTrayChoice.playerId}-${knTrayChoice.sourceCardId ?? 'roll'}-${knTraySelectedHexId}-${knTrayChoice.eligibleIds.join('.')}`}
              state={gameState}
              interaction={knTrayChoice}
              {...(onlineRoom?.game?.playerCards === undefined
                ? {}
                : {
                    publicCommodityCounts: Object.fromEntries(
                      Object.entries(onlineRoom.game.playerCards).map(([playerId, cards]) => [
                        playerId,
                        cards.commodityCards,
                      ]),
                    ),
                  })}
              errorMessage={actionError}
              {...(knDirectHandChoice === null
                ? {}
                : {
                    selections: selectedKNHandIds,
                    onSelectionsChange: updateKNHandSelections,
                  })}
              onResolve={resolveKNChoice}
            />
          )}
          <HandTray
            state={gameState}
            player={
              isOnlineMatch
                ? viewerPlayer
                : (discardPlayer ??
                  (knDirectHandChoice !== null
                    ? gameState.players[knDirectHandChoice.playerId]
                    : knChoiceInteraction?.purpose === 'AQUEDUCT_RESOURCE'
                      ? gameState.players[knChoiceInteraction.playerId]
                      : activePlayer))
            }
            animateResources={animateResourceHand}
            ignoreUnsafeHandLimit={adminMode}
            tooltipResetSignal={progressTooltipResetSignal}
            discardSelection={selectedDiscardResources}
            {...(controlledDiscardPlayer === undefined
              ? {}
              : { onSelectResourceForDiscard: selectResourceForDiscard })}
            {...(canComposeTrade &&
            tradeOpponents.length > 0 &&
            discardPlayer === undefined &&
            knDirectHandChoice === null
              ? {
                  selectedHandResources: tradeModalOpen ? tradeOffered : resourceBundle([]),
                  handResourceSelectionName: !tradeModalOpen
                    ? canEditResponseTrade
                      ? 'to edit your trade offer'
                      : 'to start a trade'
                    : 'for your trade offer',
                  onSelectHandResource: selectResourceForTrade,
                  resourceSelectionStartsPlayerTrade: !tradeModalOpen && !canEditResponseTrade,
                }
              : {})}
            {...(knDirectHandChoice === null || knDirectHandChoice.purpose === 'PROGRESS_DISCARD'
              ? {}
              : {
                  selectedHandResources: selectedKNHandResources,
                  handResourceSelectionName:
                    knDirectHandChoice.purpose === 'COMMERCIAL_HARBOR_RESOURCE'
                      ? 'for Commercial Harbor'
                      : knDirectHandChoice.purpose === 'SABOTEUR_DISCARD'
                        ? 'for Saboteur'
                        : 'for Wedding',
                  onSelectHandResource: selectKNHandResource,
                  warningResourceId: handSelectionWarning?.resourceId ?? null,
                  warningSignal: handSelectionWarning?.signal ?? 0,
                })}
            {...(knDirectHandChoice?.purpose === 'PROGRESS_DISCARD'
              ? {
                  selectedKNProgressCardIds,
                  onSelectKNProgressCard: selectKNProgressCardForReturn,
                }
              : {})}
            progressCardPlayIntentId={inlineProgressCardIntentId}
            knProgressCardPlayIntentId={knProgressCardIntentId}
            progressCardPlayErrorMessage={actionError}
            onCancelProgressCardPlay={() => {
              setProgressCardIntentId(null);
              setActionError(null);
            }}
            onConfirmProgressCardPlay={confirmProgressCardPlay}
            onCancelKNProgressCardPlay={() => {
              setKNProgressCardIntentId(null);
              setActionError(null);
            }}
            onConfirmKNProgressCardPlay={confirmKNProgressCardPlay}
            onPlayProgressCard={playProgressCard}
            onPlayKNProgressCard={playKNProgressCard}
          />

          <section className="turn-action-dock" aria-label="Turn controls">
            {gameState.kn === null || activePlayer === undefined ? null : (
              <KNActionPanel
                key={activePlayer.id}
                state={gameState}
                player={activePlayer}
                disabled={!canUseTurnActions}
                buildingKnight={knBoardAction?.type === 'BUILD_KNIGHT'}
                knightCommand={knightCommand}
                eligibleKnightCounts={{
                  ACTIVATE: eligibleKnightIds.ACTIVATE.length,
                  UPGRADE: eligibleKnightIds.UPGRADE.length,
                  MOVE: eligibleKnightIds.MOVE.length,
                }}
                errorMessage={actionError}
                onBuildKnight={() => beginKNBoardAction('BUILD_KNIGHT')}
                onSelectKnightCommand={toggleKnightCommand}
                onCancelKnightMode={cancelKnightMode}
                onBuyImprovement={(track) => dispatchKNAction({ type: 'BUY_IMPROVEMENT', track })}
              />
            )}
            <DicePanel
              phase={gameState.turn.phase}
              dice={gameState.turn.dice}
              knDice={gameState.turn.knDice}
              kNMode={gameState.kn !== null}
              disabled={
                onlineActionPending ||
                (isOnlineMatch && gameState.turn.activePlayerId !== onlineViewerPlayerId)
              }
              onRoll={rollDice}
            />

            <div className="turn-banner">
              <div className="turn-banner__player">
                <span aria-hidden="true" />
                <div>
                  <strong>{activePlayer?.name ?? 'Preparing match'}’s turn</strong>
                  <small>
                    {setupProgress === null
                      ? `Turn ${gameState.turn.turnNumber + 1}`
                      : `Placement ${setupProgress.placementNumber}/${setupProgress.totalPlacements} · ${setupProgress.round === 'FORWARD' ? 'Forward' : 'Reverse'}`}
                  </small>
                </div>
              </div>
              {timedPhase === null || timedPhase.actorId === null ? (
                boardChoicePrompt === null ? null : (
                  <div className="turn-timer-wrap turn-timer-wrap--prompt-only" aria-live="polite">
                    <strong className="turn-timer-prompt">{boardChoicePrompt}</strong>
                  </div>
                )
              ) : (
                <TurnTimer
                  key={timerKey}
                  durationSeconds={timedPhase.duration}
                  prompt={timedPhase.prompt}
                  boostSignal={timerBoostSignal}
                  paused={gamePaused}
                  deadlineAt={isOnlineMatch ? onlineRoom.game?.deadlineAt : null}
                  clockOffsetMs={onlineClockOffsetMs}
                  onUrgentTick={() => {
                    const silentPhase =
                      gameState.turn.phase === 'WAITING_FOR_ROLL' ||
                      gameState.turn.phase === 'MOVE_ROBBER' ||
                      gameState.turn.phase === 'CHOOSE_STEAL_TARGET';
                    const viewerOwnsTimer =
                      !isOnlineMatch || timedPhase.actorId === onlineViewerPlayerId;
                    if (settings.timerSounds && !silentPhase && viewerOwnsTimer) {
                      audioManager.playTimerTick(settings.masterVolume, settings.sfxVolume);
                    }
                  }}
                  onExpire={() => {
                    if (isOnlineMatch) return;
                    const actorId = timedPhase.actorId;
                    if (actorId === null) return;
                    const result = dispatchGameAction({
                      id: actionId(`timeout-${globalThis.crypto.randomUUID()}`),
                      type: 'AUTO_TIMEOUT',
                      actorId,
                    });
                    if (result !== null && !result.ok) setActionError(result.error.message);
                  }}
                />
              )}
            </div>

            <nav className="game-action-bar" aria-label="Turn actions">
              <Button
                className="game-action-button"
                variant="ghost"
                aria-label="Trade"
                disabled={!canComposeTrade}
                title={
                  canEditResponseTrade
                    ? 'Edit your open trade offer'
                    : canUseTurnActions
                      ? 'Trade with the bank or another player'
                      : 'Trade during your action phase'
                }
                aria-pressed={tradeModalOpen}
                onClick={toggleTradeModal}
              >
                <TradeActionIcon />
                <strong>Trade</strong>
                <small>Bank or player</small>
              </Button>
              {gameState.kn === null ? (
                <Button
                  className="game-action-button"
                  variant="ghost"
                  aria-label="Buy Progress card"
                  disabled={progressPurchase?.canBuy !== true}
                  title={progressPurchase?.reason ?? 'Draw the top progress card'}
                  onClick={buyProgressCard}
                >
                  <ActionSupplyBadge
                    count={gameState.progressDeck.length}
                    label="Progress cards remaining"
                  />
                  <ProgressActionIcon />
                  <strong>Buy Progress Card</strong>
                  <small>Draw from deck</small>
                  <PurchaseCostPreview
                    resources={gameState.config.rules.progressCardCost}
                    availableResources={activePlayer?.resources}
                  />
                </Button>
              ) : (
                <Button
                  className="game-action-button game-action-button--wall"
                  variant={knBoardAction?.type === 'BUILD_WALL' ? 'primary' : 'ghost'}
                  aria-label="Buy City Wall"
                  aria-pressed={knBoardAction?.type === 'BUILD_WALL'}
                  disabled={
                    !canUseTurnActions ||
                    (knBoardAction?.type !== 'BUILD_WALL' &&
                      ((activePlayer?.resources[RESOURCE_IDS.brick] ?? 0) < 2 ||
                        (activePlayer?.cityWallsRemaining ?? 0) < 1 ||
                        wallPlacementCount === 0))
                  }
                  title="Build a City Wall for two Brick"
                  onClick={() =>
                    knBoardAction?.type === 'BUILD_WALL'
                      ? setKNBoardAction(null)
                      : beginKNBoardAction('BUILD_WALL')
                  }
                >
                  <ActionSupplyBadge
                    count={activePlayer?.cityWallsRemaining ?? 0}
                    label="City Walls remaining"
                  />
                  <WallActionIcon />
                  <strong>Buy Wall</strong>
                  <small>Fortify a City</small>
                  <PurchaseCostPreview
                    resources={WALL_COST}
                    availableResources={activePlayer?.resources}
                  />
                </Button>
              )}
              <Button
                className="game-action-button"
                variant={constructionType === 'ROAD' ? 'primary' : 'ghost'}
                aria-label="Buy Road"
                aria-pressed={constructionType === 'ROAD'}
                disabled={roadAvailability?.canBuild !== true && constructionType !== 'ROAD'}
                title={
                  roadAvailability?.reason ??
                  `${roadAvailability?.targetCount ?? 0} legal placements`
                }
                onClick={() => chooseConstruction('ROAD')}
              >
                <ActionSupplyBadge
                  count={activePlayer?.roadsRemaining ?? 0}
                  label="Roads remaining"
                />
                <RoadActionIcon />
                <strong>Buy Road</strong>
                <small>Build a connection</small>
                <PurchaseCostPreview
                  resources={gameState.config.rules.buildingCosts.ROAD}
                  availableResources={activePlayer?.resources}
                />
              </Button>
              <Button
                className="game-action-button"
                variant={constructionType === 'HOUSE' ? 'primary' : 'ghost'}
                aria-label="Buy House"
                aria-pressed={constructionType === 'HOUSE'}
                disabled={houseAvailability?.canBuild !== true && constructionType !== 'HOUSE'}
                title={
                  houseAvailability?.reason ??
                  `${houseAvailability?.targetCount ?? 0} legal placements`
                }
                onClick={() => chooseConstruction('HOUSE')}
              >
                <ActionSupplyBadge
                  count={activePlayer?.housesRemaining ?? 0}
                  label="Houses remaining"
                />
                <HouseActionIcon />
                <strong>Buy House</strong>
                <small>Settle a corner</small>
                <PurchaseCostPreview
                  resources={gameState.config.rules.buildingCosts.HOUSE}
                  availableResources={activePlayer?.resources}
                />
              </Button>
              <Button
                className="game-action-button"
                variant={constructionType === 'MANSION' ? 'primary' : 'ghost'}
                aria-label="Buy City"
                aria-pressed={constructionType === 'MANSION'}
                disabled={mansionAvailability?.canBuild !== true && constructionType !== 'MANSION'}
                title={
                  mansionAvailability?.reason ??
                  `${mansionAvailability?.targetCount ?? 0} legal placements`
                }
                onClick={() => chooseConstruction('MANSION')}
              >
                <ActionSupplyBadge
                  count={activePlayer?.mansionsRemaining ?? 0}
                  label="Cities remaining"
                />
                <CityActionIcon />
                <strong>Buy City</strong>
                <small>Upgrade a house</small>
                <PurchaseCostPreview
                  resources={gameState.config.rules.buildingCosts.MANSION}
                  availableResources={activePlayer?.resources}
                />
              </Button>
              <Button
                className="game-action-button game-action-button--end"
                variant="primary"
                aria-label="End Turn"
                disabled={!canUseTurnActions}
                title="Finish this turn"
                onClick={endTurn}
              >
                <EndTurnActionIcon />
                <strong>End Turn</strong>
                <small>Next player</small>
              </Button>
            </nav>
          </section>
        </footer>
      </div>

      {boardBuildMenu === null ? null : (
        <BoardBuildPopover
          position={boardBuildMenu.position}
          choices={boardBuildChoices}
          onClose={() => {
            setBoardBuildMenu(null);
            setActionError(null);
          }}
        />
      )}

      {knightBoardMenu === null ||
      knightBoardMenuKnight === undefined ||
      activePlayer === undefined ? null : (
        <KnightBoardPopover
          position={knightBoardMenu.position}
          knight={knightBoardMenuKnight}
          playerColor={playerColors[activePlayer.id] ?? '#f6f0dc'}
          availableResources={activePlayer.resources}
          canActivate={knightActivationReason(activePlayer, knightBoardMenuKnight) === null}
          activateReason={knightBoardActivateReason}
          canUpgrade={knightUpgradeReason(gameState, activePlayer, knightBoardMenuKnight) === null}
          upgradeReason={knightBoardUpgradeReason}
          canMove={knightMovementReason(gameState, activePlayer, knightBoardMenuKnight) === null}
          moveReason={knightBoardMoveReason}
          onActivate={() =>
            dispatchKNAction({ type: 'ACTIVATE_KNIGHT', knightId: knightBoardMenuKnight.id })
          }
          onUpgrade={() =>
            dispatchKNAction({ type: 'UPGRADE_KNIGHT', knightId: knightBoardMenuKnight.id })
          }
          onMove={() => beginKNBoardAction('MOVE_KNIGHT', knightBoardMenuKnight.id)}
          onClose={() => {
            setKnightBoardMenu(null);
            setActionError(null);
          }}
        />
      )}

      {stealInteraction === null ||
      activePlayer === undefined ||
      (isOnlineMatch && stealInteraction.playerId !== onlineViewerPlayerId) ? null : (
        <StealTargetModal
          playerName={activePlayer.name}
          targets={stealTargets}
          errorMessage={actionError}
          onChoose={chooseStealTarget}
        />
      )}
      {progressCardModalId === null ||
      activePlayer === undefined ||
      (isOnlineMatch && activePlayer.id !== onlineViewerPlayerId) ? null : (
        <ProgressCardChoiceModal
          key={progressCardModalId}
          state={gameState}
          player={activePlayer}
          cardInstanceId={progressCardModalId}
          errorMessage={actionError}
          canCancel={canCancelProgressCard}
          onCancel={() => {
            setProgressCardIntentId(null);
            setActionError(null);
          }}
          onConfirmPlay={confirmProgressCardPlay}
          onChooseResources={chooseCardResources}
          onChooseResourceType={chooseCardResourceType}
        />
      )}
      {knChoiceInteraction === null ||
      (isOnlineMatch && knChoiceInteraction.playerId !== onlineViewerPlayerId) ||
      knBoardChoice !== null ||
      knTrayChoice !== null ||
      knTrackChoice !== null ? null : (
        <KNInteractionModal
          key={`${knChoiceInteraction.purpose}-${knChoiceInteraction.playerId}`}
          state={gameState}
          interaction={knChoiceInteraction}
          errorMessage={actionError}
          onResolve={resolveKNChoice}
        />
      )}
      {knBoardChoice === null ||
      [
        'MEDICINE_CITY',
        'SMITH_KNIGHT',
        'INVENTOR_FIRST_TOKEN',
        'INVENTOR_SECOND_TOKEN',
        'RECLAMATION_HEX',
        'RECLAMATION_RESOURCE',
        'DESERTER_KNIGHT',
        'BARBARIAN_CITY_LOSS',
      ].includes(knBoardChoice.purpose) ? null : (
        <aside className="kn-board-choice-banner" aria-live="polite">
          <div>
            <strong>{phaseLabel(gameState.turn.phase)}</strong>
            <span>Choose one of the glowing board locations.</span>
          </div>
          {!knBoardChoice.canCancel ? null : (
            <Button variant="ghost" onClick={() => resolveKNChoice([], true)}>
              Cancel card
            </Button>
          )}
        </aside>
      )}
      {knBoardChoice?.purpose !== 'INVENTOR_SECOND_TOKEN' ? null : (
        <aside
          className="kn-board-choice-banner kn-board-choice-banner--confirm"
          aria-live="polite"
        >
          <div>
            <strong>Confirm number swap</strong>
            <span>
              {inventorSelectedHexId !== null && inventorPendingHexId !== null
                ? 'Both tokens are highlighted. Click either one to replace that choice.'
                : 'Choose a glowing number token to replace the cleared choice.'}
            </span>
          </div>
          <Button
            variant="primary"
            disabled={inventorSelectedHexId === null || inventorPendingHexId === null}
            onClick={() => {
              if (inventorSelectedHexId !== null && inventorPendingHexId !== null) {
                resolveKNChoice([inventorSelectedHexId, inventorPendingHexId]);
              }
            }}
          >
            Confirm number swap
          </Button>
        </aside>
      )}
      {!gamePaused ? null : (
        <section
          className="game-pause-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-paused-title"
        >
          <div className="game-pause-card">
            <span aria-hidden="true">Ⅱ</span>
            <small>Match paused</small>
            <h2 id="game-paused-title">The table is on hold</h2>
            <p>The board and all timers are frozen. Only the party leader may continue.</p>
            {!isOnlineMatch || onlineViewerIsHost ? (
              <Button
                variant="primary"
                onClick={() => {
                  if (isOnlineMatch) void unpauseOnlineMatch();
                  else unpauseGame();
                }}
              >
                Unpause match
              </Button>
            ) : (
              <span className="online-waiting-host">Waiting for the host to continue…</span>
            )}
            <strong>{partyLeaderName}</strong>
          </div>
        </section>
      )}
      {gameState.turn.phase !== 'GAME_OVER' || gameState.winnerId === null ? null : (
        <VictoryModal
          state={gameState}
          rematchError={rematchError}
          onRematch={startRematch}
          onLobby={() => leaveGame('/lobby')}
          onMenu={() => leaveGame('/')}
        />
      )}
      <Modal
        open={leaveDestination !== null}
        title={leaveDestination === '/lobby' ? 'Return to lobby?' : 'Leave this match?'}
        description={
          isOnlineMatch && leaveDestination === '/lobby'
            ? 'The room and every player seat will stay together in the online lobby.'
            : isOnlineMatch
              ? 'You will leave your online seat and return to the menu.'
              : 'The current match is not saved and cannot be resumed.'
        }
        onClose={() => setLeaveDestination(null)}
      >
        <p>
          {isOnlineMatch && leaveDestination === '/lobby'
            ? gameState.turn.phase === 'GAME_OVER'
              ? 'Return everyone to the room to adjust settings or start another match.'
              : 'The current match will end for everyone and the party leader will keep control of the room.'
            : isOnlineMatch
              ? 'A disconnected seat remains on the board, but this browser will forget its private reconnect token.'
              : 'Your lobby players and settings remain available if you return to the lobby.'}
        </p>
        <footer className="modal__actions">
          <Button data-modal-autofocus variant="ghost" onClick={() => setLeaveDestination(null)}>
            Continue match
          </Button>
          <Button
            variant={leaveDestination === '/lobby' ? 'primary' : 'danger'}
            onClick={() => {
              if (leaveDestination !== null) leaveGame(leaveDestination);
              setLeaveDestination(null);
            }}
          >
            {leaveDestination === '/lobby' ? 'Return to lobby' : 'Leave match'}
          </Button>
        </footer>
      </Modal>
    </main>
  );
}
