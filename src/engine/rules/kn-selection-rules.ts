import { RESOURCES } from '../content/resources';
import { getKNProgressCardDefinition } from '../content/kn-progress-cards';
import { resourceBundle } from '../content/types';
import type { KNProgressFamily } from '../content/types';
import type { GameAction } from '../core/actions';
import { acceptAction, rejectAction } from '../core/dispatch-result';
import type { DispatchResult } from '../core/dispatch-result';
import type { GameEvent } from '../core/events';
import type { GameState, KnightState } from '../core/game-state';
import type { CardInstanceId, KnightId, PlayerId, ResourceId, VertexId } from '../core/ids';
import { addResourceBundles } from './resource-rules';
import { drawKNProgressCard, downgradeBarbarianCity, resolveKNNumber } from './kn-turn-rules';
import { placeMetropolis } from './kn-construction-rules';
import { resolveKNProgressCardSelection } from './kn-progress-card-rules';
import { advanceTurn } from './turn-rules';

function validSelectionCount(
  interaction: Extract<GameState['pendingInteraction'], { readonly type: 'KN_SELECTION' }>,
  selections: readonly string[],
): boolean {
  return (
    selections.length >= interaction.minimumSelections &&
    selections.length <= interaction.maximumSelections &&
    selections.every((selection) => interaction.eligibleIds.includes(selection))
  );
}

function continueAfterMandatoryQueue(state: GameState): {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
} {
  if (state.kn?.pendingRoll?.stage === 'NUMBER') return resolveKNNumber(state);
  return {
    state: {
      ...state,
      pendingInteraction: null,
      turn: { ...state.turn, phase: 'ACTION_PHASE' },
      kn: state.kn === null ? null : { ...state.kn, pendingRoll: null },
    },
    events: [],
  };
}

function nextQueueInteraction(
  state: GameState,
  queue: readonly PlayerId[],
  purpose: Extract<GameState['pendingInteraction'], { readonly type: 'KN_SELECTION' }>['purpose'],
  eligibleIdsFor: (playerId: PlayerId) => readonly string[],
  context: Readonly<
    Record<
      string,
      string | number | boolean | null | readonly string[] | Readonly<Record<string, number>>
    >
  > = {},
): GameState | null {
  const nextQueue = queue.slice(1);
  const nextPlayerId = nextQueue[0];
  if (nextPlayerId === undefined) return null;
  return {
    ...state,
    turn: { ...state.turn, phase: 'CARD_RESOLUTION' },
    pendingInteraction: {
      type: 'KN_SELECTION',
      playerId: nextPlayerId,
      purpose,
      eligibleIds: eligibleIdsFor(nextPlayerId),
      minimumSelections: 1,
      maximumSelections: 1,
      queue: nextQueue,
      canCancel: false,
      context,
    },
  };
}

function discardKNProgressCard(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: CardInstanceId,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const kn = state.kn;
  const player = state.players[playerId];
  const card = kn?.progressCards[cardInstanceId];
  const definition =
    card === undefined ? undefined : getKNProgressCardDefinition(card.definitionId);
  if (
    kn === null ||
    kn === undefined ||
    player === undefined ||
    card === undefined ||
    definition === undefined
  ) {
    return { state, events: [] };
  }
  return {
    state: {
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...player,
          knProgressCardIds: player.knProgressCardIds.filter((id) => id !== cardInstanceId),
        },
      },
      kn: {
        ...kn,
        progressCards: {
          ...kn.progressCards,
          [cardInstanceId]: { ...card, ownerId: null, playedTurn: state.turn.turnNumber },
        },
        progressDecks: {
          ...kn.progressDecks,
          [definition.family]: [...kn.progressDecks[definition.family], cardInstanceId],
        },
      },
    },
    events: [
      {
        type: 'KN_PROGRESS_CARD_DISCARDED',
        playerId,
        family: definition.family,
        cardInstanceId,
      },
    ],
  };
}

export function resolveKNSelection(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'RESOLVE_PROGRESS_SELECTION' }>,
): DispatchResult {
  const interaction = state.pendingInteraction;
  if (state.kn === null || interaction?.type !== 'KN_SELECTION') {
    return rejectAction(
      state,
      'PENDING_INTERACTION_REQUIRED',
      'No K+N selection is currently pending.',
    );
  }
  const actorCanResolve =
    interaction.playerId === action.actorId ||
    (interaction.simultaneous === true && interaction.queue.includes(action.actorId));
  if (!actorCanResolve) {
    return rejectAction(
      state,
      'NOT_YOUR_TURN',
      'Pass the device to the player named in this choice.',
    );
  }
  if (action.cancelled === true) {
    if (!interaction.canCancel) {
      return rejectAction(
        state,
        'PENDING_INTERACTION_REQUIRED',
        'This mandatory choice cannot be cancelled.',
      );
    }
    const cancelled = resolveKNProgressCardSelection(state, action, true);
    return cancelled.ok
      ? acceptAction(state, action, cancelled.state, cancelled.events)
      : cancelled;
  }
  if (!validSelectionCount(interaction, action.selections)) {
    return rejectAction(state, 'INVALID_TARGET', 'Choose only the highlighted legal option(s).');
  }
  const selected = action.selections[0];
  if (selected === undefined) {
    return rejectAction(state, 'INVALID_TARGET', 'Choose a valid option.');
  }
  let nextState = state;
  const events: GameEvent[] = [];

  if (interaction.purpose === 'AQUEDUCT_RESOURCE') {
    const resourceId = selected as ResourceId;
    const player = state.players[action.actorId];
    if (
      player === undefined ||
      !RESOURCES.some((resource) => resource.id === resourceId) ||
      (state.bank[resourceId] ?? 0) < 1
    ) {
      return rejectAction(
        state,
        'INSUFFICIENT_BANK_RESOURCES',
        'That resource is no longer available.',
      );
    }
    const card = resourceBundle([[resourceId, 1]]);
    nextState = {
      ...state,
      players: {
        ...state.players,
        [action.actorId]: { ...player, resources: addResourceBundles(player.resources, card) },
      },
      bank: resourceBundle(
        RESOURCES.map((resource) => [
          resource.id,
          (state.bank[resource.id] ?? 0) - (resource.id === resourceId ? 1 : 0),
        ]),
      ),
    };
    events.push({ type: 'AQUEDUCT_RESOURCE_CHOSEN', playerId: action.actorId, resourceId });
    const remainingQueue = interaction.simultaneous
      ? interaction.queue.filter((playerId) => playerId !== action.actorId)
      : interaction.queue.slice(1);
    const availableResourceIds = RESOURCES.filter(
      (resource) => (nextState.bank[resource.id] ?? 0) > 0,
    ).map((resource) => resource.id);
    const nextPlayerId = remainingQueue[0];
    if (nextPlayerId !== undefined && availableResourceIds.length > 0) {
      nextState = {
        ...nextState,
        turn: { ...nextState.turn, phase: 'CARD_RESOLUTION' },
        pendingInteraction: {
          ...interaction,
          playerId: nextPlayerId,
          eligibleIds: availableResourceIds,
          queue: remainingQueue,
        },
      };
    } else {
      nextState = {
        ...nextState,
        pendingInteraction: null,
        turn: { ...nextState.turn, phase: 'ACTION_PHASE' },
        kn: { ...nextState.kn!, pendingRoll: null },
      };
    }
  } else if (interaction.purpose === 'BARBARIAN_CITY_LOSS') {
    const downgraded = downgradeBarbarianCity(state, action.actorId, selected as VertexId);
    nextState = downgraded.state;
    events.push(...downgraded.events);
    const queued = nextQueueInteraction(
      nextState,
      interaction.queue,
      interaction.purpose,
      (playerId) =>
        Object.values(nextState.board.vertices)
          .filter(
            (vertex) =>
              vertex.building?.ownerId === playerId &&
              vertex.building.type === 'MANSION' &&
              (vertex.building.metropolis === null || vertex.building.metropolis === undefined),
          )
          .map((vertex) => vertex.id),
    );
    if (queued !== null) nextState = queued;
    else {
      const continued = continueAfterMandatoryQueue({ ...nextState, pendingInteraction: null });
      nextState = continued.state;
      events.push(...continued.events);
    }
  } else if (interaction.purpose === 'DEFENDER_TIE_DECK') {
    const family = selected as KNProgressFamily;
    if (!['SCIENCE', 'TRADE', 'POLITICS'].includes(family)) {
      return rejectAction(state, 'INVALID_TARGET', 'Choose one of the three Progress decks.');
    }
    const drawn = drawKNProgressCard(state, action.actorId, family);
    nextState = drawn.state;
    events.push(...drawn.events);
    const remainingDefenderQueue = interaction.simultaneous
      ? interaction.queue.filter((playerId) => playerId !== action.actorId)
      : interaction.queue.slice(1);
    const pendingDiscardIds = [
      ...((interaction.context.pendingProgressDiscardIds as readonly PlayerId[] | undefined) ?? []),
      ...(action.actorId !== state.turn.activePlayerId &&
      (nextState.players[action.actorId]?.knProgressCardIds.length ?? 0) > 4
        ? [action.actorId]
        : []),
    ];
    if (interaction.simultaneous === true && remainingDefenderQueue[0] !== undefined) {
      nextState = {
        ...nextState,
        turn: { ...nextState.turn, phase: 'CARD_RESOLUTION' },
        pendingInteraction: {
          ...interaction,
          playerId: remainingDefenderQueue[0],
          queue: remainingDefenderQueue,
          context: { ...interaction.context, pendingProgressDiscardIds: pendingDiscardIds },
        },
      };
    } else if (pendingDiscardIds[0] !== undefined) {
      const firstDiscardPlayerId = pendingDiscardIds[0];
      nextState = {
        ...nextState,
        turn: { ...nextState.turn, phase: 'CARD_RESOLUTION' },
        pendingInteraction: {
          type: 'KN_SELECTION',
          playerId: firstDiscardPlayerId,
          purpose: 'PROGRESS_DISCARD',
          eligibleIds: nextState.players[firstDiscardPlayerId]?.knProgressCardIds ?? [],
          minimumSelections: 1,
          maximumSelections: 1,
          queue: pendingDiscardIds,
          canCancel: false,
          context:
            interaction.simultaneous === true
              ? {}
              : { resumeDefenderTieQueue: remainingDefenderQueue },
        },
      };
    } else if (remainingDefenderQueue[0] !== undefined) {
      nextState = {
        ...nextState,
        turn: { ...nextState.turn, phase: 'CARD_RESOLUTION' },
        pendingInteraction: {
          type: 'KN_SELECTION',
          playerId: remainingDefenderQueue[0],
          purpose: 'DEFENDER_TIE_DECK',
          eligibleIds: ['SCIENCE', 'TRADE', 'POLITICS'],
          minimumSelections: 1,
          maximumSelections: 1,
          queue: remainingDefenderQueue,
          canCancel: false,
          context: {},
        },
      };
    } else {
      const continued = continueAfterMandatoryQueue({ ...nextState, pendingInteraction: null });
      nextState = continued.state;
      events.push(...continued.events);
    }
  } else if (interaction.purpose === 'PROGRESS_DISCARD') {
    const discarded = discardKNProgressCard(state, action.actorId, selected as CardInstanceId);
    nextState = discarded.state;
    events.push(...discarded.events);
    const queued = nextQueueInteraction(
      nextState,
      interaction.queue,
      interaction.purpose,
      (playerId) => nextState.players[playerId]?.knProgressCardIds ?? [],
    );
    if (queued !== null) nextState = queued;
    else {
      const defenderQueue = interaction.context.resumeDefenderTieQueue as
        readonly PlayerId[] | undefined;
      const nextDefender = defenderQueue?.[0];
      if (nextDefender !== undefined) {
        nextState = {
          ...nextState,
          turn: { ...nextState.turn, phase: 'CARD_RESOLUTION' },
          pendingInteraction: {
            type: 'KN_SELECTION',
            playerId: nextDefender,
            purpose: 'DEFENDER_TIE_DECK',
            eligibleIds: ['SCIENCE', 'TRADE', 'POLITICS'],
            minimumSelections: 1,
            maximumSelections: 1,
            queue: defenderQueue ?? [nextDefender],
            canCancel: false,
            context: {},
          },
        };
      } else if (interaction.context.endTurnDiscard === true) {
        const readyToEnd: GameState = {
          ...nextState,
          pendingInteraction: null,
          turn: { ...nextState.turn, phase: 'ACTION_PHASE' },
        };
        const advanced = advanceTurn(readyToEnd, action.actorId);
        if (advanced === null) {
          return rejectAction(state, 'NOT_YOUR_TURN', 'The turn order could not advance.');
        }
        nextState = advanced.state;
        events.push(...advanced.events);
      } else {
        const continued = continueAfterMandatoryQueue({ ...nextState, pendingInteraction: null });
        nextState = continued.state;
        events.push(...continued.events);
      }
    }
  } else if (interaction.purpose === 'RELOCATE_DISPLACED_KNIGHT') {
    const knightId = interaction.context.knightId as KnightId | undefined;
    const player = state.players[action.actorId];
    const knight = player?.knights.find((candidate) => candidate.id === knightId);
    const vertex = state.board.vertices[selected as VertexId];
    if (player === undefined || knight === undefined || vertex === undefined) {
      return rejectAction(
        state,
        'INVALID_TARGET',
        'The displaced Knight can no longer relocate there.',
      );
    }
    const moved: KnightState = { ...knight, vertexId: vertex.id };
    nextState = {
      ...state,
      players: {
        ...state.players,
        [player.id]: {
          ...player,
          knights: player.knights.map((candidate) =>
            candidate.id === knight.id ? moved : candidate,
          ),
        },
      },
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [vertex.id]: { ...vertex, knightId: knight.id },
        },
      },
      pendingInteraction: null,
      turn: { ...state.turn, phase: 'ACTION_PHASE' },
    };
    events.push({
      type: 'KNIGHT_MOVED',
      playerId: player.id,
      knightId: knight.id,
      fromVertexId: knight.vertexId,
      vertexId: vertex.id,
    });
  } else if (interaction.purpose === 'METROPOLIS_CITY') {
    const track = interaction.context.track as KNProgressFamily | undefined;
    if (track === undefined)
      return rejectAction(state, 'INVALID_TARGET', 'The Metropolis track is missing.');
    const placed = placeMetropolis(state, action.actorId, track, selected as VertexId);
    nextState = {
      ...placed.state,
      pendingInteraction: null,
      turn: { ...placed.state.turn, phase: 'ACTION_PHASE' },
    };
    events.push(...placed.events);
  } else {
    const cardResult = resolveKNProgressCardSelection(state, action, false);
    if (!cardResult.ok) return cardResult;
    nextState = cardResult.state;
    events.push(...cardResult.events);
  }

  return acceptAction(state, action, nextState, events);
}
