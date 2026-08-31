import type { GameAction } from './actions';
import type { RuleError, RuleErrorCode } from './errors';
import type { GameEvent } from './events';
import type { GameState } from './game-state';

export const ACTION_DIAGNOSTIC_HISTORY_LIMIT = 256;

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

export function rejectAction(
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

export function acceptAction(
  previousState: GameState,
  action: GameAction,
  nextState: GameState,
  events: readonly GameEvent[],
): Extract<DispatchResult, { readonly ok: true }> {
  const sequence = previousState.actionSequence + 1;
  return {
    ok: true,
    state: {
      ...nextState,
      actionSequence: sequence,
      actionHistory: [
        ...previousState.actionHistory,
        {
          sequence,
          actionType: action.type,
          actorId: action.actorId,
          turnNumber: previousState.turn.turnNumber,
          eventTypes: events.map((event) => event.type),
        },
      ].slice(-ACTION_DIAGNOSTIC_HISTORY_LIMIT),
    },
    events,
  };
}
