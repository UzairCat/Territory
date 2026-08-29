import { buildHouse, buildRoad, upgradeMansion } from '../rules/build-rules';
import {
  buyProgressCard,
  placeFreeRoad,
  playProgressCard,
  selectCardResources,
  selectCardResourceType,
} from '../rules/progress-card-rules';
import { discardResources, moveRobber, stealFromPlayer } from '../rules/robber-rules';
import { resolveScoring } from '../rules/scoring-rules';
import { placeSetupHouse, placeSetupRoad } from '../rules/setup-rules';
import {
  bankTrade,
  cancelTrade,
  confirmTrade,
  createTradeOffer,
  expireTrade,
  respondToTrade,
} from '../rules/trade-rules';
import { endTurn, rollDice } from '../rules/turn-rules';
import { resolveTimeout } from '../rules/timeout-rules';
import { rollKNDice } from '../rules/kn-turn-rules';
import {
  activateKnight,
  buildKnight,
  buildWall,
  buyImprovement,
  chaseRobber,
  displaceKnight,
  moveKnight,
  upgradeKnight,
} from '../rules/kn-construction-rules';
import { playAlchemist, playKNProgressCard } from '../rules/kn-progress-card-rules';
import { resolveKNSelection } from '../rules/kn-selection-rules';
import type { GameAction } from './actions';
import { rejectAction } from './dispatch-result';
import type { DispatchResult } from './dispatch-result';
import type { GameState } from './game-state';
import type { PlayerId } from './ids';

export type { DispatchResult } from './dispatch-result';

export interface DispatchOptions {
  readonly skipSevenDiscards?: boolean;
  readonly ignoreRobber?: boolean;
  readonly discardExemptPlayerIds?: readonly PlayerId[];
}

function actionCanChangeScore(action: GameAction): boolean {
  return (
    action.type === 'BUILD_ROAD' ||
    action.type === 'BUILD_HOUSE' ||
    action.type === 'UPGRADE_MANSION' ||
    action.type === 'BUY_PROGRESS_CARD' ||
    action.type === 'PLAY_PROGRESS_CARD' ||
    action.type === 'SELECT_CARD_RESOURCES' ||
    action.type === 'SELECT_CARD_RESOURCE_TYPE' ||
    action.type === 'MOVE_ROBBER' ||
    action.type === 'STEAL_FROM_PLAYER' ||
    action.type === 'ROLL_DICE' ||
    action.type === 'ROLL_KN_DICE' ||
    action.type === 'AUTO_TIMEOUT' ||
    action.type === 'BUILD_KNIGHT' ||
    action.type === 'ACTIVATE_KNIGHT' ||
    action.type === 'UPGRADE_KNIGHT' ||
    action.type === 'MOVE_KNIGHT' ||
    action.type === 'DISPLACE_KNIGHT' ||
    action.type === 'CHASE_ROBBER' ||
    action.type === 'BUILD_WALL' ||
    action.type === 'BUY_IMPROVEMENT' ||
    action.type === 'PLAY_KN_PROGRESS_CARD' ||
    action.type === 'RESOLVE_PROGRESS_SELECTION' ||
    action.type === 'PLAY_ALCHEMIST' ||
    action.type === 'PLACE_OR_MOVE_MERCHANT'
  );
}

function finalizeAcceptedAction(
  previousState: GameState,
  action: GameAction,
  result: DispatchResult,
): DispatchResult {
  if (!result.ok || !actionCanChangeScore(action)) return result;

  const scoring = resolveScoring(previousState, result.state);
  if (scoring.events.length === 0) return { ...result, state: scoring.state };

  const events = [...result.events, ...scoring.events];
  const history = scoring.state.actionHistory;
  const lastEntry = history.at(-1);
  return {
    ok: true,
    events,
    state: {
      ...scoring.state,
      actionHistory:
        lastEntry === undefined
          ? history
          : [
              ...history.slice(0, -1),
              { ...lastEntry, eventTypes: events.map((event) => event.type) },
            ],
    },
  };
}

/**
 * The sole public mutation boundary for authoritative match state.
 *
 * Every v0.1 gameplay action is routed to a validating rule handler. Unknown
 * runtime payloads remain typed rejections and never partially mutate state.
 */
export function dispatch(
  state: GameState,
  action: GameAction,
  options: DispatchOptions = {},
): DispatchResult {
  if (state.turn.phase === 'GAME_OVER') {
    return rejectAction(
      state,
      'GAME_ALREADY_OVER',
      'No gameplay actions are accepted after the match ends.',
    );
  }

  let result: DispatchResult;
  if (action.type === 'PLACE_SETUP_HOUSE') result = placeSetupHouse(state, action);
  else if (action.type === 'PLACE_SETUP_ROAD') result = placeSetupRoad(state, action);
  else if (action.type === 'ROLL_DICE') {
    result =
      state.kn === null
        ? rollDice(state, action, options)
        : rollKNDice(state, action, undefined, options);
  } else if (action.type === 'ROLL_KN_DICE') {
    result = rollKNDice(state, action, undefined, options);
  } else if (action.type === 'PLAY_ALCHEMIST') result = playAlchemist(state, action, options);
  else if (action.type === 'DISCARD_RESOURCES') result = discardResources(state, action);
  else if (action.type === 'MOVE_ROBBER') result = moveRobber(state, action);
  else if (action.type === 'STEAL_FROM_PLAYER') result = stealFromPlayer(state, action);
  else if (action.type === 'BUILD_ROAD') {
    result =
      state.pendingInteraction?.type === 'PLACE_FREE_ROADS'
        ? placeFreeRoad(state, action)
        : buildRoad(state, action);
  } else if (action.type === 'BUILD_HOUSE') result = buildHouse(state, action);
  else if (action.type === 'UPGRADE_MANSION') result = upgradeMansion(state, action);
  else if (action.type === 'BUILD_KNIGHT') result = buildKnight(state, action);
  else if (action.type === 'ACTIVATE_KNIGHT') result = activateKnight(state, action);
  else if (action.type === 'UPGRADE_KNIGHT') result = upgradeKnight(state, action);
  else if (action.type === 'MOVE_KNIGHT') result = moveKnight(state, action);
  else if (action.type === 'DISPLACE_KNIGHT') result = displaceKnight(state, action);
  else if (action.type === 'CHASE_ROBBER') result = chaseRobber(state, action);
  else if (action.type === 'BUILD_WALL') result = buildWall(state, action);
  else if (action.type === 'BUY_IMPROVEMENT') result = buyImprovement(state, action);
  else if (action.type === 'BANK_TRADE') result = bankTrade(state, action);
  else if (action.type === 'CREATE_TRADE') result = createTradeOffer(state, action);
  else if (action.type === 'RESPOND_TO_TRADE') result = respondToTrade(state, action);
  else if (action.type === 'CONFIRM_TRADE') result = confirmTrade(state, action);
  else if (action.type === 'CANCEL_TRADE') result = cancelTrade(state, action);
  else if (action.type === 'EXPIRE_TRADE') result = expireTrade(state, action);
  else if (action.type === 'BUY_PROGRESS_CARD') result = buyProgressCard(state, action);
  else if (action.type === 'PLAY_PROGRESS_CARD') result = playProgressCard(state, action);
  else if (action.type === 'PLAY_KN_PROGRESS_CARD') result = playKNProgressCard(state, action);
  else if (action.type === 'RESOLVE_PROGRESS_SELECTION') result = resolveKNSelection(state, action);
  else if (action.type === 'PLACE_OR_MOVE_MERCHANT') {
    result = resolveKNSelection(state, {
      id: action.id,
      type: 'RESOLVE_PROGRESS_SELECTION',
      actorId: action.actorId,
      selections: [action.hexId],
    });
  } else if (action.type === 'SELECT_CARD_RESOURCES') result = selectCardResources(state, action);
  else if (action.type === 'SELECT_CARD_RESOURCE_TYPE') {
    result = selectCardResourceType(state, action);
  } else if (action.type === 'END_TURN') result = endTurn(state, action);
  else if (action.type === 'AUTO_TIMEOUT') result = resolveTimeout(state, action, options);
  else {
    return rejectAction(
      state,
      'UNKNOWN_ACTION',
      'The requested action is not available in this game version.',
    );
  }

  return finalizeAcceptedAction(state, action, result);
}
