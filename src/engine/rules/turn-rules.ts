import { RESOURCES } from '../content/resources';
import type { GameAction } from '../core/actions';
import { acceptAction, rejectAction } from '../core/dispatch-result';
import type { DispatchResult } from '../core/dispatch-result';
import type { GameEvent } from '../core/events';
import type { GameState } from '../core/game-state';
import { randomInteger } from '../core/random';
import { orderedPlayerIds } from './setup-rules';
import { resolveProduction } from './production-rules';

function playerResourceCount(state: GameState, playerId: string): number {
  const player = state.players[playerId];
  if (player === undefined) return 0;
  return RESOURCES.reduce((total, resource) => total + (player.resources[resource.id] ?? 0), 0);
}

export function rollDice(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'ROLL_DICE' }>,
): DispatchResult {
  if (state.turn.activePlayerId !== action.actorId) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'Only the active player can roll the dice.');
  }
  if (state.turn.phase !== 'WAITING_FOR_ROLL') {
    return state.turn.dice === null
      ? rejectAction(state, 'WRONG_PHASE', 'Dice can only be rolled at the start of a normal turn.')
      : rejectAction(state, 'DICE_ALREADY_ROLLED', 'The dice have already been rolled this turn.');
  }

  let nextRandom = state.random;
  let dice: readonly [number, number];
  do {
    const first = randomInteger(nextRandom, 1, state.config.rules.dice.sides + 1);
    const second = randomInteger(first.state, 1, state.config.rules.dice.sides + 1);
    dice = [first.value, second.value];
    nextRandom = second.state;
  } while (
    !state.config.rules.robberFlowEnabled &&
    dice[0] + dice[1] === state.config.rules.dice.robberTotal
  );
  const total = dice[0] + dice[1];
  const events: GameEvent[] = [{ type: 'DICE_ROLLED', playerId: action.actorId, dice }];

  if (total === state.config.rules.dice.robberTotal) {
    const requiredCounts: Record<string, number> = {};
    const queue = orderedPlayerIds(state).filter((playerId) => {
      const count = playerResourceCount(state, playerId);
      if (count <= state.config.rules.discardThreshold) return false;
      requiredCounts[playerId] = Math.floor(count / 2);
      return true;
    });
    events.push({
      type: 'ROBBER_SEQUENCE_STARTED',
      playerId: action.actorId,
      discardPlayerIds: queue,
    });

    const nextState: GameState = {
      ...state,
      random: nextRandom,
      turn: { ...state.turn, dice, phase: queue.length > 0 ? 'DISCARD_RESOURCES' : 'MOVE_ROBBER' },
      pendingInteraction:
        queue.length > 0
          ? { type: 'DISCARD_RESOURCES', queue, requiredCounts }
          : { type: 'MOVE_ROBBER', playerId: action.actorId },
    };
    return acceptAction(state, action, nextState, events);
  }

  const production = resolveProduction(state, total);
  events.push({
    type: 'RESOURCES_PRODUCED',
    source: 'DICE',
    rollTotal: total,
    grants: production.grants,
    unavailableResourceIds: production.unavailableResourceIds,
  });
  const nextState: GameState = {
    ...state,
    players: production.players,
    bank: production.bank,
    random: nextRandom,
    turn: { ...state.turn, dice, phase: 'ACTION_PHASE' },
  };
  return acceptAction(state, action, nextState, events);
}

export function endTurn(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'END_TURN' }>,
): DispatchResult {
  if (state.turn.activePlayerId !== action.actorId) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'Only the active player can end this turn.');
  }
  if (state.turn.phase === 'WAITING_FOR_ROLL') {
    return rejectAction(state, 'DICE_ROLL_REQUIRED', 'Roll the dice before ending the turn.');
  }
  if (state.turn.phase !== 'ACTION_PHASE') {
    return rejectAction(state, 'WRONG_PHASE', 'The turn cannot end during the current phase.');
  }

  const playerIds = orderedPlayerIds(state);
  const currentIndex = playerIds.indexOf(action.actorId);
  const nextPlayerId = playerIds[(currentIndex + 1) % playerIds.length];
  if (currentIndex < 0 || nextPlayerId === undefined) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'The active player is outside the turn order.');
  }
  const nextTurnNumber = state.turn.turnNumber + 1;
  const events: GameEvent[] = [
    { type: 'TURN_ENDED', playerId: action.actorId },
    { type: 'TURN_STARTED', playerId: nextPlayerId, turnNumber: nextTurnNumber },
  ];
  const nextState: GameState = {
    ...state,
    pendingInteraction: null,
    turn: {
      ...state.turn,
      activePlayerId: nextPlayerId,
      turnNumber: nextTurnNumber,
      phase: 'WAITING_FOR_ROLL',
      dice: null,
      cardsPlayedThisTurn: 0,
      cardIdsBoughtThisTurn: [],
      setupPlacementIndex: null,
      setupPlacementVertexId: null,
    },
  };
  return acceptAction(state, action, nextState, events);
}
