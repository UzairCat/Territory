import type { ResourceBundle } from '../content/types';
import type {
  ActionId,
  CardInstanceId,
  EdgeId,
  HexId,
  KnightId,
  PlayerId,
  ResourceId,
  TradeId,
  VertexId,
} from './ids';
import type { KNProgressFamily } from '../content/types';

interface ActionBase<Type extends string> {
  readonly id: ActionId;
  readonly type: Type;
  readonly actorId: PlayerId;
}

export type GameAction =
  | (ActionBase<'PLACE_SETUP_HOUSE'> & { readonly vertexId: VertexId })
  | (ActionBase<'PLACE_SETUP_ROAD'> & { readonly edgeId: EdgeId })
  | ActionBase<'ROLL_DICE'>
  | ActionBase<'ROLL_KN_DICE'>
  | (ActionBase<'PLAY_ALCHEMIST'> & {
      readonly cardInstanceId: CardInstanceId;
      readonly redDie: number;
      readonly regularDie: number;
    })
  | (ActionBase<'DISCARD_RESOURCES'> & { readonly resources: ResourceBundle })
  | (ActionBase<'MOVE_ROBBER'> & { readonly hexId: HexId })
  | (ActionBase<'STEAL_FROM_PLAYER'> & { readonly targetPlayerId: PlayerId })
  | (ActionBase<'BUILD_ROAD'> & { readonly edgeId: EdgeId })
  | (ActionBase<'BUILD_HOUSE'> & { readonly vertexId: VertexId })
  | (ActionBase<'UPGRADE_MANSION'> & { readonly vertexId: VertexId })
  | (ActionBase<'BUILD_KNIGHT'> & { readonly vertexId: VertexId })
  | (ActionBase<'ACTIVATE_KNIGHT'> & { readonly knightId: KnightId })
  | (ActionBase<'UPGRADE_KNIGHT'> & { readonly knightId: KnightId })
  | (ActionBase<'MOVE_KNIGHT'> & { readonly knightId: KnightId; readonly vertexId: VertexId })
  | (ActionBase<'DISPLACE_KNIGHT'> & {
      readonly knightId: KnightId;
      readonly targetKnightId: KnightId;
    })
  | (ActionBase<'CHASE_ROBBER'> & { readonly knightId: KnightId })
  | (ActionBase<'BUILD_WALL'> & { readonly vertexId: VertexId })
  | (ActionBase<'BUY_IMPROVEMENT'> & { readonly track: KNProgressFamily })
  | (ActionBase<'BANK_TRADE'> & {
      readonly offered: ResourceBundle;
      readonly requested: ResourceBundle;
    })
  | (ActionBase<'CREATE_TRADE'> & {
      readonly tradeId: TradeId;
      readonly recipientIds: readonly PlayerId[];
      readonly offered: ResourceBundle;
      readonly requested: ResourceBundle;
    })
  | (ActionBase<'RESPOND_TO_TRADE'> & { readonly tradeId: TradeId; readonly accepted: boolean })
  | (ActionBase<'CONFIRM_TRADE'> & { readonly tradeId: TradeId; readonly recipientId: PlayerId })
  | (ActionBase<'CANCEL_TRADE'> & { readonly tradeId: TradeId })
  | (ActionBase<'EXPIRE_TRADE'> & { readonly tradeId: TradeId })
  | ActionBase<'BUY_PROGRESS_CARD'>
  | (ActionBase<'PLAY_PROGRESS_CARD'> & { readonly cardInstanceId: CardInstanceId })
  | (ActionBase<'PLAY_KN_PROGRESS_CARD'> & { readonly cardInstanceId: CardInstanceId })
  | (ActionBase<'RESOLVE_PROGRESS_SELECTION'> & {
      readonly selections: readonly string[];
      readonly resources?: ResourceBundle;
      readonly redDie?: number;
      readonly regularDie?: number;
      readonly cancelled?: boolean;
    })
  | (ActionBase<'PLACE_OR_MOVE_MERCHANT'> & { readonly hexId: HexId })
  | (ActionBase<'SELECT_CARD_RESOURCES'> & {
      readonly cardInstanceId: CardInstanceId;
      readonly resources: ResourceBundle;
    })
  | (ActionBase<'SELECT_CARD_RESOURCE_TYPE'> & {
      readonly cardInstanceId: CardInstanceId;
      readonly resourceId: ResourceId;
    })
  | ActionBase<'END_TURN'>
  | ActionBase<'AUTO_TIMEOUT'>;
