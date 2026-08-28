import { PROGRESS_CARDS } from '../content/progress-cards';
import { RESOURCES, RESOURCE_IDS } from '../content/resources';
import { resourceBundle } from '../content/types';
import type { ProgressCardDefinition, ResourceBundle } from '../content/types';
import type { GameAction } from '../core/actions';
import { acceptAction, rejectAction } from '../core/dispatch-result';
import type { DispatchResult } from '../core/dispatch-result';
import type { RuleError } from '../core/errors';
import type { GameEvent } from '../core/events';
import type { GameState, PlayerState, ProgressCardInstance } from '../core/game-state';
import type { CardInstanceId, EdgeId, PlayerId, ResourceId } from '../core/ids';
import { isLegalRoadEdge } from './build-rules';
import { addResourceBundles, canAfford, subtractResourceBundles } from './resource-rules';
import { orderedPlayerIds } from './setup-rules';

export interface ProgressCardPurchaseAvailability {
  readonly canBuy: boolean;
  readonly reason: string | null;
  readonly cost: ResourceBundle;
  readonly deckRemaining: number;
}

export interface ProgressCardPlayAvailability {
  readonly canPlay: boolean;
  readonly reason: string | null;
}

export function getProgressCardDefinition(
  instance: ProgressCardInstance | undefined,
): ProgressCardDefinition | undefined {
  return PROGRESS_CARDS.find((definition) => definition.id === instance?.definitionId);
}

function cardActionPrerequisiteError(state: GameState, actorId: PlayerId): RuleError | null {
  if (state.turn.activePlayerId !== actorId) {
    return { code: 'NOT_YOUR_TURN', message: 'Only the active player can use progress cards.' };
  }
  if (state.turn.phase !== 'ACTION_PHASE') {
    return { code: 'WRONG_PHASE', message: 'Progress cards are used during action phase.' };
  }
  if (state.pendingInteraction !== null) {
    return {
      code: 'PENDING_INTERACTION_REQUIRED',
      message: 'Resolve the current interaction before using a progress card.',
    };
  }
  if (state.players[actorId] === undefined) {
    return { code: 'NOT_YOUR_TURN', message: 'The active player does not exist.' };
  }
  return null;
}

export function getProgressCardPurchaseAvailability(
  state: GameState,
  actorId: PlayerId,
): ProgressCardPurchaseAvailability {
  const cost = state.config.rules.progressCardCost;
  if (state.kn !== null) {
    return {
      canBuy: false,
      reason: 'K+N Progress Cards are earned from the Event die and cannot be bought.',
      cost,
      deckRemaining: 0,
    };
  }
  const prerequisite = cardActionPrerequisiteError(state, actorId);
  if (prerequisite !== null) {
    return {
      canBuy: false,
      reason: prerequisite.message,
      cost,
      deckRemaining: state.progressDeck.length,
    };
  }
  if (state.progressDeck.length === 0) {
    return { canBuy: false, reason: 'The progress deck is empty.', cost, deckRemaining: 0 };
  }
  const player = state.players[actorId];
  if (player === undefined || !canAfford(player.resources, cost)) {
    return {
      canBuy: false,
      reason: 'You do not have the resources required to buy a progress card.',
      cost,
      deckRemaining: state.progressDeck.length,
    };
  }
  return { canBuy: true, reason: null, cost, deckRemaining: state.progressDeck.length };
}

function effectTargetError(
  state: GameState,
  actorId: PlayerId,
  definition: ProgressCardDefinition,
): RuleError | null {
  const player = state.players[actorId];
  if (player === undefined) {
    return { code: 'CARD_NOT_OWNED', message: 'The selected progress card has no owner.' };
  }

  if (definition.effect === 'VICTORY_POINT') {
    return {
      code: 'CARD_TARGET_UNAVAILABLE',
      message: 'Victory point cards score passively and are never played.',
    };
  }
  if (
    definition.effect === 'MOVE_ROBBER' &&
    !Object.values(state.board.hexes).some((hex) => hex.id !== state.board.robberHexId)
  ) {
    return {
      code: 'CARD_TARGET_UNAVAILABLE',
      message: 'There is no different tile to move the robber to.',
    };
  }
  if (
    definition.effect === 'PLACE_TWO_ROADS' &&
    (player.roadsRemaining < 1 || getLegalFreeRoadEdgeIds(state, actorId).length === 0)
  ) {
    return {
      code: 'CARD_TARGET_UNAVAILABLE',
      message: 'You need an available road piece and a legal road placement.',
    };
  }
  if (
    definition.effect === 'TAKE_TWO_RESOURCES' &&
    RESOURCES.reduce((total, resource) => total + (state.bank[resource.id] ?? 0), 0) < 2
  ) {
    return {
      code: 'CARD_TARGET_UNAVAILABLE',
      message: 'The bank does not contain two resource cards to take.',
    };
  }
  if (
    definition.effect === 'MONOPOLY' &&
    orderedPlayerIds(state)
      .filter((playerId) => playerId !== actorId)
      .every((playerId) =>
        RESOURCES.every((resource) => (state.players[playerId]?.resources[resource.id] ?? 0) === 0),
      )
  ) {
    return {
      code: 'CARD_TARGET_UNAVAILABLE',
      message: 'No opponent has a resource card to collect.',
    };
  }
  return null;
}

function progressCardPlayError(
  state: GameState,
  actorId: PlayerId,
  cardInstanceId: CardInstanceId,
): RuleError | null {
  if (state.kn !== null) {
    return {
      code: 'WRONG_PHASE',
      message: 'Classic Progress Cards are disabled in K+N mode.',
    };
  }
  const prerequisite = cardActionPrerequisiteError(state, actorId);
  if (prerequisite !== null) return prerequisite;

  const player = state.players[actorId];
  const instance = state.progressCards[cardInstanceId];
  if (
    player === undefined ||
    instance === undefined ||
    instance.ownerId !== actorId ||
    instance.playedTurn !== null ||
    !player.progressCardIds.includes(cardInstanceId)
  ) {
    return { code: 'CARD_NOT_OWNED', message: 'You do not own that unplayed progress card.' };
  }
  if (
    !state.config.rules.canPlayCardOnPurchaseTurn &&
    (instance.purchasedTurn === state.turn.turnNumber ||
      state.turn.cardIdsBoughtThisTurn.includes(cardInstanceId))
  ) {
    return {
      code: 'CARD_BOUGHT_THIS_TURN',
      message: 'A progress card cannot be played on the turn it was purchased.',
    };
  }
  if (state.turn.cardsPlayedThisTurn >= state.config.rules.cardPlayLimitPerTurn) {
    return {
      code: 'CARD_PLAY_LIMIT_REACHED',
      message: 'Only one progress card may be played each turn.',
    };
  }

  const definition = getProgressCardDefinition(instance);
  if (definition === undefined) {
    return { code: 'CARD_NOT_OWNED', message: 'The progress card definition is unavailable.' };
  }
  return effectTargetError(state, actorId, definition);
}

export function getProgressCardPlayAvailability(
  state: GameState,
  actorId: PlayerId,
  cardInstanceId: CardInstanceId,
): ProgressCardPlayAvailability {
  const error = progressCardPlayError(state, actorId, cardInstanceId);
  return { canPlay: error === null, reason: error?.message ?? null };
}

export function buyProgressCard(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'BUY_PROGRESS_CARD' }>,
): DispatchResult {
  const availability = getProgressCardPurchaseAvailability(state, action.actorId);
  if (!availability.canBuy) {
    const code = state.progressDeck.length === 0 ? 'DECK_EMPTY' : 'INSUFFICIENT_RESOURCES';
    const prerequisite = cardActionPrerequisiteError(state, action.actorId);
    return rejectAction(
      state,
      prerequisite?.code ?? code,
      prerequisite?.message ?? availability.reason ?? 'The progress card cannot be purchased.',
    );
  }

  const player = state.players[action.actorId];
  const cardInstanceId = state.progressDeck[0];
  const card = cardInstanceId === undefined ? undefined : state.progressCards[cardInstanceId];
  if (player === undefined || cardInstanceId === undefined || card === undefined) {
    return rejectAction(state, 'DECK_EMPTY', 'The progress deck could not provide a card.');
  }
  if (card.ownerId !== null) {
    return rejectAction(state, 'DECK_EMPTY', 'The top progress card is already owned.');
  }

  const nextCard: ProgressCardInstance = {
    ...card,
    ownerId: action.actorId,
    purchasedTurn: state.turn.turnNumber,
  };
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: {
        ...player,
        resources: subtractResourceBundles(player.resources, availability.cost),
        progressCardIds: [...player.progressCardIds, cardInstanceId],
      },
    },
    bank: addResourceBundles(state.bank, availability.cost),
    progressDeck: state.progressDeck.slice(1),
    progressCards: { ...state.progressCards, [cardInstanceId]: nextCard },
    turn: {
      ...state.turn,
      cardIdsBoughtThisTurn: [...state.turn.cardIdsBoughtThisTurn, cardInstanceId],
    },
  };
  const events: GameEvent[] = [
    {
      type: 'RESOURCES_SPENT',
      playerId: action.actorId,
      resources: availability.cost,
      reason: 'PROGRESS_CARD',
    },
    {
      type: 'PROGRESS_CARD_BOUGHT',
      playerId: action.actorId,
      cardInstanceId,
      cardDefinitionId: card.definitionId,
    },
  ];
  return acceptAction(state, action, nextState, events);
}

interface PlayedCardState {
  readonly state: GameState;
  readonly definition: ProgressCardDefinition;
}

function markCardPlayed(
  state: GameState,
  actorId: PlayerId,
  cardInstanceId: CardInstanceId,
): PlayedCardState | null {
  const player = state.players[actorId];
  const card = state.progressCards[cardInstanceId];
  const definition = getProgressCardDefinition(card);
  if (player === undefined || card === undefined || definition === undefined) return null;

  return {
    definition,
    state: {
      ...state,
      players: {
        ...state.players,
        [actorId]: {
          ...player,
          progressCardIds: player.progressCardIds.filter((id) => id !== cardInstanceId),
          playedForceCards: player.playedForceCards + (definition.countsTowardForce ? 1 : 0),
        },
      },
      progressCards: {
        ...state.progressCards,
        [cardInstanceId]: { ...card, playedTurn: state.turn.turnNumber },
      },
      progressDiscard: [...state.progressDiscard, cardInstanceId],
      turn: { ...state.turn, cardsPlayedThisTurn: state.turn.cardsPlayedThisTurn + 1 },
    },
  };
}

export function playProgressCard(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'PLAY_PROGRESS_CARD' }>,
): DispatchResult {
  const error = progressCardPlayError(state, action.actorId, action.cardInstanceId);
  if (error !== null) return rejectAction(state, error.code, error.message);

  const played = markCardPlayed(state, action.actorId, action.cardInstanceId);
  if (played === null) {
    return rejectAction(state, 'CARD_NOT_OWNED', 'The selected progress card is unavailable.');
  }
  const player = played.state.players[action.actorId];
  if (player === undefined) {
    return rejectAction(state, 'CARD_NOT_OWNED', 'The selected progress card has no owner.');
  }

  let nextState: GameState;
  if (played.definition.effect === 'MOVE_ROBBER') {
    nextState = {
      ...played.state,
      turn: { ...played.state.turn, phase: 'MOVE_ROBBER' },
      pendingInteraction: {
        type: 'MOVE_ROBBER',
        playerId: action.actorId,
        sourceCardId: action.cardInstanceId,
      },
    };
  } else if (played.definition.effect === 'PLACE_TWO_ROADS') {
    nextState = {
      ...played.state,
      turn: { ...played.state.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'PLACE_FREE_ROADS',
        playerId: action.actorId,
        sourceCardId: action.cardInstanceId,
        remainingPlacements: Math.min(2, player.roadsRemaining),
      },
    };
  } else if (played.definition.effect === 'TAKE_TWO_RESOURCES') {
    nextState = {
      ...played.state,
      turn: { ...played.state.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'SELECT_RESOURCES',
        playerId: action.actorId,
        sourceCardId: action.cardInstanceId,
        count: 2,
      },
    };
  } else if (played.definition.effect === 'MONOPOLY') {
    nextState = {
      ...played.state,
      turn: { ...played.state.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'SELECT_RESOURCE_TYPE',
        playerId: action.actorId,
        sourceCardId: action.cardInstanceId,
      },
    };
  } else {
    return rejectAction(
      state,
      'CARD_TARGET_UNAVAILABLE',
      'This progress card is passive and cannot be played.',
    );
  }

  return acceptAction(state, action, nextState, [
    {
      type: 'PROGRESS_CARD_PLAYED',
      playerId: action.actorId,
      cardInstanceId: action.cardInstanceId,
    },
  ]);
}

function normalizeResourceSelection(resources: ResourceBundle): ResourceBundle | null {
  const knownIds = new Set<ResourceId>(RESOURCES.map((resource) => resource.id));
  for (const [resourceId, amount] of Object.entries(resources)) {
    if (
      !knownIds.has(resourceId as ResourceId) ||
      amount === undefined ||
      !Number.isSafeInteger(amount) ||
      amount < 0
    ) {
      return null;
    }
  }
  return resourceBundle(
    RESOURCES.flatMap((resource) => {
      const amount = resources[resource.id] ?? 0;
      return amount > 0 ? ([[resource.id, amount]] as const) : [];
    }),
  );
}

function selectedResourceCount(resources: ResourceBundle): number {
  return RESOURCES.reduce((total, resource) => total + (resources[resource.id] ?? 0), 0);
}

function pendingCardError(
  state: GameState,
  actorId: PlayerId,
  cardInstanceId: CardInstanceId,
  type: 'SELECT_RESOURCES' | 'SELECT_RESOURCE_TYPE',
): RuleError | null {
  if (state.turn.phase !== 'CARD_RESOLUTION') {
    return { code: 'WRONG_PHASE', message: 'No progress card choice is being resolved.' };
  }
  if (state.turn.activePlayerId !== actorId) {
    return { code: 'NOT_YOUR_TURN', message: 'Only the active player can resolve this card.' };
  }
  const interaction = state.pendingInteraction;
  if (
    interaction?.type !== type ||
    interaction.playerId !== actorId ||
    interaction.sourceCardId !== cardInstanceId
  ) {
    return {
      code: 'PENDING_INTERACTION_REQUIRED',
      message: 'This choice does not match the progress card being resolved.',
    };
  }
  return null;
}

export function selectCardResources(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'SELECT_CARD_RESOURCES' }>,
): DispatchResult {
  const error = pendingCardError(state, action.actorId, action.cardInstanceId, 'SELECT_RESOURCES');
  if (error !== null) return rejectAction(state, error.code, error.message);
  const interaction = state.pendingInteraction;
  const player = state.players[action.actorId];
  if (interaction?.type !== 'SELECT_RESOURCES' || player === undefined) {
    return rejectAction(state, 'PENDING_INTERACTION_REQUIRED', 'The resource choice is missing.');
  }
  const selection = normalizeResourceSelection(action.resources);
  if (selection === null || selectedResourceCount(selection) !== interaction.count) {
    return rejectAction(
      state,
      'CARD_TARGET_UNAVAILABLE',
      `Choose exactly ${interaction.count} available resource cards.`,
    );
  }
  if (!canAfford(state.bank, selection)) {
    return rejectAction(
      state,
      'INSUFFICIENT_BANK_RESOURCES',
      'The bank no longer contains the selected resources.',
    );
  }
  const card = state.progressCards[action.cardInstanceId];
  if (card === undefined) {
    return rejectAction(state, 'CARD_NOT_OWNED', 'The resolving progress card is unavailable.');
  }

  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: {
        ...player,
        resources: addResourceBundles(player.resources, selection),
      },
    },
    bank: subtractResourceBundles(state.bank, selection),
    turn: { ...state.turn, phase: 'ACTION_PHASE' },
    pendingInteraction: null,
  };
  return acceptAction(state, action, nextState, [
    {
      type: 'PROGRESS_CARD_RESOLVED',
      playerId: action.actorId,
      cardInstanceId: action.cardInstanceId,
      cardDefinitionId: card.definitionId,
      amount: interaction.count,
      resources: selection,
    },
  ]);
}

export function selectCardResourceType(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'SELECT_CARD_RESOURCE_TYPE' }>,
): DispatchResult {
  const error = pendingCardError(
    state,
    action.actorId,
    action.cardInstanceId,
    'SELECT_RESOURCE_TYPE',
  );
  if (error !== null) return rejectAction(state, error.code, error.message);
  if (!Object.values(RESOURCE_IDS).includes(action.resourceId)) {
    return rejectAction(state, 'INVALID_TARGET', 'Choose a known resource type.');
  }
  const player = state.players[action.actorId];
  const card = state.progressCards[action.cardInstanceId];
  if (player === undefined || card === undefined) {
    return rejectAction(state, 'CARD_NOT_OWNED', 'The resolving progress card is unavailable.');
  }

  let totalTaken = 0;
  const transfers: Record<string, number> = {};
  const players: Record<string, PlayerState> = { ...state.players };
  for (const opponentId of orderedPlayerIds(state)) {
    if (opponentId === action.actorId) continue;
    const opponent = players[opponentId];
    if (opponent === undefined) continue;
    const amount = opponent.resources[action.resourceId] ?? 0;
    if (amount < 1) continue;
    totalTaken += amount;
    transfers[opponentId] = amount;
    players[opponentId] = {
      ...opponent,
      resources: subtractResourceBundles(
        opponent.resources,
        resourceBundle([[action.resourceId, amount]]),
      ),
    };
  }
  players[action.actorId] = {
    ...player,
    resources: addResourceBundles(
      player.resources,
      resourceBundle([[action.resourceId, totalTaken]]),
    ),
  };

  const nextState: GameState = {
    ...state,
    players,
    turn: { ...state.turn, phase: 'ACTION_PHASE' },
    pendingInteraction: null,
  };
  return acceptAction(state, action, nextState, [
    {
      type: 'PROGRESS_CARD_RESOLVED',
      playerId: action.actorId,
      cardInstanceId: action.cardInstanceId,
      cardDefinitionId: card.definitionId,
      amount: totalTaken,
      resourceId: action.resourceId,
      transfers,
    },
  ]);
}

export function getLegalFreeRoadEdgeIds(state: GameState, playerId: PlayerId): readonly EdgeId[] {
  const player = state.players[playerId];
  if (player === undefined || player.roadsRemaining < 1) return [];
  return Object.values(state.board.edges)
    .filter((edge) => isLegalRoadEdge(state, playerId, edge.id))
    .map((edge) => edge.id);
}

export function placeFreeRoad(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'BUILD_ROAD' }>,
): DispatchResult {
  const interaction = state.pendingInteraction;
  if (state.turn.phase !== 'CARD_RESOLUTION' || interaction?.type !== 'PLACE_FREE_ROADS') {
    return rejectAction(state, 'WRONG_PHASE', 'No free road placement is being resolved.');
  }
  if (state.turn.activePlayerId !== action.actorId || interaction.playerId !== action.actorId) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'Only the active player can place this free road.');
  }
  const player = state.players[action.actorId];
  const edge = state.board.edges[action.edgeId];
  const card = state.progressCards[interaction.sourceCardId];
  if (player === undefined || card === undefined) {
    return rejectAction(state, 'CARD_NOT_OWNED', 'The Road Building card is unavailable.');
  }
  if (player.roadsRemaining < 1) {
    return rejectAction(state, 'NO_PIECES_REMAINING', 'You have no road pieces remaining.');
  }
  if (edge === undefined) {
    return rejectAction(state, 'INVALID_TARGET', 'The selected road edge does not exist.');
  }
  if (edge.roadOwnerId !== null) {
    return rejectAction(state, 'EDGE_OCCUPIED', 'The selected edge already contains a road.');
  }
  if (!isLegalRoadEdge(state, action.actorId, action.edgeId)) {
    return rejectAction(
      state,
      'EDGE_NOT_CONNECTED',
      'A free road must still connect to your unblocked road or building network.',
    );
  }

  const placedState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: { ...player, roadsRemaining: player.roadsRemaining - 1 },
    },
    board: {
      ...state.board,
      edges: {
        ...state.board.edges,
        [action.edgeId]: { ...edge, roadOwnerId: action.actorId },
      },
    },
  };
  const remainingPlacements = interaction.remainingPlacements - 1;
  const canContinue =
    remainingPlacements > 0 && getLegalFreeRoadEdgeIds(placedState, action.actorId).length > 0;
  const nextState: GameState = {
    ...placedState,
    turn: { ...placedState.turn, phase: canContinue ? 'CARD_RESOLUTION' : 'ACTION_PHASE' },
    pendingInteraction: canContinue ? { ...interaction, remainingPlacements } : null,
  };
  const events: GameEvent[] = [
    { type: 'ROAD_BUILT', playerId: action.actorId, edgeId: action.edgeId },
  ];
  if (!canContinue) {
    events.push({
      type: 'PROGRESS_CARD_RESOLVED',
      playerId: action.actorId,
      cardInstanceId: interaction.sourceCardId,
      cardDefinitionId: card.definitionId,
      amount: null,
    });
  }
  return acceptAction(state, action, nextState, events);
}
