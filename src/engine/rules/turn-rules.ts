import type { GameAction } from '../core/actions';
import { acceptAction, rejectAction } from '../core/dispatch-result';
import type { DispatchResult } from '../core/dispatch-result';
import type { GameEvent } from '../core/events';
import type { GameState } from '../core/game-state';
import { orderedPlayerIds } from './setup-rules';
import { rollNumericDice } from './dice-rules';
import { resolveProduction } from './production-rules';
import { createDiscardQueue } from './robber-rules';
import { cancelOpenTradeOffers } from './trade-rules';
import { calculateScore } from './scoring-rules';

export interface RollDiceOptions {
  readonly skipSevenDiscards?: boolean;
}

export function rollDice(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'ROLL_DICE' }>,
  options: RollDiceOptions = {},
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
  let balancedDice = state.balancedDice;
  let dice: readonly [number, number];
  do {
    const rolled = rollNumericDice({ ...state, random: nextRandom, balancedDice });
    dice = rolled.dice;
    nextRandom = rolled.random;
    balancedDice = rolled.balancedDice;
  } while (
    !state.config.rules.robberFlowEnabled &&
    dice[0] + dice[1] === state.config.rules.dice.robberTotal
  );
  const total = dice[0] + dice[1];
  const events: GameEvent[] = [{ type: 'DICE_ROLLED', playerId: action.actorId, dice }];

  if (total === state.config.rules.dice.robberTotal) {
    const { queue, requiredCounts } = options.skipSevenDiscards
      ? { queue: [], requiredCounts: {} }
      : createDiscardQueue(state);
    events.push({
      type: 'ROBBER_SEQUENCE_STARTED',
      playerId: action.actorId,
      discardPlayerIds: queue,
    });

    const nextState: GameState = {
      ...state,
      random: nextRandom,
      balancedDice,
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
    balancedDice,
    turn: { ...state.turn, dice, phase: 'ACTION_PHASE' },
  };
  return acceptAction(state, action, nextState, events);
}

export interface TurnAdvanceResolution {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export function advanceTurn(
  state: GameState,
  currentPlayerId: NonNullable<GameState['turn']['activePlayerId']>,
): TurnAdvanceResolution | null {
  const playerIds = orderedPlayerIds(state);
  const currentIndex = playerIds.indexOf(currentPlayerId);
  const nextPlayerId = playerIds[(currentIndex + 1) % playerIds.length];
  if (currentIndex < 0 || nextPlayerId === undefined) return null;

  const nextTurnNumber = state.turn.turnNumber + 1;
  const cancelledTrades = cancelOpenTradeOffers(state, currentPlayerId);
  const nextPlayerScore = calculateScore(state, nextPlayerId);
  const winsAtTurnStart = nextPlayerScore >= state.config.victoryTarget;
  const events: GameEvent[] = [
    ...cancelledTrades.events,
    { type: 'TURN_ENDED', playerId: currentPlayerId },
    { type: 'TURN_STARTED', playerId: nextPlayerId, turnNumber: nextTurnNumber },
    ...(winsAtTurnStart
      ? ([{ type: 'GAME_WON', playerId: nextPlayerId, score: nextPlayerScore }] as const)
      : []),
  ];
  const players =
    state.kn === null
      ? state.players
      : Object.fromEntries(
          Object.entries(state.players).map(([playerId, player]) => [
            playerId,
            playerId === currentPlayerId
              ? { ...player, craneDiscountAvailable: false, merchantFleetGoodId: null }
              : player,
          ]),
        );
  return {
    events,
    state: {
      ...state,
      players,
      tradeOffers: cancelledTrades.tradeOffers,
      pendingInteraction: null,
      turn: {
        ...state.turn,
        activePlayerId: nextPlayerId,
        turnNumber: nextTurnNumber,
        phase: winsAtTurnStart ? 'GAME_OVER' : 'WAITING_FOR_ROLL',
        dice: null,
        knDice: null,
        cardsPlayedThisTurn: 0,
        cardIdsBoughtThisTurn: [],
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      winnerId: winsAtTurnStart ? nextPlayerId : state.winnerId,
      kn:
        state.kn === null
          ? null
          : {
              ...state.kn,
              eventDieResult: null,
              redDieResult: null,
              regularDieResult: null,
              pendingRoll: null,
            },
    },
  };
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
  const activePlayer = state.players[action.actorId];
  if (state.kn !== null && (activePlayer?.knProgressCardIds.length ?? 0) > 4) {
    const nextState: GameState = {
      ...state,
      turn: { ...state.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: action.actorId,
        purpose: 'PROGRESS_DISCARD',
        eligibleIds: activePlayer?.knProgressCardIds ?? [],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [action.actorId],
        canCancel: false,
        context: { endTurnDiscard: true },
      },
    };
    return acceptAction(state, action, nextState, []);
  }

  const advanced = advanceTurn(state, action.actorId);
  if (advanced === null) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'The active player is outside the turn order.');
  }
  return acceptAction(state, action, advanced.state, advanced.events);
}
