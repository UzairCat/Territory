import { HAND_GOODS } from '../content/commodities';
import { getKNProgressCardDefinition } from '../content/kn-progress-cards';
import type { KNProgressFamily, ResourceBundle } from '../content/types';
import type { GameEvent } from './events';
import type { GameState, PlayerState } from './game-state';
import type { PlayerId, ResourceId } from './ids';

export type ProgressStatisticFamily = 'CLASSIC' | KNProgressFamily;

export interface ProgressFamilyStatistics {
  readonly CLASSIC: number;
  readonly SCIENCE: number;
  readonly TRADE: number;
  readonly POLITICS: number;
}

export interface PlayerMatchStatistics {
  readonly diceRolls: number;
  readonly dicePips: number;
  readonly doublesRolled: number;
  readonly sevensRolled: number;
  readonly produced: ResourceBundle;
  readonly gained: ResourceBundle;
  readonly spent: ResourceBundle;
  readonly discarded: ResourceBundle;
  readonly tradedIn: ResourceBundle;
  readonly tradedOut: ResourceBundle;
  readonly stolen: ResourceBundle;
  readonly stolenFrom: ResourceBundle;
  readonly lost: ResourceBundle;
  readonly progressCardsDrawn: number;
  readonly progressCardsPlayed: number;
  readonly progressCardsDiscarded: number;
  readonly progressCardsStolen: number;
  readonly progressCardsLost: number;
  readonly progressDrawnByFamily: ProgressFamilyStatistics;
  readonly progressPlayedByFamily: ProgressFamilyStatistics;
  readonly roadsBuilt: number;
  readonly housesBuilt: number;
  readonly citiesBuilt: number;
  readonly citiesLost: number;
  readonly metropolisesClaimed: number;
  readonly wallsBuilt: number;
  readonly knightsBuilt: number;
  readonly knightsActivated: number;
  readonly knightsUpgraded: number;
  readonly knightsMoved: number;
  readonly knightsDisplaced: number;
  readonly knightsLost: number;
  readonly improvementsBought: number;
  readonly perksUnlocked: number;
  readonly robberMoves: number;
  readonly bankTrades: number;
  readonly playerTrades: number;
  readonly turnsTaken: number;
  readonly defenderWins: number;
  readonly longestRoadClaims: number;
  readonly largestForceClaims: number;
  readonly merchantMoves: number;
  readonly terrainsReclaimed: number;
}

export interface MatchDiceStatistics {
  readonly rolls: number;
  readonly pips: number;
  readonly doubles: number;
  readonly sevens: number;
  readonly totals: Readonly<Record<string, number>>;
  readonly eventFaces: Readonly<Record<KNProgressFamily | 'BARBARIAN', number>>;
}

export interface MatchStatistics {
  readonly dice: MatchDiceStatistics;
  readonly bankTrades: number;
  readonly playerTrades: number;
  readonly barbarianAttacks: number;
  readonly barbarianDefenses: number;
  readonly inventorSwaps: number;
  readonly players: Readonly<Record<string, PlayerMatchStatistics>>;
}

const EMPTY_FAMILY_STATISTICS: ProgressFamilyStatistics = {
  CLASSIC: 0,
  SCIENCE: 0,
  TRADE: 0,
  POLITICS: 0,
};

function emptyPlayerStatistics(): PlayerMatchStatistics {
  return {
    diceRolls: 0,
    dicePips: 0,
    doublesRolled: 0,
    sevensRolled: 0,
    produced: {},
    gained: {},
    spent: {},
    discarded: {},
    tradedIn: {},
    tradedOut: {},
    stolen: {},
    stolenFrom: {},
    lost: {},
    progressCardsDrawn: 0,
    progressCardsPlayed: 0,
    progressCardsDiscarded: 0,
    progressCardsStolen: 0,
    progressCardsLost: 0,
    progressDrawnByFamily: { ...EMPTY_FAMILY_STATISTICS },
    progressPlayedByFamily: { ...EMPTY_FAMILY_STATISTICS },
    roadsBuilt: 0,
    housesBuilt: 0,
    citiesBuilt: 0,
    citiesLost: 0,
    metropolisesClaimed: 0,
    wallsBuilt: 0,
    knightsBuilt: 0,
    knightsActivated: 0,
    knightsUpgraded: 0,
    knightsMoved: 0,
    knightsDisplaced: 0,
    knightsLost: 0,
    improvementsBought: 0,
    perksUnlocked: 0,
    robberMoves: 0,
    bankTrades: 0,
    playerTrades: 0,
    turnsTaken: 0,
    defenderWins: 0,
    longestRoadClaims: 0,
    largestForceClaims: 0,
    merchantMoves: 0,
    terrainsReclaimed: 0,
  };
}

export function createMatchStatistics(playerIds: readonly PlayerId[]): MatchStatistics {
  return {
    dice: {
      rolls: 0,
      pips: 0,
      doubles: 0,
      sevens: 0,
      totals: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [String(index + 2), 0])),
      eventFaces: { BARBARIAN: 0, SCIENCE: 0, TRADE: 0, POLITICS: 0 },
    },
    bankTrades: 0,
    playerTrades: 0,
    barbarianAttacks: 0,
    barbarianDefenses: 0,
    inventorSwaps: 0,
    players: Object.fromEntries(playerIds.map((playerId) => [playerId, emptyPlayerStatistics()])),
  };
}

function clonePlayerStatistics(statistics: PlayerMatchStatistics): PlayerMatchStatistics {
  return {
    ...statistics,
    produced: { ...statistics.produced },
    gained: { ...statistics.gained },
    spent: { ...statistics.spent },
    discarded: { ...statistics.discarded },
    tradedIn: { ...statistics.tradedIn },
    tradedOut: { ...statistics.tradedOut },
    stolen: { ...statistics.stolen },
    stolenFrom: { ...statistics.stolenFrom },
    lost: { ...statistics.lost },
    progressDrawnByFamily: { ...statistics.progressDrawnByFamily },
    progressPlayedByFamily: { ...statistics.progressPlayedByFamily },
  };
}

function cloneStatistics(statistics: MatchStatistics): MatchStatistics {
  return {
    ...statistics,
    dice: {
      ...statistics.dice,
      totals: { ...statistics.dice.totals },
      eventFaces: { ...statistics.dice.eventFaces },
    },
    players: Object.fromEntries(
      Object.entries(statistics.players).map(([playerId, player]) => [
        playerId,
        clonePlayerStatistics(player),
      ]),
    ),
  };
}

function increment<T extends object>(target: T, key: keyof T, amount = 1): void {
  const writable = target as Record<keyof T, number>;
  writable[key] = (writable[key] ?? 0) + amount;
}

function addResource(bundle: ResourceBundle, resourceId: ResourceId, amount: number): void {
  if (amount <= 0) return;
  const writable = bundle as Partial<Record<ResourceId, number>>;
  writable[resourceId] = (writable[resourceId] ?? 0) + amount;
}

function addBundle(bundle: ResourceBundle, addition: ResourceBundle): void {
  for (const [id, amount] of Object.entries(addition)) {
    addResource(bundle, id as ResourceId, amount ?? 0);
  }
}

function handAmount(player: PlayerState | undefined, resourceId: ResourceId): number {
  if (player === undefined) return 0;
  return (player.resources[resourceId] ?? 0) + (player.commodities[resourceId] ?? 0);
}

function addFlow(
  statistics: PlayerMatchStatistics,
  category:
    | 'produced'
    | 'gained'
    | 'spent'
    | 'discarded'
    | 'tradedIn'
    | 'tradedOut'
    | 'stolen'
    | 'stolenFrom'
    | 'lost',
  bundle: ResourceBundle,
  knownDelta: Record<string, number>,
  direction: 1 | -1,
): void {
  addBundle(statistics[category], bundle);
  for (const [id, amount] of Object.entries(bundle)) {
    knownDelta[id] = (knownDelta[id] ?? 0) + direction * (amount ?? 0);
  }
}

function addSingleFlow(
  statistics: PlayerMatchStatistics,
  category: 'gained' | 'tradedIn' | 'tradedOut' | 'stolen' | 'stolenFrom',
  resourceId: ResourceId,
  knownDelta: Record<string, number>,
  direction: 1 | -1,
): void {
  addResource(statistics[category], resourceId, 1);
  knownDelta[resourceId] = (knownDelta[resourceId] ?? 0) + direction;
}

/**
 * Adds one accepted action's public outcomes to the compact, authoritative match report.
 * The accumulator is stored separately from the event feed because the feed is intentionally
 * capped for network and memory use during long matches.
 */
export function accumulateMatchStatistics(
  current: MatchStatistics | undefined,
  previousState: GameState,
  nextState: GameState,
  events: readonly GameEvent[],
): MatchStatistics {
  const playerIds = new Set([
    ...Object.keys(previousState.players),
    ...Object.keys(nextState.players),
  ] as PlayerId[]);
  const statistics = cloneStatistics(current ?? createMatchStatistics([...playerIds]));
  const players = statistics.players as Record<string, PlayerMatchStatistics>;
  const knownDeltas: Record<string, Record<string, number>> = {};
  for (const playerId of playerIds) {
    players[playerId] ??= emptyPlayerStatistics();
    knownDeltas[playerId] = {};
  }

  const playerStatistics = (playerId: PlayerId): PlayerMatchStatistics => {
    players[playerId] ??= emptyPlayerStatistics();
    knownDeltas[playerId] ??= {};
    return players[playerId];
  };
  const flow = (
    playerId: PlayerId,
    category: Parameters<typeof addFlow>[1],
    bundle: ResourceBundle,
    direction: 1 | -1,
  ) => addFlow(playerStatistics(playerId), category, bundle, knownDeltas[playerId]!, direction);

  for (const event of events) {
    switch (event.type) {
      case 'DICE_ROLLED': {
        const total = event.dice[0] + event.dice[1];
        increment(statistics.dice, 'rolls');
        increment(statistics.dice, 'pips', total);
        increment(statistics.dice.totals, String(total));
        if (event.dice[0] === event.dice[1]) increment(statistics.dice, 'doubles');
        if (total === 7) increment(statistics.dice, 'sevens');
        const player = playerStatistics(event.playerId);
        increment(player, 'diceRolls');
        increment(player, 'dicePips', total);
        if (event.dice[0] === event.dice[1]) increment(player, 'doublesRolled');
        if (total === 7) increment(player, 'sevensRolled');
        break;
      }
      case 'KN_DICE_ROLLED': {
        const total = event.numericTotal;
        increment(statistics.dice, 'rolls');
        increment(statistics.dice, 'pips', total);
        increment(statistics.dice.totals, String(total));
        increment(statistics.dice.eventFaces, event.event);
        if (event.red === event.regular) increment(statistics.dice, 'doubles');
        if (total === 7) increment(statistics.dice, 'sevens');
        const player = playerStatistics(event.playerId);
        increment(player, 'diceRolls');
        increment(player, 'dicePips', total);
        if (event.red === event.regular) increment(player, 'doublesRolled');
        if (total === 7) increment(player, 'sevensRolled');
        break;
      }
      case 'RESOURCES_PRODUCED':
        for (const [playerId, bundle] of Object.entries(event.grants)) {
          flow(playerId as PlayerId, 'produced', bundle, 1);
        }
        break;
      case 'RESOURCES_SPENT':
        flow(event.playerId, 'spent', event.resources, -1);
        break;
      case 'RESOURCES_DISCARDED':
        flow(event.playerId, 'discarded', event.resources, -1);
        break;
      case 'AQUEDUCT_RESOURCE_CHOSEN':
        addSingleFlow(
          playerStatistics(event.playerId),
          'gained',
          event.resourceId,
          knownDeltas[event.playerId]!,
          1,
        );
        break;
      case 'RESOURCE_STOLEN':
        addSingleFlow(
          playerStatistics(event.playerId),
          'stolen',
          event.resourceId,
          knownDeltas[event.playerId]!,
          1,
        );
        addSingleFlow(
          playerStatistics(event.targetPlayerId),
          'stolenFrom',
          event.resourceId,
          knownDeltas[event.targetPlayerId]!,
          -1,
        );
        break;
      case 'TRADE_COMPLETED': {
        const proposer = playerStatistics(event.playerId);
        flow(event.playerId, 'tradedOut', event.offered, -1);
        flow(event.playerId, 'tradedIn', event.requested, 1);
        if (event.recipientId === null) {
          increment(statistics, 'bankTrades');
          increment(proposer, 'bankTrades');
        } else {
          flow(event.recipientId, 'tradedIn', event.offered, 1);
          flow(event.recipientId, 'tradedOut', event.requested, -1);
          increment(statistics, 'playerTrades');
          increment(proposer, 'playerTrades');
          increment(playerStatistics(event.recipientId), 'playerTrades');
        }
        break;
      }
      case 'COMMERCIAL_HARBOR_EXCHANGED': {
        addSingleFlow(
          playerStatistics(event.playerId),
          'tradedOut',
          event.offeredResourceId,
          knownDeltas[event.playerId]!,
          -1,
        );
        addSingleFlow(
          playerStatistics(event.playerId),
          'tradedIn',
          event.receivedCommodityId,
          knownDeltas[event.playerId]!,
          1,
        );
        addSingleFlow(
          playerStatistics(event.targetPlayerId),
          'tradedIn',
          event.offeredResourceId,
          knownDeltas[event.targetPlayerId]!,
          1,
        );
        addSingleFlow(
          playerStatistics(event.targetPlayerId),
          'tradedOut',
          event.receivedCommodityId,
          knownDeltas[event.targetPlayerId]!,
          -1,
        );
        increment(statistics, 'playerTrades');
        increment(playerStatistics(event.playerId), 'playerTrades');
        increment(playerStatistics(event.targetPlayerId), 'playerTrades');
        break;
      }
      case 'WEDDING_CARDS_TRANSFERRED':
        flow(event.playerId, 'gained', event.resources, 1);
        flow(event.targetPlayerId, 'lost', event.resources, -1);
        break;
      case 'PROGRESS_CARD_RESOLVED': {
        if (event.resources !== undefined) flow(event.playerId, 'gained', event.resources, 1);
        if (event.resourceId !== undefined && event.transfers !== undefined) {
          for (const [targetPlayerId, amount] of Object.entries(event.transfers)) {
            if (amount <= 0) continue;
            const bundle = { [event.resourceId]: amount } as ResourceBundle;
            flow(event.playerId, 'stolen', bundle, 1);
            flow(targetPlayerId as PlayerId, 'stolenFrom', bundle, -1);
          }
        }
        break;
      }
      case 'KN_PROGRESS_CARD_RESOLVED': {
        const definition = getKNProgressCardDefinition(event.cardDefinitionId);
        if (event.resourceId !== undefined && event.transfers !== undefined) {
          for (const [targetPlayerId, amount] of Object.entries(event.transfers)) {
            if (amount <= 0) continue;
            const bundle = { [event.resourceId]: amount } as ResourceBundle;
            flow(event.playerId, 'stolen', bundle, 1);
            flow(targetPlayerId as PlayerId, 'stolenFrom', bundle, -1);
          }
        } else if (
          definition?.effect === 'MASTER_MERCHANT' &&
          event.resources !== undefined &&
          event.targetIds?.[0] !== undefined
        ) {
          flow(event.playerId, 'stolen', event.resources, 1);
          flow(event.targetIds[0] as PlayerId, 'stolenFrom', event.resources, -1);
        } else if (event.resources !== undefined) {
          flow(event.playerId, 'gained', event.resources, 1);
        }
        if (definition?.effect === 'SPY' && event.targetIds?.[0] !== undefined) {
          increment(playerStatistics(event.playerId), 'progressCardsStolen');
          increment(playerStatistics(event.targetIds[0] as PlayerId), 'progressCardsLost');
        }
        break;
      }
      case 'PROGRESS_CARD_BOUGHT':
        increment(playerStatistics(event.playerId), 'progressCardsDrawn');
        increment(playerStatistics(event.playerId).progressDrawnByFamily, 'CLASSIC');
        break;
      case 'PROGRESS_CARD_PLAYED':
        increment(playerStatistics(event.playerId), 'progressCardsPlayed');
        increment(playerStatistics(event.playerId).progressPlayedByFamily, 'CLASSIC');
        break;
      case 'KN_PROGRESS_CARD_DRAWN':
        increment(playerStatistics(event.playerId), 'progressCardsDrawn');
        increment(playerStatistics(event.playerId).progressDrawnByFamily, event.family);
        break;
      case 'KN_PROGRESS_CARD_DISCARDED':
        increment(playerStatistics(event.playerId), 'progressCardsDiscarded');
        break;
      case 'KN_PROGRESS_CARD_PLAYED': {
        increment(playerStatistics(event.playerId), 'progressCardsPlayed');
        const definition = getKNProgressCardDefinition(event.cardDefinitionId);
        if (definition !== undefined) {
          increment(playerStatistics(event.playerId).progressPlayedByFamily, definition.family);
        }
        break;
      }
      case 'ROAD_BUILT':
        increment(playerStatistics(event.playerId), 'roadsBuilt');
        break;
      case 'BUILDING_PLACED':
        increment(
          playerStatistics(event.playerId),
          event.buildingType === 'HOUSE' ? 'housesBuilt' : 'citiesBuilt',
        );
        break;
      case 'BUILDING_UPGRADED':
        increment(playerStatistics(event.playerId), 'citiesBuilt');
        break;
      case 'CITY_DOWNGRADED':
        increment(playerStatistics(event.playerId), 'citiesLost');
        break;
      case 'METROPOLIS_CHANGED':
        increment(playerStatistics(event.playerId), 'metropolisesClaimed');
        break;
      case 'WALL_BUILT':
        increment(playerStatistics(event.playerId), 'wallsBuilt');
        break;
      case 'KNIGHT_BUILT':
        increment(playerStatistics(event.playerId), 'knightsBuilt');
        break;
      case 'KNIGHT_ACTIVATED':
        increment(playerStatistics(event.playerId), 'knightsActivated');
        break;
      case 'KNIGHT_UPGRADED':
        increment(playerStatistics(event.playerId), 'knightsUpgraded');
        break;
      case 'KNIGHT_MOVED':
        increment(playerStatistics(event.playerId), 'knightsMoved');
        break;
      case 'KNIGHT_DISPLACED':
        increment(playerStatistics(event.playerId), 'knightsDisplaced');
        break;
      case 'KNIGHT_REMOVED':
        increment(playerStatistics(event.playerId), 'knightsLost');
        break;
      case 'IMPROVEMENT_BOUGHT':
        increment(playerStatistics(event.playerId), 'improvementsBought');
        break;
      case 'CITY_IMPROVEMENT_PERK_UNLOCKED':
        increment(playerStatistics(event.playerId), 'perksUnlocked');
        break;
      case 'ROBBER_MOVED':
        increment(playerStatistics(event.playerId), 'robberMoves');
        break;
      case 'MERCHANT_MOVED':
        increment(playerStatistics(event.playerId), 'merchantMoves');
        break;
      case 'TERRAIN_RECLAIMED':
        increment(playerStatistics(event.playerId), 'terrainsReclaimed');
        break;
      case 'BARBARIAN_ATTACK_RESOLVED':
        increment(statistics, 'barbarianAttacks');
        if (event.defended) increment(statistics, 'barbarianDefenses');
        if (event.defenderAwardPlayerId !== null) {
          increment(playerStatistics(event.defenderAwardPlayerId), 'defenderWins');
        }
        break;
      case 'INVENTORS_MADNESS_SWAPPED':
        increment(statistics, 'inventorSwaps');
        break;
      case 'LONGEST_ROAD_CHANGED':
        if (event.playerId !== null)
          increment(playerStatistics(event.playerId), 'longestRoadClaims');
        break;
      case 'LARGEST_FORCE_CHANGED':
        if (event.playerId !== null)
          increment(playerStatistics(event.playerId), 'largestForceClaims');
        break;
      case 'TURN_STARTED':
        increment(playerStatistics(event.playerId), 'turnsTaken');
        break;
      default:
        break;
    }
  }

  // Some K+N construction and discount flows intentionally omit a generic spending event.
  // Reconcile only actions that visibly built or upgraded something; this avoids mistaking
  // multi-step Wedding transfers for purchases before their final event is emitted.
  const canContainUnreportedCost = events.some((event) =>
    [
      'BUILDING_PLACED',
      'BUILDING_UPGRADED',
      'ROAD_BUILT',
      'KNIGHT_BUILT',
      'KNIGHT_ACTIVATED',
      'KNIGHT_UPGRADED',
      'WALL_BUILT',
      'IMPROVEMENT_BOUGHT',
      'PROGRESS_CARD_BOUGHT',
    ].includes(event.type),
  );
  if (canContainUnreportedCost) {
    for (const playerId of playerIds) {
      const previousPlayer = previousState.players[playerId];
      const nextPlayer = nextState.players[playerId];
      for (const good of HAND_GOODS) {
        const actualDelta = handAmount(nextPlayer, good.id) - handAmount(previousPlayer, good.id);
        const unmatchedDelta = actualDelta - (knownDeltas[playerId]?.[good.id] ?? 0);
        if (unmatchedDelta < 0) {
          addResource(playerStatistics(playerId).spent, good.id, -unmatchedDelta);
        }
      }
    }
  }

  return statistics;
}

export function resourceStatisticTotal(bundle: ResourceBundle): number {
  return Object.values(bundle).reduce<number>((total, amount) => total + (amount ?? 0), 0);
}
