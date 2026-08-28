import type { BuildingType, KNProgressFamily, ResourceBundle } from '../content/types';
import type {
  CardDefinitionId,
  CardInstanceId,
  ColorId,
  EdgeId,
  HexId,
  KnightId,
  PlayerId,
  PortId,
  ResourceId,
  TerrainId,
  TradeId,
  VertexId,
} from './ids';
import type { GameConfig } from './game-config';
import type { RandomState } from './random';

export const GAME_STATE_VERSION = 1;

export type GamePhase =
  | 'INITIALIZING'
  | 'SETUP_PLACE_HOUSE'
  | 'SETUP_PLACE_ROAD'
  | 'WAITING_FOR_ROLL'
  | 'RESOLVING_PRODUCTION'
  | 'DISCARD_RESOURCES'
  | 'MOVE_ROBBER'
  | 'CHOOSE_STEAL_TARGET'
  | 'ACTION_PHASE'
  | 'CARD_RESOLUTION'
  | 'GAME_OVER';

export interface ProgressCardInstance {
  readonly instanceId: CardInstanceId;
  readonly definitionId: CardDefinitionId;
  readonly ownerId: PlayerId | null;
  readonly purchasedTurn: number | null;
  readonly playedTurn: number | null;
}

export type KNEventDieResult = 'BARBARIAN' | KNProgressFamily;
export type ImprovementTrack = KNProgressFamily;
export type ImprovementLevels = Readonly<Record<ImprovementTrack, number>>;

export interface KnightState {
  readonly id: KnightId;
  readonly ownerId: PlayerId;
  readonly vertexId: VertexId;
  readonly level: 1 | 2 | 3;
  readonly active: boolean;
  readonly placedTurn: number;
  readonly activeSinceTurn: number | null;
  readonly lastActionTurn: number | null;
  readonly upgradedTurn: number | null;
}

export interface KNProgressCardInstance {
  readonly instanceId: CardInstanceId;
  readonly definitionId: CardDefinitionId;
  readonly ownerId: PlayerId | null;
  readonly drawnTurn: number | null;
  readonly playedTurn: number | null;
  readonly revealed: boolean;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly colorId: ColorId;
  readonly resources: ResourceBundle;
  readonly commodities: ResourceBundle;
  readonly progressCardIds: readonly CardInstanceId[];
  readonly roadsRemaining: number;
  readonly housesRemaining: number;
  readonly mansionsRemaining: number;
  readonly playedForceCards: number;
  readonly cityImprovements: ImprovementLevels;
  readonly knights: readonly KnightState[];
  readonly cityWallsRemaining: number;
  readonly knProgressCardIds: readonly CardInstanceId[];
  readonly revealedKNProgressCardIds: readonly CardInstanceId[];
  readonly defenderPoints: number;
  readonly mustRebuildDestroyedMansion: boolean;
  readonly forcedMansionRebuildVertexIds: readonly VertexId[];
  readonly craneDiscountAvailable: boolean;
  readonly merchantFleetGoodId: ResourceId | null;
}

export interface HexState {
  readonly id: HexId;
  readonly q: number;
  readonly r: number;
  readonly terrainId: TerrainId;
  readonly resourceId: ResourceId | null;
  readonly numberToken: number | null;
  readonly vertexIds: readonly VertexId[];
  readonly edgeIds: readonly EdgeId[];
}

export interface BuildingState {
  readonly ownerId: PlayerId;
  readonly type: Extract<BuildingType, 'HOUSE' | 'MANSION'>;
  readonly hasWall?: boolean;
  readonly metropolis?: ImprovementTrack | null;
}

export interface VertexState {
  readonly id: VertexId;
  readonly adjacentHexIds: readonly HexId[];
  readonly connectedEdgeIds: readonly EdgeId[];
  readonly adjacentVertexIds: readonly VertexId[];
  readonly building: BuildingState | null;
  readonly knightId?: KnightId | null;
  readonly portId: PortId | null;
}

export interface EdgeState {
  readonly id: EdgeId;
  readonly vertexAId: VertexId;
  readonly vertexBId: VertexId;
  readonly adjacentHexIds: readonly HexId[];
  readonly roadOwnerId: PlayerId | null;
  readonly portId: PortId | null;
}

export interface PortState {
  readonly id: PortId;
  readonly edgeId: EdgeId;
  readonly vertexIds: readonly [VertexId, VertexId];
  readonly tradeRatio: 2 | 3;
  readonly resourceId: ResourceId | null;
}

export type TradeOfferStatus = 'OPEN' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface TradeOffer {
  readonly id: TradeId;
  readonly fromPlayerId: PlayerId;
  readonly recipientId: PlayerId;
  readonly offered: ResourceBundle;
  readonly requested: ResourceBundle;
  readonly status: TradeOfferStatus;
  readonly createdTurn: number;
  readonly acceptedByPlayerId: PlayerId | null;
}

export interface BoardState {
  readonly hexes: Readonly<Record<string, HexState>>;
  readonly vertices: Readonly<Record<string, VertexState>>;
  readonly edges: Readonly<Record<string, EdgeState>>;
  readonly ports: Readonly<Record<string, PortState>>;
  readonly robberHexId: HexId | null;
}

export interface TurnState {
  readonly activePlayerId: PlayerId | null;
  readonly turnNumber: number;
  readonly phase: GamePhase;
  readonly dice: readonly [number, number] | null;
  readonly cardsPlayedThisTurn: number;
  readonly cardIdsBoughtThisTurn: readonly CardInstanceId[];
  readonly setupPlacementIndex: number | null;
  readonly setupPlacementVertexId: VertexId | null;
  readonly knDice?: {
    readonly red: number;
    readonly regular: number;
    readonly event: KNEventDieResult;
  } | null;
}

export interface BalancedDiceState {
  readonly remainingPairIds: readonly number[];
  readonly recentTotals: readonly number[];
}

export type KNSelectionPurpose =
  | 'AQUEDUCT_RESOURCE'
  | 'BARBARIAN_CITY_LOSS'
  | 'DEFENDER_TIE_DECK'
  | 'PROGRESS_DISCARD'
  | 'ALCHEMIST_DICE'
  | 'ENGINEER_WALL'
  | 'INVENTOR_FIRST_TOKEN'
  | 'INVENTOR_SECOND_TOKEN'
  | 'MEDICINE_CITY'
  | 'ROAD_BUILDING'
  | 'SMITH_KNIGHT'
  | 'COMMERCIAL_HARBOR_PLAYER'
  | 'COMMERCIAL_HARBOR_RESOURCE'
  | 'COMMERCIAL_HARBOR_COMMODITY'
  | 'MASTER_MERCHANT_PLAYER'
  | 'MASTER_MERCHANT_CARDS'
  | 'MERCHANT_FLEET_GOOD'
  | 'MERCHANT_HEX'
  | 'RESOURCE_MONOPOLY'
  | 'COMMODITY_MONOPOLY'
  | 'BISHOP_HEX'
  | 'DESERTER_PLAYER'
  | 'DESERTER_KNIGHT'
  | 'DESERTER_PLACE_KNIGHT'
  | 'DIPLOMAT_ROAD'
  | 'DIPLOMAT_RELOCATE_ROAD'
  | 'INTRIGUE_KNIGHT'
  | 'RELOCATE_DISPLACED_KNIGHT'
  | 'SABOTEUR_DISCARD'
  | 'SPY_PLAYER'
  | 'SPY_CARD'
  | 'WEDDING_CARDS'
  | 'METROPOLIS_CITY';

export type KNSelectionContextValue =
  string | number | boolean | null | readonly string[] | Readonly<Record<string, number>>;

export type PendingInteraction =
  | {
      readonly type: 'DISCARD_RESOURCES';
      readonly queue: readonly PlayerId[];
      readonly requiredCounts: Readonly<Record<string, number>>;
    }
  | {
      readonly type: 'MOVE_ROBBER';
      readonly playerId: PlayerId;
      readonly sourceCardId?: CardInstanceId;
      readonly sourceKnightId?: KnightId;
    }
  | {
      readonly type: 'CHOOSE_STEAL_TARGET';
      readonly playerId: PlayerId;
      readonly eligibleTargets: readonly PlayerId[];
      readonly sourceCardId?: CardInstanceId;
    }
  | {
      readonly type: 'SELECT_RESOURCES';
      readonly playerId: PlayerId;
      readonly sourceCardId: CardInstanceId;
      readonly count: number;
    }
  | {
      readonly type: 'SELECT_RESOURCE_TYPE';
      readonly playerId: PlayerId;
      readonly sourceCardId: CardInstanceId;
    }
  | {
      readonly type: 'PLACE_FREE_ROADS';
      readonly playerId: PlayerId;
      readonly sourceCardId: CardInstanceId;
      readonly remainingPlacements: number;
    }
  | { readonly type: 'TRADE_RESPONSE'; readonly tradeId: TradeId; readonly playerId: PlayerId }
  | {
      readonly type: 'KN_SELECTION';
      readonly playerId: PlayerId;
      readonly purpose: KNSelectionPurpose;
      readonly sourceCardId?: CardInstanceId;
      readonly eligibleIds: readonly string[];
      readonly minimumSelections: number;
      readonly maximumSelections: number;
      readonly queue: readonly PlayerId[];
      readonly canCancel: boolean;
      readonly context: Readonly<Record<string, KNSelectionContextValue>>;
    }
  | null;

export interface BonusState {
  readonly longestRoadHolderId: PlayerId | null;
  readonly largestForceHolderId: PlayerId | null;
}

export interface ActionHistoryEntry {
  readonly actionType: string;
  readonly actorId: PlayerId | null;
  readonly turnNumber: number;
  readonly eventTypes: readonly string[];
}

export interface KNPendingRoll {
  readonly playerId: PlayerId;
  readonly red: number;
  readonly regular: number;
  readonly event: KNEventDieResult;
  readonly numericTotal: number;
  readonly stage: 'EVENT' | 'NUMBER' | 'AQUEDUCT';
  readonly skipSevenDiscards?: boolean;
}

export interface KNBarbarianAttackSummary {
  readonly barbarianStrength: number;
  readonly defenderStrength: number;
  readonly contributions: Readonly<Record<string, number>>;
  readonly defended: boolean;
  readonly defenderAwardPlayerId: PlayerId | null;
  readonly affectedPlayerIds: readonly PlayerId[];
}

export interface KNState {
  readonly barbarianPosition: number;
  readonly barbarianTrackLength: number;
  readonly firstBarbarianAttackResolved: boolean;
  readonly eventDieResult: KNEventDieResult | null;
  readonly redDieResult: number | null;
  readonly regularDieResult: number | null;
  readonly progressDecks: Readonly<Record<KNProgressFamily, readonly CardInstanceId[]>>;
  readonly progressDiscards: Readonly<Record<KNProgressFamily, readonly CardInstanceId[]>>;
  readonly progressCards: Readonly<Record<string, KNProgressCardInstance>>;
  readonly metropolisOwners: Readonly<Record<KNProgressFamily, PlayerId | null>>;
  readonly merchant: {
    readonly ownerId: PlayerId;
    readonly hexId: HexId;
    readonly resourceId: ResourceId;
  } | null;
  readonly pendingRoll: KNPendingRoll | null;
  readonly attackSummary: KNBarbarianAttackSummary | null;
}

export interface GameState {
  readonly schemaVersion: typeof GAME_STATE_VERSION;
  readonly config: GameConfig;
  readonly players: Readonly<Record<string, PlayerState>>;
  readonly board: BoardState;
  readonly bank: ResourceBundle;
  readonly commodityBank: ResourceBundle;
  readonly turn: TurnState;
  readonly progressDeck: readonly CardInstanceId[];
  readonly progressDiscard: readonly CardInstanceId[];
  readonly progressCards: Readonly<Record<string, ProgressCardInstance>>;
  readonly tradeOffers: Readonly<Record<string, TradeOffer>>;
  readonly pendingInteraction: PendingInteraction;
  readonly bonuses: BonusState;
  readonly winnerId: PlayerId | null;
  readonly actionHistory: readonly ActionHistoryEntry[];
  readonly random: RandomState;
  readonly balancedDice: BalancedDiceState | null;
  readonly kn: KNState | null;
}
