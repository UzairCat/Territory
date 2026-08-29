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
import type { BoardState } from '../core/game-state';
import type { HexId, PlayerId } from '../core/ids';
import type { RandomState } from '../core/random';
import { randomInteger } from '../core/random';

export interface RollDiceOptions {
  readonly skipSevenDiscards?: boolean;
  readonly ignoreRobber?: boolean;
  readonly discardExemptPlayerIds?: readonly PlayerId[];
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
    if (options.ignoreRobber === true) {
      return acceptAction(
        state,
        action,
        {
          ...state,
          random: nextRandom,
          balancedDice,
          turn: { ...state.turn, dice, phase: 'ACTION_PHASE' },
          pendingInteraction: null,
        },
        events,
      );
    }
    const { queue, requiredCounts } = options.skipSevenDiscards
      ? { queue: [], requiredCounts: {} }
      : createDiscardQueue(state, options.discardExemptPlayerIds);
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

function selectMadnessTargets(
  board: BoardState,
  random: RandomState,
): { readonly hexIds: readonly [HexId, HexId] | null; readonly random: RandomState } {
  const numbered = Object.values(board.hexes).filter((hex) => hex.numberToken !== null);
  if (numbered.length < 2) return { hexIds: null, random };
  const firstRoll = randomInteger(random, 0, numbered.length);
  const first = numbered[firstRoll.value]!;
  const different = numbered.filter(
    (hex) => hex.id !== first.id && hex.numberToken !== first.numberToken,
  );
  const alternatives =
    different.length > 0 ? different : numbered.filter((hex) => hex.id !== first.id);
  const secondRoll = randomInteger(firstRoll.state, 0, alternatives.length);
  return { hexIds: [first.id, alternatives[secondRoll.value]!.id], random: secondRoll.state };
}

function advanceInventorsMadness(state: GameState): {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
} {
  if (state.inventorsMadness === null) return { state, events: [] };
  let board = state.board;
  const events: GameEvent[] = [];
  const pending = state.inventorsMadness.pendingHexIds;
  if (pending !== null) {
    const first = board.hexes[pending[0]];
    const second = board.hexes[pending[1]];
    if (
      first !== undefined &&
      second !== undefined &&
      first.numberToken !== null &&
      second.numberToken !== null
    ) {
      board = {
        ...board,
        hexes: {
          ...board.hexes,
          [first.id]: { ...first, numberToken: second.numberToken },
          [second.id]: { ...second, numberToken: first.numberToken },
        },
      };
      events.push({ type: 'INVENTORS_MADNESS_SWAPPED', hexIds: pending });
    }
  }
  const selected = selectMadnessTargets(board, state.random);
  if (selected.hexIds !== null) {
    events.push({ type: 'INVENTORS_MADNESS_TARGETS_SELECTED', hexIds: selected.hexIds });
  }
  return {
    state: {
      ...state,
      board,
      random: selected.random,
      inventorsMadness: { pendingHexIds: selected.hexIds },
    },
    events,
  };
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
  const roundEnded = currentIndex === playerIds.length - 1;
  const madness = roundEnded
    ? advanceInventorsMadness({ ...state, tradeOffers: cancelledTrades.tradeOffers })
    : { state: { ...state, tradeOffers: cancelledTrades.tradeOffers }, events: [] };
  const nextPlayerScore = calculateScore(madness.state, nextPlayerId);
  const winsAtTurnStart = nextPlayerScore >= state.config.victoryTarget;
  const events: GameEvent[] = [
    ...cancelledTrades.events,
    { type: 'TURN_ENDED', playerId: currentPlayerId },
    ...madness.events,
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
      ...madness.state,
      players,
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
