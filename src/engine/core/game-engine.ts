import { placeSetupHouse, placeSetupRoad } from '../rules/setup-rules';
import type { GameAction } from './actions';
import { rejectAction } from './dispatch-result';
import type { DispatchResult } from './dispatch-result';
import type { GameState } from './game-state';

export type { DispatchResult } from './dispatch-result';

/**
 * The sole public mutation boundary for authoritative match state.
 *
 * Gameplay handlers are introduced one phase at a time. Unsupported actions
 * remain typed rejections and never partially mutate state.
 */
export function dispatch(state: GameState, action: GameAction): DispatchResult {
  if (state.turn.phase === 'GAME_OVER') {
    return rejectAction(
      state,
      'GAME_ALREADY_OVER',
      'No gameplay actions are accepted after the match ends.',
    );
  }

  if (action.type === 'PLACE_SETUP_HOUSE') return placeSetupHouse(state, action);
  if (action.type === 'PLACE_SETUP_ROAD') return placeSetupRoad(state, action);

  return rejectAction(
    state,
    'ACTION_NOT_IMPLEMENTED',
    `${action.type} is defined but will be implemented in its gameplay phase.`,
  );
}
