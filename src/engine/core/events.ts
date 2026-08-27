import type { BuildingType, ResourceBundle } from '../content/types';
import type {
  CardDefinitionId,
  CardInstanceId,
  EdgeId,
  HexId,
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
  | { readonly type: 'ROAD_BUILT'; readonly playerId: PlayerId; readonly edgeId: EdgeId }
  | {
      readonly type: 'DICE_ROLLED';
      readonly playerId: PlayerId;
      readonly dice: readonly [number, number];
    }
  | {
      readonly type: 'RESOURCES_PRODUCED';
      readonly grants: Readonly<Record<string, ResourceBundle>>;
    }
  | {
      readonly type: 'RESOURCES_DISCARDED';
      readonly playerId: PlayerId;
      readonly resources: ResourceBundle;
    }
  | { readonly type: 'ROBBER_MOVED'; readonly playerId: PlayerId; readonly hexId: HexId }
  | {
      readonly type: 'RESOURCE_STOLEN';
      readonly playerId: PlayerId;
      readonly targetPlayerId: PlayerId;
      readonly resourceId: ResourceId;
    }
  | { readonly type: 'TRADE_OFFERED'; readonly tradeId: TradeId }
  | { readonly type: 'TRADE_COMPLETED'; readonly tradeId: TradeId | null }
  | {
      readonly type: 'PROGRESS_CARD_BOUGHT';
      readonly playerId: PlayerId;
      readonly cardInstanceId: CardInstanceId;
      readonly cardDefinitionId: CardDefinitionId;
    }
  | {
      readonly type: 'PROGRESS_CARD_PLAYED';
      readonly playerId: PlayerId;
      readonly cardInstanceId: CardInstanceId;
    }
  | { readonly type: 'LONGEST_ROAD_CHANGED'; readonly playerId: PlayerId | null }
  | { readonly type: 'LARGEST_FORCE_CHANGED'; readonly playerId: PlayerId | null }
  | { readonly type: 'SCORE_CHANGED'; readonly playerId: PlayerId; readonly score: number }
  | { readonly type: 'TURN_ENDED'; readonly playerId: PlayerId }
  | { readonly type: 'TURN_STARTED'; readonly playerId: PlayerId; readonly turnNumber: number }
  | { readonly type: 'GAME_WON'; readonly playerId: PlayerId; readonly score: number };
