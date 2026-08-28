import { HAND_GOODS } from '../content/commodities';
import { resourceBundle } from '../content/types';
import type { GameAction } from '../core/actions';
import { rejectAction } from '../core/dispatch-result';
import type { DispatchResult } from '../core/dispatch-result';
import type { GameState } from '../core/game-state';
import { randomInteger } from '../core/random';
import {
  discardResources,
  getEligibleStealTargetIds,
  getValidRobberHexIds,
  moveRobber,
  stealFromPlayer,
} from './robber-rules';
import {
  getLegalSetupHouseVertexIds,
  getLegalSetupRoadEdgeIds,
  placeSetupHouse,
  placeSetupRoad,
} from './setup-rules';
import { endTurn, rollDice, type RollDiceOptions } from './turn-rules';
import { rollKNDice } from './kn-turn-rules';
import { resolveKNSelection } from './kn-selection-rules';
import { playerHand } from './resource-rules';

function markTimeout(result: DispatchResult): DispatchResult {
  if (!result.ok) return result;
  const last = result.state.actionHistory.at(-1);
  if (last === undefined) return result;
  return {
    ...result,
    state: {
      ...result.state,
      actionHistory: [
        ...result.state.actionHistory.slice(0, -1),
        { ...last, actionType: 'AUTO_TIMEOUT' },
      ],
    },
  };
}

function chooseRandom<T>(
  state: GameState,
  values: readonly T[],
): { readonly state: GameState; readonly value: T } | null {
  if (values.length === 0) return null;
  const chosen = randomInteger(state.random, 0, values.length);
  const value = values[chosen.value];
  return value === undefined ? null : { state: { ...state, random: chosen.state }, value };
}

function automaticDiscard(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'AUTO_TIMEOUT' }>,
): DispatchResult {
  const interaction = state.pendingInteraction;
  if (interaction?.type !== 'DISCARD_RESOURCES') {
    return rejectAction(
      state,
      'PENDING_INTERACTION_REQUIRED',
      'No automatic discard is currently required.',
    );
  }
  const playerId = interaction.queue[0];
  const player = playerId === undefined ? undefined : state.players[playerId];
  const required = playerId === undefined ? undefined : interaction.requiredCounts[playerId];
  if (playerId === undefined || player === undefined || required === undefined) {
    return rejectAction(state, 'INVALID_DISCARD', 'The automatic discard could not be resolved.');
  }
  const hand = playerHand(player);
  const pool = HAND_GOODS.flatMap((resource) =>
    Array.from({ length: hand[resource.id] ?? 0 }, () => resource.id),
  );
  let randomState = state.random;
  const selected = new Map<(typeof HAND_GOODS)[number]['id'], number>();
  for (let index = 0; index < required; index += 1) {
    if (pool.length === 0) {
      return rejectAction(
        state,
        'INVALID_DISCARD',
        'The automatic discard could not find enough cards.',
      );
    }
    const draw = randomInteger(randomState, 0, pool.length);
    randomState = draw.state;
    const resourceId = pool.splice(draw.value, 1)[0];
    if (resourceId === undefined) continue;
    selected.set(resourceId, (selected.get(resourceId) ?? 0) + 1);
  }
  return markTimeout(
    discardResources(
      { ...state, random: randomState },
      {
        id: action.id,
        type: 'DISCARD_RESOURCES',
        actorId: playerId,
        resources: resourceBundle([...selected.entries()]),
      },
    ),
  );
}

function automaticKNSelection(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'AUTO_TIMEOUT' }>,
): DispatchResult {
  const interaction = state.pendingInteraction;
  if (interaction?.type !== 'KN_SELECTION') {
    return rejectAction(
      state,
      'PENDING_INTERACTION_REQUIRED',
      'No automatic K+N choice is currently required.',
    );
  }
  if (interaction.playerId !== action.actorId) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'The timed choice belongs to another player.');
  }

  if (interaction.purpose === 'ALCHEMIST_DICE') {
    const regularOptions = interaction.eligibleIds.filter((id) => id.startsWith('regular:'));
    const redOptions = interaction.eligibleIds.filter((id) => id.startsWith('red:'));
    const regular = chooseRandom(state, regularOptions);
    const red = regular === null ? null : chooseRandom(regular.state, redOptions);
    if (regular === null || red === null) {
      return rejectAction(state, 'INVALID_TARGET', 'The Alchemist dice could not be selected.');
    }
    return markTimeout(
      resolveKNSelection(red.state, {
        id: action.id,
        type: 'RESOLVE_PROGRESS_SELECTION',
        actorId: interaction.playerId,
        selections: [regular.value, red.value],
      }),
    );
  }

  const handOwnerId =
    interaction.purpose === 'MASTER_MERCHANT_CARDS'
      ? (interaction.context.targetPlayerId as string | undefined)
      : [
            'COMMERCIAL_HARBOR_RESOURCE',
            'COMMERCIAL_HARBOR_COMMODITY',
            'SABOTEUR_DISCARD',
            'WEDDING_CARDS',
          ].includes(interaction.purpose)
        ? interaction.playerId
        : undefined;
  const handOwner = handOwnerId === undefined ? undefined : state.players[handOwnerId];
  const pool =
    handOwner === undefined
      ? [...interaction.eligibleIds]
      : HAND_GOODS.flatMap((good) =>
          interaction.eligibleIds.includes(good.id)
            ? Array.from({ length: playerHand(handOwner)[good.id] ?? 0 }, () => good.id)
            : [],
        );
  const required = Math.max(1, interaction.minimumSelections);
  if (pool.length < required) {
    return rejectAction(
      state,
      'INVALID_TARGET',
      'The timed choice could not find enough legal cards or targets.',
    );
  }

  let randomState = state.random;
  const selections: string[] = [];
  for (let index = 0; index < required; index += 1) {
    const draw = randomInteger(randomState, 0, pool.length);
    randomState = draw.state;
    const selected = pool.splice(draw.value, 1)[0];
    if (selected !== undefined) selections.push(selected);
  }
  return markTimeout(
    resolveKNSelection(
      { ...state, random: randomState },
      {
        id: action.id,
        type: 'RESOLVE_PROGRESS_SELECTION',
        actorId: interaction.playerId,
        selections,
      },
    ),
  );
}

export function resolveTimeout(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'AUTO_TIMEOUT' }>,
  options: RollDiceOptions = {},
): DispatchResult {
  if (state.turn.phase === 'SETUP_PLACE_HOUSE') {
    const selected = chooseRandom(state, getLegalSetupHouseVertexIds(state));
    if (selected === null) {
      return rejectAction(state, 'INVALID_TARGET', 'No legal automatic setup building remains.');
    }
    return markTimeout(
      placeSetupHouse(selected.state, {
        id: action.id,
        type: 'PLACE_SETUP_HOUSE',
        actorId: action.actorId,
        vertexId: selected.value,
      }),
    );
  }

  if (state.turn.phase === 'SETUP_PLACE_ROAD') {
    const selected = chooseRandom(state, getLegalSetupRoadEdgeIds(state));
    if (selected === null) {
      return rejectAction(state, 'INVALID_TARGET', 'No legal automatic setup Road remains.');
    }
    return markTimeout(
      placeSetupRoad(selected.state, {
        id: action.id,
        type: 'PLACE_SETUP_ROAD',
        actorId: action.actorId,
        edgeId: selected.value,
      }),
    );
  }

  if (state.turn.phase === 'WAITING_FOR_ROLL') {
    return markTimeout(
      state.kn === null
        ? rollDice(state, { id: action.id, type: 'ROLL_DICE', actorId: action.actorId }, options)
        : rollKNDice(
            state,
            { id: action.id, type: 'ROLL_KN_DICE', actorId: action.actorId },
            undefined,
            options,
          ),
    );
  }

  if (state.turn.phase === 'ACTION_PHASE') {
    return markTimeout(
      endTurn(state, { id: action.id, type: 'END_TURN', actorId: action.actorId }),
    );
  }

  if (state.turn.phase === 'DISCARD_RESOURCES') return automaticDiscard(state, action);

  if (state.turn.phase === 'CARD_RESOLUTION' && state.pendingInteraction?.type === 'KN_SELECTION') {
    const interaction = state.pendingInteraction;
    if (
      interaction.sourceCardId !== undefined &&
      interaction.canCancel &&
      interaction.context.committed !== true
    ) {
      const cancelled = resolveKNSelection(state, {
        id: action.id,
        type: 'RESOLVE_PROGRESS_SELECTION',
        actorId: interaction.playerId,
        selections: [],
        cancelled: true,
      });
      if (!cancelled.ok) return cancelled;
      const restoredState: GameState = {
        ...cancelled.state,
        actionHistory: state.actionHistory,
      };
      return markTimeout(
        endTurn(restoredState, {
          id: action.id,
          type: 'END_TURN',
          actorId: action.actorId,
        }),
      );
    }
    return automaticKNSelection(state, action);
  }

  if (state.turn.phase === 'MOVE_ROBBER') {
    const legal = getValidRobberHexIds(state, action.actorId);
    const opponentTiles = legal.filter((hexId) =>
      Object.values(state.players).some(
        (player) =>
          player.id !== action.actorId &&
          state.board.hexes[hexId]?.vertexIds.some(
            (vertexId) => state.board.vertices[vertexId]?.building?.ownerId === player.id,
          ),
      ),
    );
    const selected = chooseRandom(state, opponentTiles.length > 0 ? opponentTiles : legal);
    if (selected === null) {
      return rejectAction(
        state,
        'INVALID_TARGET',
        'No legal automatic robber destination remains.',
      );
    }
    const moved = moveRobber(selected.state, {
      id: action.id,
      type: 'MOVE_ROBBER',
      actorId: action.actorId,
      hexId: selected.value,
    });
    if (!moved.ok || moved.state.turn.phase !== 'CHOOSE_STEAL_TARGET') return markTimeout(moved);
    const eligible = getEligibleStealTargetIds(moved.state, action.actorId, selected.value);
    const target = chooseRandom(moved.state, eligible);
    if (target === null) return markTimeout(moved);
    const stolen = stealFromPlayer(target.state, {
      id: action.id,
      type: 'STEAL_FROM_PLAYER',
      actorId: action.actorId,
      targetPlayerId: target.value,
    });
    return !stolen.ok
      ? markTimeout(moved)
      : markTimeout({ ...stolen, events: [...moved.events, ...stolen.events] });
  }

  if (state.turn.phase === 'CHOOSE_STEAL_TARGET') {
    const robberHexId = state.board.robberHexId;
    const eligible =
      robberHexId === null ? [] : getEligibleStealTargetIds(state, action.actorId, robberHexId);
    const target = chooseRandom(state, eligible);
    if (target === null) {
      return rejectAction(state, 'INVALID_STEAL_TARGET', 'No automatic steal target is available.');
    }
    return markTimeout(
      stealFromPlayer(target.state, {
        id: action.id,
        type: 'STEAL_FROM_PLAYER',
        actorId: action.actorId,
        targetPlayerId: target.value,
      }),
    );
  }

  return rejectAction(
    state,
    'WRONG_PHASE',
    'The current mandatory interaction does not use a timer.',
  );
}
