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
  return {
    ok: true,
    state: {
      ...nextState,
      actionHistory: [
        ...previousState.actionHistory,
        {
          actionType: action.type,
          actorId: action.actorId,
          turnNumber: previousState.turn.turnNumber,
          eventTypes: events.map((event) => event.type),
        },
      ],
    },
    events,
  };
}
