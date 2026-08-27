import type { BuildingType, ResourceBundle } from '../content/types';
import type {
  CardDefinitionId,
  CardInstanceId,
  ColorId,
  EdgeId,
  HexId,
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

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly colorId: ColorId;
  readonly resources: ResourceBundle;
  readonly progressCardIds: readonly CardInstanceId[];
  readonly roadsRemaining: number;
  readonly housesRemaining: number;
  readonly mansionsRemaining: number;
  readonly playedForceCards: number;
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
}

export interface VertexState {
  readonly id: VertexId;
  readonly adjacentHexIds: readonly HexId[];
  readonly connectedEdgeIds: readonly EdgeId[];
  readonly adjacentVertexIds: readonly VertexId[];
  readonly building: BuildingState | null;
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
  readonly setupPlacementVertexId: VertexId | null;
}

export type PendingInteraction =
  | {
      readonly type: 'DISCARD_RESOURCES';
      readonly queue: readonly PlayerId[];
      readonly requiredCounts: Readonly<Record<string, number>>;
    }
  | { readonly type: 'MOVE_ROBBER'; readonly playerId: PlayerId }
  | {
      readonly type: 'CHOOSE_STEAL_TARGET';
      readonly playerId: PlayerId;
      readonly eligibleTargets: readonly PlayerId[];
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

export interface GameState {
  readonly schemaVersion: typeof GAME_STATE_VERSION;
  readonly config: GameConfig;
  readonly players: Readonly<Record<string, PlayerState>>;
  readonly board: BoardState;
  readonly bank: ResourceBundle;
  readonly turn: TurnState;
  readonly progressDeck: readonly CardInstanceId[];
  readonly progressDiscard: readonly CardInstanceId[];
  readonly progressCards: Readonly<Record<string, ProgressCardInstance>>;
  readonly pendingInteraction: PendingInteraction;
  readonly bonuses: BonusState;
  readonly winnerId: PlayerId | null;
  readonly actionHistory: readonly ActionHistoryEntry[];
  readonly random: RandomState;
}
