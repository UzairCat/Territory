import type { BuildingType, ResourceBundle } from '../content/types';
import type { KNProgressFamily } from '../content/types';
import type {
  CardDefinitionId,
  CardInstanceId,
  EdgeId,
  HexId,
  KnightId,
  PlayerId,
  ResourceId,
  TradeId,
  VertexId,
} from './ids';

export type GameEvent =
  | { readonly type: 'SETUP_STARTED'; readonly playerId: PlayerId }
  | {
      readonly type: 'SETUP_PLAYER_ADVANCED';
      readonly playerId: PlayerId;
      readonly placementNumber: number;
      readonly totalPlacements: number;
    }
  | { readonly type: 'SETUP_COMPLETED'; readonly firstPlayerId: PlayerId }
  | {
      readonly type: 'BUILDING_PLACED';
      readonly playerId: PlayerId;
      readonly vertexId: VertexId;
      readonly buildingType: Extract<BuildingType, 'HOUSE' | 'MANSION'>;
    }
  | {
      readonly type: 'BUILDING_UPGRADED';
      readonly playerId: PlayerId;
      readonly vertexId: VertexId;
    }
  | { readonly type: 'ROAD_BUILT'; readonly playerId: PlayerId; readonly edgeId: EdgeId }
  | {
      readonly type: 'RESOURCES_SPENT';
      readonly playerId: PlayerId;
      readonly resources: ResourceBundle;
      readonly reason: BuildingType | 'PROGRESS_CARD';
    }
  | {
      readonly type: 'DICE_ROLLED';
      readonly playerId: PlayerId;
      readonly dice: readonly [number, number];
    }
  | {
      readonly type: 'KN_DICE_ROLLED';
      readonly playerId: PlayerId;
      readonly red: number;
      readonly regular: number;
      readonly event: 'BARBARIAN' | KNProgressFamily;
      readonly numericTotal: number;
    }
  | {
      readonly type: 'BARBARIAN_ADVANCED';
      readonly position: number;
      readonly trackLength: number;
    }
  | {
      readonly type: 'INVENTORS_MADNESS_TARGETS_SELECTED';
      readonly hexIds: readonly [HexId, HexId];
    }
  | {
      readonly type: 'INVENTORS_MADNESS_SWAPPED';
      readonly hexIds: readonly [HexId, HexId];
    }
  | {
      readonly type: 'TERRAIN_RECLAIMED';
      readonly playerId: PlayerId;
      readonly hexId: HexId;
      readonly fromResourceId: ResourceId;
      readonly toResourceId: ResourceId;
    }
  | {
      readonly type: 'WAR_DRUMS_MOVED';
      readonly playerId: PlayerId;
      readonly fromPosition: number;
      readonly position: number;
      readonly trackLength: number;
    }
  | {
      readonly type: 'BARBARIAN_ATTACK_RESOLVED';
      readonly barbarianStrength: number;
      readonly defenderStrength: number;
      readonly defended: boolean;
      readonly defenderAwardPlayerId: PlayerId | null;
      readonly affectedPlayerIds: readonly PlayerId[];
    }
  | {
      readonly type: 'CITY_DOWNGRADED';
      readonly playerId: PlayerId;
      readonly vertexId: VertexId;
      readonly wallDestroyed: boolean;
    }
  | {
      readonly type: 'RESOURCES_PRODUCED';
      readonly source: 'SETUP' | 'DICE';
      readonly rollTotal: number | null;
      readonly grants: Readonly<Record<string, ResourceBundle>>;
      readonly unavailableResourceIds: readonly ResourceId[];
    }
  | {
      readonly type: 'RESOURCES_DISCARDED';
      readonly playerId: PlayerId;
      readonly resources: ResourceBundle;
      readonly hiddenCount?: number;
    }
  | {
      readonly type: 'ROBBER_MOVED';
      readonly playerId: PlayerId;
      readonly fromHexId: HexId | null;
      readonly hexId: HexId;
    }
  | {
      readonly type: 'ROBBER_SEQUENCE_STARTED';
      readonly playerId: PlayerId;
      readonly discardPlayerIds: readonly PlayerId[];
      readonly robberUnlocked?: boolean;
    }
  | {
      readonly type: 'RESOURCE_STOLEN';
      readonly playerId: PlayerId;
      readonly targetPlayerId: PlayerId;
      readonly resourceId: ResourceId;
      readonly hidden?: boolean;
    }
  | {
      readonly type: 'TRADE_OFFERED';
      readonly tradeId: TradeId;
      readonly playerId: PlayerId;
      readonly recipientIds: readonly PlayerId[];
    }
  | {
      readonly type: 'TRADE_ACCEPTED';
      readonly tradeId: TradeId;
      readonly playerId: PlayerId;
      readonly recipientId: PlayerId;
    }
  | {
      readonly type: 'TRADE_REJECTED';
      readonly tradeId: TradeId;
      readonly playerId: PlayerId;
      readonly recipientId: PlayerId;
    }
  | { readonly type: 'TRADE_CANCELLED'; readonly tradeId: TradeId; readonly playerId: PlayerId }
  | { readonly type: 'TRADE_EXPIRED'; readonly tradeId: TradeId; readonly playerId: PlayerId }
  | {
      readonly type: 'TRADE_COMPLETED';
      readonly tradeId: TradeId | null;
      readonly playerId: PlayerId;
      readonly recipientId: PlayerId | null;
      readonly offered: ResourceBundle;
      readonly requested: ResourceBundle;
    }
  | {
      readonly type: 'COMMERCIAL_HARBOR_EXCHANGED';
      readonly playerId: PlayerId;
      readonly targetPlayerId: PlayerId;
      readonly offeredResourceId: ResourceId;
      readonly receivedCommodityId: ResourceId;
    }
  | {
      readonly type: 'WEDDING_CARDS_TRANSFERRED';
      readonly playerId: PlayerId;
      readonly targetPlayerId: PlayerId;
      readonly resources: ResourceBundle;
      readonly hiddenCount?: number;
    }
  | {
      readonly type: 'PROGRESS_CARD_BOUGHT';
      readonly playerId: PlayerId;
      readonly cardInstanceId: CardInstanceId;
      readonly cardDefinitionId: CardDefinitionId;
    }
  | {
      readonly type: 'KN_PROGRESS_CARD_DRAWN';
      readonly playerId: PlayerId;
      readonly family: KNProgressFamily;
      readonly cardInstanceId: CardInstanceId;
      readonly revealed: boolean;
    }
  | {
      readonly type: 'KN_PROGRESS_CARD_DISCARDED';
      readonly playerId: PlayerId;
      readonly family: KNProgressFamily;
      readonly cardInstanceId: CardInstanceId;
    }
  | {
      readonly type: 'KN_PROGRESS_CARD_PLAYED';
      readonly playerId: PlayerId;
      readonly cardInstanceId: CardInstanceId;
      readonly cardDefinitionId: CardDefinitionId;
    }
  | {
      readonly type: 'KN_PROGRESS_CARD_RESOLVED';
      readonly playerId: PlayerId;
      readonly cardInstanceId: CardInstanceId;
      readonly cardDefinitionId: CardDefinitionId;
      readonly resources?: ResourceBundle;
      readonly resourceId?: ResourceId;
      readonly transfers?: Readonly<Record<string, number>>;
      readonly targetIds?: readonly string[];
    }
  | {
      readonly type: 'KNIGHT_BUILT';
      readonly playerId: PlayerId;
      readonly knightId: KnightId;
      readonly vertexId: VertexId;
      readonly level: 1 | 2 | 3;
    }
  | {
      readonly type: 'KNIGHT_ACTIVATED';
      readonly playerId: PlayerId;
      readonly knightId: KnightId;
    }
  | {
      readonly type: 'KNIGHT_UPGRADED';
      readonly playerId: PlayerId;
      readonly knightId: KnightId;
      readonly level: 2 | 3;
    }
  | {
      readonly type: 'KNIGHT_MOVED';
      readonly playerId: PlayerId;
      readonly knightId: KnightId;
      readonly fromVertexId: VertexId;
      readonly vertexId: VertexId;
    }
  | {
      readonly type: 'KNIGHT_DISPLACED';
      readonly playerId: PlayerId;
      readonly knightId: KnightId;
      readonly targetPlayerId: PlayerId;
      readonly targetKnightId: KnightId;
      readonly vertexId: VertexId;
    }
  | {
      readonly type: 'KNIGHT_REMOVED';
      readonly playerId: PlayerId;
      readonly knightId: KnightId;
    }
  | { readonly type: 'WALL_BUILT'; readonly playerId: PlayerId; readonly vertexId: VertexId }
  | {
      readonly type: 'IMPROVEMENT_BOUGHT';
      readonly playerId: PlayerId;
      readonly track: KNProgressFamily;
      readonly level: number;
      readonly cost: number;
    }
  | {
      readonly type: 'CITY_IMPROVEMENT_PERK_UNLOCKED';
      readonly playerId: PlayerId;
      readonly track: KNProgressFamily;
      readonly perk: 'AQUEDUCT' | 'TRADING_HOUSE' | 'FORTRESS';
    }
  | {
      readonly type: 'METROPOLIS_CHANGED';
      readonly track: KNProgressFamily;
      readonly playerId: PlayerId;
      readonly previousPlayerId: PlayerId | null;
      readonly vertexId: VertexId;
    }
  | {
      readonly type: 'MERCHANT_MOVED';
      readonly playerId: PlayerId;
      readonly hexId: HexId;
      readonly resourceId: ResourceId;
    }
  | {
      readonly type: 'AQUEDUCT_RESOURCE_CHOSEN';
      readonly playerId: PlayerId;
      readonly resourceId: ResourceId;
    }
  | {
      readonly type: 'PROGRESS_CARD_PLAYED';
      readonly playerId: PlayerId;
      readonly cardInstanceId: CardInstanceId;
    }
  | {
      readonly type: 'PROGRESS_CARD_RESOLVED';
      readonly playerId: PlayerId;
      readonly cardInstanceId: CardInstanceId;
      readonly cardDefinitionId: CardDefinitionId;
      readonly amount: number | null;
      readonly resources?: ResourceBundle;
      readonly resourceId?: ResourceId;
      readonly transfers?: Readonly<Record<string, number>>;
    }
  | { readonly type: 'LONGEST_ROAD_CHANGED'; readonly playerId: PlayerId | null }
  | { readonly type: 'LARGEST_FORCE_CHANGED'; readonly playerId: PlayerId | null }
  | { readonly type: 'SCORE_CHANGED'; readonly playerId: PlayerId; readonly score: number }
  | { readonly type: 'TURN_ENDED'; readonly playerId: PlayerId }
  | { readonly type: 'TURN_STARTED'; readonly playerId: PlayerId; readonly turnNumber: number }
  | { readonly type: 'GAME_WON'; readonly playerId: PlayerId; readonly score: number };
