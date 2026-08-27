import type { ResourceBundle } from '../content/types';
import type {
  ActionId,
  CardInstanceId,
  EdgeId,
  HexId,
  PlayerId,
  ResourceId,
  TradeId,
  VertexId,
} from './ids';

interface ActionBase<Type extends string> {
  readonly id: ActionId;
  readonly type: Type;
  readonly actorId: PlayerId;
}

export type GameAction =
  | (ActionBase<'PLACE_SETUP_HOUSE'> & { readonly vertexId: VertexId })
  | (ActionBase<'PLACE_SETUP_ROAD'> & { readonly edgeId: EdgeId })
  | ActionBase<'ROLL_DICE'>
  | (ActionBase<'DISCARD_RESOURCES'> & { readonly resources: ResourceBundle })
  | (ActionBase<'MOVE_ROBBER'> & { readonly hexId: HexId })
  | (ActionBase<'STEAL_FROM_PLAYER'> & { readonly targetPlayerId: PlayerId })
  | (ActionBase<'BUILD_ROAD'> & { readonly edgeId: EdgeId })
  | (ActionBase<'BUILD_HOUSE'> & { readonly vertexId: VertexId })
  | (ActionBase<'UPGRADE_MANSION'> & { readonly vertexId: VertexId })
  | (ActionBase<'BANK_TRADE'> & {
      readonly giveResourceId: ResourceId;
      readonly receiveResourceId: ResourceId;
    })
  | (ActionBase<'CREATE_TRADE'> & {
      readonly tradeId: TradeId;
      readonly recipientId: PlayerId;
      readonly offered: ResourceBundle;
      readonly requested: ResourceBundle;
    })
  | (ActionBase<'RESPOND_TO_TRADE'> & { readonly tradeId: TradeId; readonly accepted: boolean })
  | ActionBase<'BUY_PROGRESS_CARD'>
  | (ActionBase<'PLAY_PROGRESS_CARD'> & { readonly cardInstanceId: CardInstanceId })
  | (ActionBase<'SELECT_CARD_RESOURCES'> & {
      readonly cardInstanceId: CardInstanceId;
      readonly resources: ResourceBundle;
    })
  | (ActionBase<'SELECT_CARD_RESOURCE_TYPE'> & {
      readonly cardInstanceId: CardInstanceId;
      readonly resourceId: ResourceId;
    })
  | ActionBase<'END_TURN'>;
