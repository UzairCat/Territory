import type { GameAction } from './actions';
import type { RuleError, RuleErrorCode } from './errors';
import type { GameEvent } from './events';
import type { GameState } from './game-state';

export type DispatchResult =
  | {
      readonly ok: true;
      readonly state: GameState;
      readonly events: readonly GameEvent[];
    }
  | {
      readonly ok: false;
      readonly state: GameState;
      readonly events: readonly [];
      readonly error: RuleError;
    };

function reject(
  state: GameState,
  code: RuleErrorCode,
  message: string,
): Extract<DispatchResult, { readonly ok: false }> {
  return {
    ok: false,
    state,
    events: [],
    error: { code, message },
  };
}

/**
 * The sole public mutation boundary for authoritative match state.
 *
 * Phase 1 deliberately exposes the complete boundary while gameplay handlers
 * arrive in later phases. Unsupported actions are typed rejections and never
 * partially mutate state.
 */
export function dispatch(state: GameState, action: GameAction): DispatchResult {
  if (state.turn.phase === 'GAME_OVER') {
    return reject(
      state,
      'GAME_ALREADY_OVER',
      'No gameplay actions are accepted after the match ends.',
    );
  }

  return reject(
    state,
    'ACTION_NOT_IMPLEMENTED',
    `${action.type} is defined but will be implemented in its gameplay phase.`,
  );
}
