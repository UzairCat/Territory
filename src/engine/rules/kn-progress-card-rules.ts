import { COMMODITIES, HAND_GOODS } from '../content/commodities';
import {
  getKNProgressCardDefinition,
  type KNProgressCardDefinition,
} from '../content/kn-progress-cards';
import { RESOURCES, RESOURCE_IDS, TERRAIN_IDS } from '../content/resources';
import { resourceBundle } from '../content/types';
import type { ResourceBundle } from '../content/types';
import type { GameAction } from '../core/actions';
import { acceptAction, rejectAction } from '../core/dispatch-result';
import type { DispatchResult } from '../core/dispatch-result';
import type { GameEvent } from '../core/events';
import type { GameState, KnightState, PlayerState } from '../core/game-state';
import type {
  CardInstanceId,
  EdgeId,
  HexId,
  KnightId,
  PlayerId,
  ResourceId,
  VertexId,
} from '../core/ids';
import { actionId } from '../core/ids';
import { randomInteger } from '../core/random';
import {
  buyImprovement,
  getLegalKnightPlacementVertexIds,
  getLegalDisplacedKnightVertexIds,
} from './kn-construction-rules';
import { rollKNDice } from './kn-turn-rules';
import type { RollDiceOptions } from './turn-rules';
import { isLegalRoadEdge } from './build-rules';
import {
  addResourceBundles,
  canAfford,
  combinedBank,
  playerHand,
  splitBank,
  subtractResourceBundles,
  withPlayerHand,
} from './resource-rules';
import { calculatePublicScore, calculateScore } from './scoring-rules';
import { orderedPlayerIds } from './setup-rules';
import { getRobberDestinationHexIds } from './robber-rules';

type KNCardAction = Extract<GameAction, { readonly type: 'PLAY_KN_PROGRESS_CARD' }>;
type KNSelectionAction = Extract<GameAction, { readonly type: 'RESOLVE_PROGRESS_SELECTION' }>;
type KNSelection = Extract<GameState['pendingInteraction'], { readonly type: 'KN_SELECTION' }>;

interface KNCardResolution {
  readonly ok: true;
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export function canUseCraneProgressCard(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (
    state.kn === null ||
    player === undefined ||
    player.craneDiscountAvailable ||
    state.turn.phase !== 'ACTION_PHASE' ||
    state.turn.activePlayerId !== playerId ||
    state.pendingInteraction !== null
  ) {
    return false;
  }
  const discountedState: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, craneDiscountAvailable: true },
    },
  };
  return (['SCIENCE', 'TRADE', 'POLITICS'] as const).some(
    (track) =>
      buyImprovement(discountedState, {
        id: actionId(`check-crane-${track}`),
        type: 'BUY_IMPROVEMENT',
        actorId: playerId,
        track,
      }).ok,
  );
}

function cardDetails(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: CardInstanceId,
): {
  readonly card: NonNullable<GameState['kn']>['progressCards'][string];
  readonly definition: KNProgressCardDefinition;
  readonly player: PlayerState;
} | null {
  const player = state.players[playerId];
  const card = state.kn?.progressCards[cardInstanceId];
  const definition =
    card === undefined ? undefined : getKNProgressCardDefinition(card.definitionId);
  if (
    player === undefined ||
    card === undefined ||
    definition === undefined ||
    card.ownerId !== playerId ||
    !player.knProgressCardIds.includes(cardInstanceId)
  ) {
    return null;
  }
  return { card, definition, player };
}

function startCard(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: CardInstanceId,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const player = state.players[playerId]!;
  const card = state.kn!.progressCards[cardInstanceId]!;
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
        ...state.kn!,
        progressCards: {
          ...state.kn!.progressCards,
          [cardInstanceId]: { ...card, playedTurn: state.turn.turnNumber },
        },
      },
    },
    events: [
      {
        type: 'KN_PROGRESS_CARD_PLAYED',
        playerId,
        cardInstanceId,
        cardDefinitionId: card.definitionId,
      },
    ],
  };
}

function finishCard(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: CardInstanceId,
  detail: Omit<
    Extract<GameEvent, { readonly type: 'KN_PROGRESS_CARD_RESOLVED' }>,
    'type' | 'playerId' | 'cardInstanceId' | 'cardDefinitionId'
  > = {},
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const kn = state.kn!;
  const card = kn.progressCards[cardInstanceId]!;
  const definition = getKNProgressCardDefinition(card.definitionId)!;
  return {
    state: {
      ...state,
      pendingInteraction: null,
      turn: { ...state.turn, phase: 'ACTION_PHASE' },
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
        type: 'KN_PROGRESS_CARD_RESOLVED',
        playerId,
        cardInstanceId,
        cardDefinitionId: card.definitionId,
        ...detail,
      },
    ],
  };
}

function restoreCancelledCard(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: CardInstanceId,
): GameState {
  const player = state.players[playerId];
  const card = state.kn?.progressCards[cardInstanceId];
  if (player === undefined || card === undefined || state.kn === null) return state;
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        knProgressCardIds: player.knProgressCardIds.includes(cardInstanceId)
          ? player.knProgressCardIds
          : [...player.knProgressCardIds, cardInstanceId],
      },
    },
    pendingInteraction: null,
    turn: { ...state.turn, phase: 'ACTION_PHASE' },
    kn: {
      ...state.kn,
      progressCards: {
        ...state.kn.progressCards,
        [cardInstanceId]: { ...card, playedTurn: null },
      },
    },
  };
}

function withChoice(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: CardInstanceId,
  purpose: KNSelection['purpose'],
  eligibleIds: readonly string[],
  options: {
    readonly minimum?: number;
    readonly maximum?: number;
    readonly queue?: readonly PlayerId[];
    readonly canCancel?: boolean;
    readonly context?: KNSelection['context'];
  } = {},
): GameState {
  return {
    ...state,
    turn: { ...state.turn, phase: 'CARD_RESOLUTION' },
    pendingInteraction: {
      type: 'KN_SELECTION',
      playerId,
      purpose,
      sourceCardId: cardInstanceId,
      eligibleIds,
      minimumSelections: options.minimum ?? 1,
      maximumSelections: options.maximum ?? 1,
      queue: options.queue ?? [playerId],
      canCancel: options.canCancel ?? true,
      context: options.context ?? {},
    },
  };
}

function activeCardContextError(state: GameState, playerId: PlayerId): string | null {
  if (state.kn === null) return 'K+N Progress Cards are only available in K+N mode.';
  if (state.turn.activePlayerId !== playerId) return 'Only the active player may play this card.';
  if (state.turn.phase !== 'ACTION_PHASE')
    return 'Play this Progress Card during your action phase.';
  if (state.pendingInteraction !== null) return 'Resolve the current interaction first.';
  return null;
}

function legalWallVertices(state: GameState, playerId: PlayerId): readonly VertexId[] {
  const player = state.players[playerId];
  if (player === undefined || player.cityWallsRemaining < 1) return [];
  return Object.values(state.board.vertices)
    .filter(
      (vertex) =>
        vertex.building?.ownerId === playerId &&
        vertex.building.type === 'MANSION' &&
        vertex.building.hasWall !== true,
    )
    .map((vertex) => vertex.id);
}

function legalMedicineVertices(state: GameState, playerId: PlayerId): readonly VertexId[] {
  const player = state.players[playerId];
  const cost = resourceBundle([
    [RESOURCE_IDS.ore, 2],
    [RESOURCE_IDS.grain, 1],
  ]);
  if (player === undefined || player.mansionsRemaining < 1 || !canAfford(player.resources, cost))
    return [];
  return Object.values(state.board.vertices)
    .filter(
      (vertex) =>
        vertex.building?.ownerId === playerId &&
        vertex.building.type === 'HOUSE' &&
        (player.forcedMansionRebuildVertexIds.length === 0 ||
          player.forcedMansionRebuildVertexIds.includes(vertex.id)),
    )
    .map((vertex) => vertex.id);
}

function legalRoadIds(state: GameState, playerId: PlayerId): readonly EdgeId[] {
  const player = state.players[playerId];
  if (player === undefined || player.roadsRemaining < 1) return [];
  return Object.values(state.board.edges)
    .filter((edge) => isLegalRoadEdge(state, playerId, edge.id))
    .map((edge) => edge.id);
}

function eligibleSmithKnightIds(state: GameState, playerId: PlayerId): readonly KnightId[] {
  const player = state.players[playerId];
  if (player === undefined) return [];
  return player.knights
    .filter(
      (knight) =>
        knight.level < 3 &&
        knight.upgradedTurn !== state.turn.turnNumber &&
        (knight.level < 2 || player.cityImprovements.POLITICS >= 3) &&
        player.knights.filter((other) => other.level === knight.level + 1).length < 2,
    )
    .map((knight) => knight.id);
}

function resourceHexesTouchingPlayer(state: GameState, playerId: PlayerId): readonly HexId[] {
  return Object.values(state.board.hexes)
    .filter(
      (hex) =>
        hex.resourceId !== null &&
        hex.vertexIds.some(
          (vertexId) => state.board.vertices[vertexId]?.building?.ownerId === playerId,
        ),
    )
    .map((hex) => hex.id);
}

function openRoadIds(state: GameState): readonly EdgeId[] {
  return Object.values(state.board.edges)
    .filter((edge) => {
      if (edge.roadOwnerId === null) return false;
      const ownerId = edge.roadOwnerId;
      return [edge.vertexAId, edge.vertexBId].some((vertexId) => {
        const vertex = state.board.vertices[vertexId];
        if (vertex === undefined) return false;
        const ownedDegree = vertex.connectedEdgeIds.filter(
          (connectedId) => state.board.edges[connectedId]?.roadOwnerId === ownerId,
        ).length;
        return ownedDegree === 1 && vertex.building === null && (vertex.knightId ?? null) === null;
      });
    })
    .map((edge) => edge.id);
}

function addBankGain(
  state: GameState,
  playerId: PlayerId,
  resourceId: ResourceId,
  requested: number,
): { readonly state: GameState; readonly amount: number; readonly bundle: ResourceBundle } {
  const player = state.players[playerId]!;
  const currentBank = combinedBank(state.bank, state.commodityBank);
  const amount = Math.min(requested, currentBank[resourceId] ?? 0);
  const bundle = resourceBundle(amount > 0 ? [[resourceId, amount]] : []);
  const nextBank = subtractResourceBundles(currentBank, bundle);
  const banks = splitBank(nextBank);
  return {
    amount,
    bundle,
    state: {
      ...state,
      players: {
        ...state.players,
        [playerId]: withPlayerHand(player, addResourceBundles(playerHand(player), bundle)),
      },
      bank: banks.bank,
      commodityBank: banks.commodityBank,
    },
  };
}

function transferBundle(
  state: GameState,
  fromPlayerId: PlayerId,
  toPlayerId: PlayerId,
  bundle: ResourceBundle,
): GameState | null {
  const from = state.players[fromPlayerId];
  const to = state.players[toPlayerId];
  if (from === undefined || to === undefined || !canAfford(playerHand(from), bundle)) return null;
  return {
    ...state,
    players: {
      ...state.players,
      [fromPlayerId]: withPlayerHand(from, subtractResourceBundles(playerHand(from), bundle)),
      [toPlayerId]: withPlayerHand(to, addResourceBundles(playerHand(to), bundle)),
    },
  };
}

function immediateCard(
  original: GameState,
  action: KNCardAction,
  mutate: (startedState: GameState) => {
    readonly state: GameState;
    readonly detail?: Parameters<typeof finishCard>[3];
    readonly events?: readonly GameEvent[];
  },
): DispatchResult {
  const started = startCard(original, action.actorId, action.cardInstanceId);
  const mutation = mutate(started.state);
  const finished = finishCard(
    mutation.state,
    action.actorId,
    action.cardInstanceId,
    mutation.detail,
  );
  return acceptAction(original, action, finished.state, [
    ...started.events,
    ...(mutation.events ?? []),
    ...finished.events,
  ]);
}

export function playKNProgressCard(state: GameState, action: KNCardAction): DispatchResult {
  const details = cardDetails(state, action.actorId, action.cardInstanceId);
  if (details === null)
    return rejectAction(state, 'CARD_NOT_OWNED', 'That K+N Progress Card is not in your hand.');
  const effect = details.definition.effect;
  if (effect === 'ALCHEMIST') {
    if (
      state.kn === null ||
      state.turn.activePlayerId !== action.actorId ||
      state.turn.phase !== 'WAITING_FOR_ROLL' ||
      state.pendingInteraction !== null
    ) {
      return rejectAction(
        state,
        'WRONG_PHASE',
        'Alchemist can only be activated by the active player before rolling.',
      );
    }
    const started = startCard(state, action.actorId, action.cardInstanceId);
    return acceptAction(
      state,
      action,
      withChoice(
        started.state,
        action.actorId,
        action.cardInstanceId,
        'ALCHEMIST_DICE',
        [
          ...[1, 2, 3, 4, 5, 6].map((value) => `regular:${value}`),
          ...[1, 2, 3, 4, 5, 6].map((value) => `red:${value}`),
        ],
        { minimum: 2, maximum: 2, canCancel: false },
      ),
      started.events,
    );
  }

  const contextError = activeCardContextError(state, action.actorId);
  if (contextError !== null) return rejectAction(state, 'WRONG_PHASE', contextError);

  if (effect === 'CRANE') {
    if (details.player.craneDiscountAvailable) {
      return rejectAction(
        state,
        'CARD_TARGET_UNAVAILABLE',
        'Use the Crane discount already waiting before playing another Crane.',
      );
    }
    if (!canUseCraneProgressCard(state, action.actorId)) {
      return rejectAction(
        state,
        'CARD_TARGET_UNAVAILABLE',
        'Crane needs an Improvement you can afford and legally advance now.',
      );
    }
    return immediateCard(state, action, (startedState) => ({
      state: {
        ...startedState,
        players: {
          ...startedState.players,
          [action.actorId]: {
            ...startedState.players[action.actorId]!,
            craneDiscountAvailable: true,
          },
        },
      },
    }));
  }

  if (effect === 'IRRIGATION' || effect === 'MINING') {
    const terrainId = effect === 'IRRIGATION' ? TERRAIN_IDS.fields : TERRAIN_IDS.mountains;
    const resourceId = effect === 'IRRIGATION' ? RESOURCE_IDS.grain : RESOURCE_IDS.ore;
    const distinctTiles = Object.values(state.board.hexes).filter(
      (hex) =>
        hex.terrainId === terrainId &&
        hex.vertexIds.some(
          (vertexId) => state.board.vertices[vertexId]?.building?.ownerId === action.actorId,
        ),
    ).length;
    return immediateCard(state, action, (startedState) => {
      const gain = addBankGain(startedState, action.actorId, resourceId, distinctTiles * 2);
      return { state: gain.state, detail: { resources: gain.bundle } };
    });
  }

  if (effect === 'WARLORD') {
    return immediateCard(state, action, (startedState) => {
      const player = startedState.players[action.actorId]!;
      return {
        state: {
          ...startedState,
          players: {
            ...startedState.players,
            [action.actorId]: {
              ...player,
              knights: player.knights.map((knight) => ({
                ...knight,
                active: true,
                activeSinceTurn: knight.active
                  ? knight.activeSinceTurn
                  : startedState.turn.turnNumber,
              })),
            },
          },
        },
        events: player.knights
          .filter((knight) => !knight.active)
          .map((knight) => ({
            type: 'KNIGHT_ACTIVATED' as const,
            playerId: action.actorId,
            knightId: knight.id,
          })),
      };
    });
  }

  const choice = (
    purpose: KNSelection['purpose'],
    eligibleIds: readonly string[],
    options?: Parameters<typeof withChoice>[5],
  ): DispatchResult => {
    if (eligibleIds.length === 0) {
      return rejectAction(
        state,
        'CARD_TARGET_UNAVAILABLE',
        'This card has no legal target right now.',
      );
    }
    const started = startCard(state, action.actorId, action.cardInstanceId);
    return acceptAction(
      state,
      action,
      withChoice(
        started.state,
        action.actorId,
        action.cardInstanceId,
        purpose,
        eligibleIds,
        options,
      ),
      started.events,
    );
  };

  if (effect === 'ENGINEER')
    return choice('ENGINEER_WALL', legalWallVertices(state, action.actorId));
  if (effect === 'INVENTOR') {
    return choice(
      'INVENTOR_FIRST_TOKEN',
      Object.values(state.board.hexes)
        .filter((hex) => hex.numberToken !== null && ![2, 6, 8, 12].includes(hex.numberToken))
        .map((hex) => hex.id),
    );
  }
  if (effect === 'MEDICINE')
    return choice('MEDICINE_CITY', legalMedicineVertices(state, action.actorId));
  if (effect === 'ROAD_BUILDING') {
    return choice('ROAD_BUILDING', legalRoadIds(state, action.actorId), {
      canCancel: true,
      context: { remaining: 2, committed: false },
    });
  }
  if (effect === 'SMITH') {
    return choice('SMITH_KNIGHT', eligibleSmithKnightIds(state, action.actorId), {
      canCancel: true,
      context: { remaining: 2, committed: false },
    });
  }
  if (effect === 'MERCHANT_FLEET') {
    return choice(
      'MERCHANT_FLEET_GOOD',
      HAND_GOODS.map((good) => good.id),
    );
  }
  if (effect === 'MERCHANT')
    return choice('MERCHANT_HEX', resourceHexesTouchingPlayer(state, action.actorId));
  if (effect === 'RESOURCE_MONOPOLY')
    return choice(
      'RESOURCE_MONOPOLY',
      RESOURCES.map((resource) => resource.id),
    );
  if (effect === 'COMMODITY_MONOPOLY')
    return choice(
      'COMMODITY_MONOPOLY',
      COMMODITIES.map((commodity) => commodity.id),
    );
  if (effect === 'BISHOP') {
    if (state.kn?.firstBarbarianAttackResolved !== true) {
      return rejectAction(
        state,
        'CARD_TARGET_UNAVAILABLE',
        'The robber is locked until the first barbarian attack.',
      );
    }
    return choice('BISHOP_HEX', getRobberDestinationHexIds(state, action.actorId));
  }
  if (effect === 'COMMERCIAL_HARBOR') {
    const resources = RESOURCES.filter(
      (resource) => (details.player.resources[resource.id] ?? 0) > 0,
    ).map((resource) => resource.id);
    const opponents = orderedPlayerIds(state).filter(
      (playerId) =>
        playerId !== action.actorId &&
        COMMODITIES.some(
          (commodity) => (state.players[playerId]?.commodities[commodity.id] ?? 0) > 0,
        ),
    );
    return choice('COMMERCIAL_HARBOR_PLAYER', resources.length === 0 ? [] : opponents, {
      canCancel: true,
      context: { activePlayerId: action.actorId, remainingOpponents: opponents },
    });
  }
  if (effect === 'MASTER_MERCHANT') {
    const actorScore = calculateScore(state, action.actorId);
    return choice(
      'MASTER_MERCHANT_PLAYER',
      orderedPlayerIds(state).filter(
        (playerId) =>
          playerId !== action.actorId &&
          calculateScore(state, playerId) > actorScore &&
          Object.values(playerHand(state.players[playerId]!)).some((amount) => (amount ?? 0) > 0),
      ),
    );
  }
  if (effect === 'DESERTER') {
    return choice(
      'DESERTER_PLAYER',
      orderedPlayerIds(state).filter(
        (playerId) =>
          playerId !== action.actorId && (state.players[playerId]?.knights.length ?? 0) > 0,
      ),
    );
  }
  if (effect === 'DIPLOMAT') return choice('DIPLOMAT_ROAD', openRoadIds(state));
  if (effect === 'INTRIGUE') {
    const touching = new Set<VertexId>();
    for (const edge of Object.values(state.board.edges)) {
      if (edge.roadOwnerId === action.actorId) {
        touching.add(edge.vertexAId);
        touching.add(edge.vertexBId);
      }
    }
    return choice(
      'INTRIGUE_KNIGHT',
      Object.values(state.players)
        .filter((player) => player.id !== action.actorId)
        .flatMap((player) => player.knights)
        .filter((knight) => touching.has(knight.vertexId))
        .map((knight) => knight.id),
    );
  }
  if (effect === 'SABOTEUR') {
    const actorScore = calculateScore(state, action.actorId);
    const queue = orderedPlayerIds(state).filter(
      (playerId) =>
        playerId !== action.actorId &&
        calculateScore(state, playerId) >= actorScore &&
        Object.values(playerHand(state.players[playerId]!)).reduce<number>(
          (total, amount) => total + (amount ?? 0),
          0,
        ) >= 2,
    );
    if (queue.length === 0)
      return immediateCard(state, action, (startedState) => ({ state: startedState }));
    const first = queue[0]!;
    const required = Math.floor(
      Object.values(playerHand(state.players[first]!)).reduce<number>(
        (total, amount) => total + (amount ?? 0),
        0,
      ) / 2,
    );
    const started = startCard(state, action.actorId, action.cardInstanceId);
    return acceptAction(
      state,
      action,
      withChoice(
        started.state,
        first,
        action.cardInstanceId,
        'SABOTEUR_DISCARD',
        HAND_GOODS.filter((good) => (playerHand(state.players[first]!)[good.id] ?? 0) > 0).map(
          (good) => good.id,
        ),
        {
          minimum: required,
          maximum: required,
          queue,
          canCancel: false,
          context: { activePlayerId: action.actorId },
        },
      ),
      started.events,
    );
  }
  if (effect === 'SPY') {
    return choice(
      'SPY_PLAYER',
      orderedPlayerIds(state).filter(
        (playerId) =>
          playerId !== action.actorId &&
          (state.players[playerId]?.knProgressCardIds.length ?? 0) > 0,
      ),
    );
  }
  if (effect === 'WEDDING') {
    const actorScore = calculateScore(state, action.actorId);
    const queue = orderedPlayerIds(state).filter(
      (playerId) =>
        playerId !== action.actorId &&
        calculateScore(state, playerId) > actorScore &&
        Object.values(playerHand(state.players[playerId]!)).some((amount) => (amount ?? 0) > 0),
    );
    if (queue.length === 0)
      return immediateCard(state, action, (startedState) => ({ state: startedState }));
    const first = queue[0]!;
    const count = Math.min(
      2,
      Object.values(playerHand(state.players[first]!)).reduce<number>(
        (total, amount) => total + (amount ?? 0),
        0,
      ),
    );
    const started = startCard(state, action.actorId, action.cardInstanceId);
    return acceptAction(
      state,
      action,
      withChoice(
        started.state,
        first,
        action.cardInstanceId,
        'WEDDING_CARDS',
        HAND_GOODS.filter((good) => (playerHand(state.players[first]!)[good.id] ?? 0) > 0).map(
          (good) => good.id,
        ),
        {
          minimum: count,
          maximum: count,
          queue,
          canCancel: false,
          context: { activePlayerId: action.actorId },
        },
      ),
      started.events,
    );
  }

  return rejectAction(state, 'UNKNOWN_ACTION', 'This K+N Progress Card has no resolver.');
}

export function playAlchemist(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'PLAY_ALCHEMIST' }>,
  options: RollDiceOptions = {},
): DispatchResult {
  if (
    state.kn === null ||
    state.turn.phase !== 'WAITING_FOR_ROLL' ||
    state.turn.activePlayerId !== action.actorId
  ) {
    return rejectAction(
      state,
      'WRONG_PHASE',
      'Alchemist can only be played by the active player before rolling.',
    );
  }
  if (
    ![action.redDie, action.regularDie].every(
      (value) => Number.isSafeInteger(value) && value >= 1 && value <= 6,
    )
  ) {
    return rejectAction(
      state,
      'INVALID_TARGET',
      'Choose values from 1 to 6 for both numeric dice.',
    );
  }
  const details = cardDetails(state, action.actorId, action.cardInstanceId);
  if (details?.definition.effect !== 'ALCHEMIST') {
    return rejectAction(state, 'CARD_NOT_OWNED', 'Choose an Alchemist card from your hand.');
  }
  const started = startCard(state, action.actorId, action.cardInstanceId);
  const finished = finishCard(started.state, action.actorId, action.cardInstanceId);
  const rolled = rollKNDice(
    {
      ...finished.state,
      actionHistory: state.actionHistory,
      turn: { ...finished.state.turn, phase: 'WAITING_FOR_ROLL' },
    },
    { id: action.id, type: 'ROLL_KN_DICE', actorId: action.actorId },
    { red: action.redDie, regular: action.regularDie },
    options,
  );
  if (!rolled.ok) return rolled;
  return acceptAction(state, action, { ...rolled.state, actionHistory: state.actionHistory }, [
    ...started.events,
    ...finished.events,
    ...rolled.events,
  ]);
}

function selectedBundle(selections: readonly string[]): ResourceBundle {
  const counts = new Map<ResourceId, number>();
  for (const selection of selections) {
    const resourceId = selection as ResourceId;
    counts.set(resourceId, (counts.get(resourceId) ?? 0) + 1);
  }
  return resourceBundle([...counts]);
}

function findKnight(
  state: GameState,
  knightId: KnightId,
): { player: PlayerState; knight: KnightState } | null {
  for (const player of Object.values(state.players)) {
    const knight = player.knights.find((candidate) => candidate.id === knightId);
    if (knight !== undefined) return { player, knight };
  }
  return null;
}

function continueOrFinishRepeatedChoice(
  state: GameState,
  interaction: KNSelection,
  playerId: PlayerId,
  cardInstanceId: CardInstanceId,
  purpose: KNSelection['purpose'],
  eligibleIds: readonly string[],
  remaining: number,
  events: readonly GameEvent[],
): KNCardResolution {
  if (remaining > 0 && eligibleIds.length > 0) {
    return {
      ok: true,
      state: withChoice(state, playerId, cardInstanceId, purpose, eligibleIds, {
        canCancel: purpose !== 'SMITH_KNIGHT',
        context: { ...interaction.context, remaining, committed: true },
      }),
      events,
    };
  }
  const finished = finishCard(state, playerId, cardInstanceId);
  return { ok: true, state: finished.state, events: [...events, ...finished.events] };
}

export function resolveKNProgressCardSelection(
  state: GameState,
  action: KNSelectionAction,
  cancelled: boolean,
): DispatchResult | KNCardResolution {
  const interaction = state.pendingInteraction;
  const cardInstanceId =
    interaction?.type === 'KN_SELECTION' ? interaction.sourceCardId : undefined;
  if (interaction?.type !== 'KN_SELECTION' || cardInstanceId === undefined) {
    return rejectAction(
      state,
      'PENDING_INTERACTION_REQUIRED',
      'This choice is not resolving a Progress Card.',
    );
  }
  const card = state.kn?.progressCards[cardInstanceId];
  const definition =
    card === undefined ? undefined : getKNProgressCardDefinition(card.definitionId);
  if (card === undefined || definition === undefined) {
    return rejectAction(state, 'CARD_NOT_OWNED', 'The resolving Progress Card is unavailable.');
  }
  const activePlayerId =
    (interaction.context.activePlayerId as PlayerId | undefined) ?? card.ownerId;
  if (activePlayerId === null || activePlayerId === undefined) {
    return rejectAction(state, 'CARD_NOT_OWNED', 'The resolving Progress Card has no owner.');
  }
  if (cancelled) {
    if (interaction.context.committed === true) {
      const finished = finishCard(state, activePlayerId, cardInstanceId);
      return { ok: true, state: finished.state, events: finished.events };
    }
    return {
      ok: true,
      state: restoreCancelledCard(state, activePlayerId, cardInstanceId),
      events: [],
    };
  }

  const selected = action.selections[0];
  if (selected === undefined) return rejectAction(state, 'INVALID_TARGET', 'Choose an option.');
  const events: GameEvent[] = [];
  let nextState = state;

  if (interaction.purpose === 'ALCHEMIST_DICE') {
    const regularSelection = action.selections.find((selection) =>
      selection.startsWith('regular:'),
    );
    const redSelection = action.selections.find((selection) => selection.startsWith('red:'));
    const regular = Number(regularSelection?.split(':')[1]);
    const red = Number(redSelection?.split(':')[1]);
    if (
      regularSelection === undefined ||
      redSelection === undefined ||
      ![regular, red].every((value) => Number.isSafeInteger(value) && value >= 1 && value <= 6)
    ) {
      return rejectAction(state, 'INVALID_TARGET', 'Choose one white die and one red die.');
    }
    const finished = finishCard(state, activePlayerId, cardInstanceId);
    const rolled = rollKNDice(
      {
        ...finished.state,
        actionHistory: state.actionHistory,
        pendingInteraction: null,
        turn: { ...finished.state.turn, phase: 'WAITING_FOR_ROLL' },
      },
      { id: action.id, type: 'ROLL_KN_DICE', actorId: activePlayerId },
      { red, regular },
    );
    if (!rolled.ok) return rolled;
    return {
      ok: true,
      state: { ...rolled.state, actionHistory: state.actionHistory },
      events: [...events, ...finished.events, ...rolled.events],
    };
  } else if (interaction.purpose === 'ENGINEER_WALL') {
    const vertex = state.board.vertices[selected as VertexId];
    const player = state.players[activePlayerId]!;
    if (
      vertex?.building?.ownerId !== activePlayerId ||
      vertex.building.type !== 'MANSION' ||
      vertex.building.hasWall === true ||
      player.cityWallsRemaining < 1
    ) {
      return rejectAction(state, 'INVALID_TARGET', 'Choose an eligible City.');
    }
    nextState = {
      ...state,
      players: {
        ...state.players,
        [activePlayerId]: { ...player, cityWallsRemaining: player.cityWallsRemaining - 1 },
      },
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [vertex.id]: { ...vertex, building: { ...vertex.building, hasWall: true } },
        },
      },
    };
    events.push({ type: 'WALL_BUILT', playerId: activePlayerId, vertexId: vertex.id });
  } else if (interaction.purpose === 'INVENTOR_FIRST_TOKEN') {
    return {
      ok: true,
      state: withChoice(
        state,
        activePlayerId,
        cardInstanceId,
        'INVENTOR_SECOND_TOKEN',
        interaction.eligibleIds,
        {
          minimum: 1,
          maximum: 2,
          context: { firstHexId: selected, committed: false },
        },
      ),
      events: [],
    };
  } else if (interaction.purpose === 'INVENTOR_SECOND_TOKEN') {
    const firstHexId =
      action.selections.length === 2
        ? (action.selections[0] as HexId | undefined)
        : (interaction.context.firstHexId as HexId | undefined);
    const secondHexId =
      action.selections.length === 2
        ? (action.selections[1] as HexId | undefined)
        : (selected as HexId);
    const firstHex = firstHexId === undefined ? undefined : state.board.hexes[firstHexId];
    const secondHex = secondHexId === undefined ? undefined : state.board.hexes[secondHexId];
    if (
      firstHexId === secondHexId ||
      firstHex?.numberToken === null ||
      firstHex === undefined ||
      secondHex?.numberToken === null ||
      secondHex === undefined
    ) {
      return rejectAction(state, 'INVALID_TARGET', 'Both number tokens must still be available.');
    }
    nextState = {
      ...state,
      board: {
        ...state.board,
        hexes: {
          ...state.board.hexes,
          [firstHex.id]: { ...firstHex, numberToken: secondHex.numberToken },
          [secondHex.id]: { ...secondHex, numberToken: firstHex.numberToken },
        },
      },
    };
    const finished = finishCard(nextState, activePlayerId, cardInstanceId, {
      targetIds: [firstHex.id, secondHex.id],
    });
    return { ok: true, state: finished.state, events: [...events, ...finished.events] };
  } else if (interaction.purpose === 'MEDICINE_CITY') {
    const vertex = state.board.vertices[selected as VertexId];
    const player = state.players[activePlayerId]!;
    const cost = resourceBundle([
      [RESOURCE_IDS.ore, 2],
      [RESOURCE_IDS.grain, 1],
    ]);
    if (
      vertex?.building?.ownerId !== activePlayerId ||
      vertex.building.type !== 'HOUSE' ||
      player.mansionsRemaining < 1 ||
      !canAfford(player.resources, cost)
    ) {
      return rejectAction(state, 'INVALID_TARGET', 'That House cannot be upgraded with Medicine.');
    }
    if (
      player.forcedMansionRebuildVertexIds.length > 0 &&
      !player.forcedMansionRebuildVertexIds.includes(vertex.id)
    ) {
      return rejectAction(
        state,
        'INVALID_TARGET',
        'Medicine must rebuild the City lost to the barbarians first.',
      );
    }
    const forcedMansionRebuildVertexIds = player.forcedMansionRebuildVertexIds.filter(
      (vertexId) => vertexId !== vertex.id,
    );
    const rebuildingVirtualHouse = player.forcedMansionRebuildVertexIds.includes(vertex.id);
    nextState = {
      ...state,
      players: {
        ...state.players,
        [activePlayerId]: {
          ...player,
          resources: subtractResourceBundles(player.resources, cost),
          housesRemaining: rebuildingVirtualHouse
            ? player.housesRemaining
            : player.housesRemaining + 1,
          mansionsRemaining: player.mansionsRemaining - 1,
          mustRebuildDestroyedMansion: forcedMansionRebuildVertexIds.length > 0,
          forcedMansionRebuildVertexIds,
        },
      },
      bank: addResourceBundles(state.bank, cost),
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [vertex.id]: { ...vertex, building: { ...vertex.building, type: 'MANSION' } },
        },
      },
    };
    events.push({ type: 'BUILDING_UPGRADED', playerId: activePlayerId, vertexId: vertex.id });
  } else if (interaction.purpose === 'ROAD_BUILDING') {
    const edge = state.board.edges[selected as EdgeId];
    const player = state.players[activePlayerId]!;
    if (
      edge === undefined ||
      !isLegalRoadEdge(state, activePlayerId, edge.id) ||
      player.roadsRemaining < 1
    ) {
      return rejectAction(state, 'INVALID_TARGET', 'Choose a legal connected Road edge.');
    }
    nextState = {
      ...state,
      players: {
        ...state.players,
        [activePlayerId]: { ...player, roadsRemaining: player.roadsRemaining - 1 },
      },
      board: {
        ...state.board,
        edges: { ...state.board.edges, [edge.id]: { ...edge, roadOwnerId: activePlayerId } },
      },
    };
    events.push({ type: 'ROAD_BUILT', playerId: activePlayerId, edgeId: edge.id });
    return continueOrFinishRepeatedChoice(
      nextState,
      interaction,
      activePlayerId,
      cardInstanceId,
      interaction.purpose,
      legalRoadIds(nextState, activePlayerId),
      Number(interaction.context.remaining ?? 2) - 1,
      events,
    );
  } else if (interaction.purpose === 'SMITH_KNIGHT') {
    const found = findKnight(state, selected as KnightId);
    if (found === null || found.player.id !== activePlayerId || found.knight.level >= 3) {
      return rejectAction(state, 'INVALID_TARGET', 'Choose an eligible Knight.');
    }
    const nextLevel = (found.knight.level + 1) as 2 | 3;
    const knights = found.player.knights.map((knight) =>
      knight.id === found.knight.id
        ? { ...knight, level: nextLevel, upgradedTurn: state.turn.turnNumber }
        : knight,
    );
    nextState = {
      ...state,
      players: { ...state.players, [activePlayerId]: { ...found.player, knights } },
    };
    events.push({
      type: 'KNIGHT_UPGRADED',
      playerId: activePlayerId,
      knightId: found.knight.id,
      level: nextLevel,
    });
    return continueOrFinishRepeatedChoice(
      nextState,
      interaction,
      activePlayerId,
      cardInstanceId,
      interaction.purpose,
      eligibleSmithKnightIds(nextState, activePlayerId),
      Number(interaction.context.remaining ?? 2) - 1,
      events,
    );
  } else if (interaction.purpose === 'MERCHANT_FLEET_GOOD') {
    const player = state.players[activePlayerId]!;
    nextState = {
      ...state,
      players: {
        ...state.players,
        [activePlayerId]: { ...player, merchantFleetGoodId: selected as ResourceId },
      },
    };
  } else if (interaction.purpose === 'MERCHANT_HEX') {
    const hex = state.board.hexes[selected as HexId];
    if (hex?.resourceId === null || hex === undefined)
      return rejectAction(
        state,
        'INVALID_TARGET',
        'Choose a producing tile touching your building.',
      );
    const previousPlayerId = state.kn!.merchant?.ownerId ?? null;
    nextState = {
      ...state,
      kn: {
        ...state.kn!,
        merchant: { ownerId: activePlayerId, hexId: hex.id, resourceId: hex.resourceId },
      },
    };
    events.push({
      type: 'MERCHANT_MOVED',
      playerId: activePlayerId,
      hexId: hex.id,
      resourceId: hex.resourceId,
    });
    if (previousPlayerId !== activePlayerId) {
      // Score recalculation is handled at the dispatch boundary.
    }
  } else if (
    interaction.purpose === 'RESOURCE_MONOPOLY' ||
    interaction.purpose === 'COMMODITY_MONOPOLY'
  ) {
    const resourceId = selected as ResourceId;
    const cap = interaction.purpose === 'RESOURCE_MONOPOLY' ? 2 : 1;
    const transfers: Record<string, number> = {};
    nextState = state;
    for (const opponentId of orderedPlayerIds(state)) {
      if (opponentId === activePlayerId) continue;
      const amount = Math.min(cap, playerHand(nextState.players[opponentId]!)[resourceId] ?? 0);
      if (amount < 1) continue;
      const transferred = transferBundle(
        nextState,
        opponentId,
        activePlayerId,
        resourceBundle([[resourceId, amount]]),
      );
      if (transferred !== null) {
        nextState = transferred;
        transfers[opponentId] = amount;
      }
    }
    const finished = finishCard(nextState, activePlayerId, cardInstanceId, {
      resourceId,
      transfers,
    });
    return { ok: true, state: finished.state, events: [...events, ...finished.events] };
  } else if (interaction.purpose === 'BISHOP_HEX') {
    const hex = state.board.hexes[selected as HexId];
    if (hex === undefined || !getRobberDestinationHexIds(state, activePlayerId).includes(hex.id))
      return rejectAction(state, 'INVALID_TARGET', 'Choose a different robber tile.');
    const targets = new Set<PlayerId>();
    for (const vertexId of hex.vertexIds) {
      const ownerId = state.board.vertices[vertexId]?.building?.ownerId;
      if (
        ownerId !== undefined &&
        ownerId !== activePlayerId &&
        (state.config.friendlyRobber !== true || calculatePublicScore(state, ownerId) >= 3)
      ) {
        targets.add(ownerId);
      }
    }
    let random = state.random;
    nextState = { ...state, board: { ...state.board, robberHexId: hex.id } };
    events.push({
      type: 'ROBBER_MOVED',
      playerId: activePlayerId,
      fromHexId: state.board.robberHexId,
      hexId: hex.id,
    });
    const transfers: Record<string, number> = {};
    for (const targetId of targets) {
      const target = nextState.players[targetId]!;
      const weighted = HAND_GOODS.flatMap((good) =>
        Array.from({ length: playerHand(target)[good.id] ?? 0 }, () => good.id),
      );
      if (weighted.length === 0) continue;
      const roll = randomInteger(random, 0, weighted.length);
      random = roll.state;
      const goodId = weighted[roll.value]!;
      const transferred = transferBundle(
        nextState,
        targetId,
        activePlayerId,
        resourceBundle([[goodId, 1]]),
      );
      if (transferred !== null) {
        nextState = transferred;
        transfers[targetId] = (transfers[targetId] ?? 0) + 1;
        events.push({
          type: 'RESOURCE_STOLEN',
          playerId: activePlayerId,
          targetPlayerId: targetId,
          resourceId: goodId,
        });
      }
    }
    nextState = { ...nextState, random };
  } else if (interaction.purpose === 'COMMERCIAL_HARBOR_PLAYER') {
    const targetPlayerId = selected as PlayerId;
    const remainingOpponents =
      (interaction.context.remainingOpponents as readonly PlayerId[] | undefined) ?? [];
    if (!remainingOpponents.includes(targetPlayerId))
      return rejectAction(state, 'INVALID_TARGET', 'Choose an available Harbor partner.');
    const resources = RESOURCES.filter(
      (resource) => (state.players[activePlayerId]?.resources[resource.id] ?? 0) > 0,
    ).map((resource) => resource.id);
    return {
      ok: true,
      state: withChoice(
        state,
        activePlayerId,
        cardInstanceId,
        'COMMERCIAL_HARBOR_RESOURCE',
        resources,
        {
          canCancel: true,
          context: {
            activePlayerId,
            targetPlayerId,
            remainingOpponents: remainingOpponents.filter((id) => id !== targetPlayerId),
            committed: interaction.context.committed === true,
          },
        },
      ),
      events: [],
    };
  } else if (interaction.purpose === 'COMMERCIAL_HARBOR_RESOURCE') {
    const targetPlayerId = interaction.context.targetPlayerId as PlayerId | undefined;
    if (targetPlayerId === undefined) {
      return rejectAction(state, 'INVALID_TARGET', 'Choose a Harbor partner first.');
    }
    const commodities = COMMODITIES.filter(
      (commodity) => (state.players[targetPlayerId]?.commodities[commodity.id] ?? 0) > 0,
    ).map((commodity) => commodity.id);
    return {
      ok: true,
      state: withChoice(
        state,
        targetPlayerId,
        cardInstanceId,
        'COMMERCIAL_HARBOR_COMMODITY',
        commodities,
        {
          canCancel: false,
          context: {
            activePlayerId,
            targetPlayerId,
            remainingOpponents:
              (interaction.context.remainingOpponents as readonly PlayerId[] | undefined) ?? [],
            resourceId: selected,
            committed: true,
          },
        },
      ),
      events: [],
    };
  } else if (interaction.purpose === 'COMMERCIAL_HARBOR_COMMODITY') {
    const resourceId = interaction.context.resourceId as ResourceId;
    const commodityId = selected as ResourceId;
    const opponentId = action.actorId;
    const resourceTransfer = transferBundle(
      state,
      activePlayerId,
      opponentId,
      resourceBundle([[resourceId, 1]]),
    );
    const commodityTransfer =
      resourceTransfer === null
        ? null
        : transferBundle(
            resourceTransfer,
            opponentId,
            activePlayerId,
            resourceBundle([[commodityId, 1]]),
          );
    if (commodityTransfer === null)
      return rejectAction(state, 'INVALID_TARGET', 'The Harbor exchange is no longer possible.');
    nextState = commodityTransfer;
    events.push({
      type: 'COMMERCIAL_HARBOR_EXCHANGED',
      playerId: activePlayerId,
      targetPlayerId: opponentId,
      offeredResourceId: resourceId,
      receivedCommodityId: commodityId,
    });
    const opponents =
      (interaction.context.remainingOpponents as readonly PlayerId[] | undefined) ?? [];
    const resources = RESOURCES.filter(
      (resource) => (nextState.players[activePlayerId]?.resources[resource.id] ?? 0) > 0,
    ).map((resource) => resource.id);
    const availableOpponents = opponents.filter((playerId) =>
      COMMODITIES.some(
        (commodity) => (nextState.players[playerId]?.commodities[commodity.id] ?? 0) > 0,
      ),
    );
    if (availableOpponents.length > 0 && resources.length > 0) {
      return {
        ok: true,
        state: withChoice(
          nextState,
          activePlayerId,
          cardInstanceId,
          'COMMERCIAL_HARBOR_PLAYER',
          availableOpponents,
          {
            canCancel: true,
            context: {
              activePlayerId,
              remainingOpponents: availableOpponents,
              committed: true,
            },
          },
        ),
        events,
      };
    }
  } else if (interaction.purpose === 'MASTER_MERCHANT_PLAYER') {
    const targetId = selected as PlayerId;
    const target = state.players[targetId];
    if (
      target === undefined ||
      calculateScore(state, targetId) <= calculateScore(state, activePlayerId)
    ) {
      return rejectAction(state, 'INVALID_TARGET', 'Choose a player with more victory points.');
    }
    const count = Math.min(
      2,
      Object.values(playerHand(target)).reduce<number>((total, amount) => total + (amount ?? 0), 0),
    );
    return {
      ok: true,
      state: withChoice(
        state,
        activePlayerId,
        cardInstanceId,
        'MASTER_MERCHANT_CARDS',
        HAND_GOODS.filter((good) => (playerHand(target)[good.id] ?? 0) > 0).map((good) => good.id),
        { minimum: count, maximum: count, context: { targetPlayerId: targetId, activePlayerId } },
      ),
      events: [],
    };
  } else if (interaction.purpose === 'MASTER_MERCHANT_CARDS') {
    const targetId = interaction.context.targetPlayerId as PlayerId;
    const bundle = selectedBundle(action.selections);
    const transferred = transferBundle(state, targetId, activePlayerId, bundle);
    if (transferred === null)
      return rejectAction(state, 'INVALID_TARGET', 'Those cards are no longer available.');
    nextState = transferred;
  } else if (interaction.purpose === 'DESERTER_PLAYER') {
    const targetId = selected as PlayerId;
    const target = state.players[targetId];
    if (target === undefined || target.knights.length === 0)
      return rejectAction(state, 'INVALID_TARGET', 'That player has no Knight to desert.');
    return {
      ok: true,
      state: withChoice(
        state,
        targetId,
        cardInstanceId,
        'DESERTER_KNIGHT',
        target.knights.map((knight) => knight.id),
        {
          canCancel: false,
          context: { activePlayerId, targetPlayerId: targetId, committed: true },
        },
      ),
      events: [],
    };
  } else if (interaction.purpose === 'DESERTER_KNIGHT') {
    const targetId = action.actorId;
    const target = state.players[targetId]!;
    const knight = target.knights.find((candidate) => candidate.id === selected);
    if (knight === undefined)
      return rejectAction(state, 'INVALID_TARGET', 'Choose one of your Knights.');
    const vertex = state.board.vertices[knight.vertexId]!;
    nextState = {
      ...state,
      players: {
        ...state.players,
        [targetId]: {
          ...target,
          knights: target.knights.filter((candidate) => candidate.id !== knight.id),
        },
      },
      board: {
        ...state.board,
        vertices: { ...state.board.vertices, [vertex.id]: { ...vertex, knightId: null } },
      },
    };
    events.push({ type: 'KNIGHT_REMOVED', playerId: targetId, knightId: knight.id });
    const placements = getLegalKnightPlacementVertexIds(nextState, activePlayerId);
    const availableAtRank =
      (nextState.players[activePlayerId]?.knights.filter(
        (candidate) => candidate.level === knight.level,
      ).length ?? 0) < 2;
    if (placements.length > 0 && availableAtRank) {
      return {
        ok: true,
        state: withChoice(
          nextState,
          activePlayerId,
          cardInstanceId,
          'DESERTER_PLACE_KNIGHT',
          placements,
          {
            canCancel: false,
            context: { activePlayerId, deserterLevel: knight.level, committed: true },
          },
        ),
        events,
      };
    }
  } else if (interaction.purpose === 'DESERTER_PLACE_KNIGHT') {
    const player = state.players[activePlayerId]!;
    const vertex = state.board.vertices[selected as VertexId];
    if (vertex === undefined)
      return rejectAction(state, 'INVALID_TARGET', 'Choose a legal Knight corner.');
    const level = Number(interaction.context.deserterLevel ?? 1) as 1 | 2 | 3;
    if (
      ![1, 2, 3].includes(level) ||
      player.knights.filter((candidate) => candidate.level === level).length >= 2 ||
      !getLegalKnightPlacementVertexIds(state, activePlayerId).includes(vertex.id)
    ) {
      return rejectAction(
        state,
        'INVALID_TARGET',
        'That Knight rank or corner is no longer available.',
      );
    }
    const id =
      `deserter-${activePlayerId}-${state.turn.turnNumber}-${state.actionHistory.length}` as KnightId;
    const knight: KnightState = {
      id,
      ownerId: activePlayerId,
      vertexId: vertex.id,
      level,
      active: false,
      placedTurn: state.turn.turnNumber,
      activeSinceTurn: null,
      lastActionTurn: null,
      upgradedTurn: null,
    };
    nextState = {
      ...state,
      players: {
        ...state.players,
        [activePlayerId]: { ...player, knights: [...player.knights, knight] },
      },
      board: {
        ...state.board,
        vertices: { ...state.board.vertices, [vertex.id]: { ...vertex, knightId: id } },
      },
    };
    events.push({
      type: 'KNIGHT_BUILT',
      playerId: activePlayerId,
      knightId: id,
      vertexId: vertex.id,
      level,
    });
  } else if (interaction.purpose === 'DIPLOMAT_ROAD') {
    const edge = state.board.edges[selected as EdgeId];
    if (edge?.roadOwnerId === null || edge === undefined)
      return rejectAction(state, 'INVALID_TARGET', 'Choose an open Road.');
    const ownerId = edge.roadOwnerId;
    const owner = state.players[ownerId]!;
    nextState = {
      ...state,
      players: {
        ...state.players,
        [ownerId]: { ...owner, roadsRemaining: owner.roadsRemaining + 1 },
      },
      board: {
        ...state.board,
        edges: { ...state.board.edges, [edge.id]: { ...edge, roadOwnerId: null } },
      },
    };
    if (ownerId === activePlayerId) {
      const destinations = legalRoadIds(nextState, activePlayerId);
      if (destinations.length > 0) {
        return {
          ok: true,
          state: withChoice(
            nextState,
            activePlayerId,
            cardInstanceId,
            'DIPLOMAT_RELOCATE_ROAD',
            destinations,
            {
              canCancel: true,
              context: { activePlayerId, committed: true },
            },
          ),
          events: [],
        };
      }
    }
  } else if (interaction.purpose === 'DIPLOMAT_RELOCATE_ROAD') {
    const edge = state.board.edges[selected as EdgeId];
    const player = state.players[activePlayerId]!;
    if (
      edge === undefined ||
      !isLegalRoadEdge(state, activePlayerId, edge.id) ||
      player.roadsRemaining < 1
    ) {
      return rejectAction(state, 'INVALID_TARGET', 'Choose a legal Road destination.');
    }
    nextState = {
      ...state,
      players: {
        ...state.players,
        [activePlayerId]: { ...player, roadsRemaining: player.roadsRemaining - 1 },
      },
      board: {
        ...state.board,
        edges: { ...state.board.edges, [edge.id]: { ...edge, roadOwnerId: activePlayerId } },
      },
    };
    events.push({ type: 'ROAD_BUILT', playerId: activePlayerId, edgeId: edge.id });
  } else if (interaction.purpose === 'INTRIGUE_KNIGHT') {
    if (interaction.context.step === 'RELOCATE') {
      const targetId = interaction.context.targetPlayerId as PlayerId;
      const knightId = interaction.context.knightId as KnightId;
      const target = state.players[targetId]!;
      const knight = target.knights.find((candidate) => candidate.id === knightId);
      const vertex = state.board.vertices[selected as VertexId];
      if (knight === undefined || vertex === undefined)
        return rejectAction(state, 'INVALID_TARGET', 'That relocation is no longer legal.');
      nextState = {
        ...state,
        players: {
          ...state.players,
          [targetId]: {
            ...target,
            knights: target.knights.map((candidate) =>
              candidate.id === knight.id ? { ...candidate, vertexId: vertex.id } : candidate,
            ),
          },
        },
        board: {
          ...state.board,
          vertices: { ...state.board.vertices, [vertex.id]: { ...vertex, knightId: knight.id } },
        },
      };
      events.push({
        type: 'KNIGHT_MOVED',
        playerId: targetId,
        knightId: knight.id,
        fromVertexId: knight.vertexId,
        vertexId: vertex.id,
      });
    } else {
      const found = findKnight(state, selected as KnightId);
      if (found === null || found.player.id === activePlayerId)
        return rejectAction(state, 'INVALID_TARGET', 'Choose an opponent Knight.');
      const origin = state.board.vertices[found.knight.vertexId]!;
      nextState = {
        ...state,
        board: {
          ...state.board,
          vertices: { ...state.board.vertices, [origin.id]: { ...origin, knightId: null } },
        },
      };
      const destinations = getLegalDisplacedKnightVertexIds(nextState, found.knight);
      if (destinations.length === 0) {
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [found.player.id]: {
              ...found.player,
              knights: found.player.knights.filter((candidate) => candidate.id !== found.knight.id),
            },
          },
        };
        events.push({
          type: 'KNIGHT_REMOVED',
          playerId: found.player.id,
          knightId: found.knight.id,
        });
      } else {
        return {
          ok: true,
          state: withChoice(
            nextState,
            found.player.id,
            cardInstanceId,
            'INTRIGUE_KNIGHT',
            destinations,
            {
              canCancel: false,
              context: {
                activePlayerId,
                targetPlayerId: found.player.id,
                knightId: found.knight.id,
                step: 'RELOCATE',
                committed: true,
              },
            },
          ),
          events,
        };
      }
    }
  } else if (interaction.purpose === 'SABOTEUR_DISCARD') {
    const bundle = selectedBundle(action.selections);
    const player = state.players[action.actorId]!;
    if (!canAfford(playerHand(player), bundle))
      return rejectAction(state, 'INVALID_DISCARD', 'Those hand cards are no longer available.');
    const nextCombinedBank = addResourceBundles(
      combinedBank(state.bank, state.commodityBank),
      bundle,
    );
    const banks = splitBank(nextCombinedBank);
    nextState = {
      ...state,
      players: {
        ...state.players,
        [player.id]: withPlayerHand(player, subtractResourceBundles(playerHand(player), bundle)),
      },
      bank: banks.bank,
      commodityBank: banks.commodityBank,
    };
    events.push({ type: 'RESOURCES_DISCARDED', playerId: player.id, resources: bundle });
    const queue = interaction.queue.slice(1);
    const next = queue[0];
    if (next !== undefined) {
      const nextPlayer = nextState.players[next]!;
      const count = Math.floor(
        Object.values(playerHand(nextPlayer)).reduce<number>(
          (total, amount) => total + (amount ?? 0),
          0,
        ) / 2,
      );
      return {
        ok: true,
        state: withChoice(
          nextState,
          next,
          cardInstanceId,
          'SABOTEUR_DISCARD',
          HAND_GOODS.filter((good) => (playerHand(nextPlayer)[good.id] ?? 0) > 0).map(
            (good) => good.id,
          ),
          {
            minimum: count,
            maximum: count,
            queue,
            canCancel: false,
            context: interaction.context,
          },
        ),
        events,
      };
    }
  } else if (interaction.purpose === 'SPY_PLAYER') {
    const targetId = selected as PlayerId;
    const target = state.players[targetId];
    if (target === undefined || target.knProgressCardIds.length === 0)
      return rejectAction(state, 'INVALID_TARGET', 'That player has no stealable Progress Cards.');
    return {
      ok: true,
      state: withChoice(
        state,
        activePlayerId,
        cardInstanceId,
        'SPY_CARD',
        target.knProgressCardIds,
        {
          context: { activePlayerId, targetPlayerId: targetId },
        },
      ),
      events: [],
    };
  } else if (interaction.purpose === 'SPY_CARD') {
    const targetId = interaction.context.targetPlayerId as PlayerId;
    const target = state.players[targetId]!;
    const actor = state.players[activePlayerId]!;
    const stolenId = selected as CardInstanceId;
    const stolenCard = state.kn!.progressCards[stolenId];
    if (stolenCard?.ownerId !== targetId || !target.knProgressCardIds.includes(stolenId)) {
      return rejectAction(state, 'INVALID_TARGET', 'That Progress Card is no longer available.');
    }
    nextState = {
      ...state,
      players: {
        ...state.players,
        [targetId]: {
          ...target,
          knProgressCardIds: target.knProgressCardIds.filter((id) => id !== stolenId),
        },
        [activePlayerId]: { ...actor, knProgressCardIds: [...actor.knProgressCardIds, stolenId] },
      },
      kn: {
        ...state.kn!,
        progressCards: {
          ...state.kn!.progressCards,
          [stolenId]: { ...stolenCard, ownerId: activePlayerId },
        },
      },
    };
    const finished = finishCard(nextState, activePlayerId, cardInstanceId, {
      targetIds: [targetId, stolenId],
    });
    return { ok: true, state: finished.state, events: [...events, ...finished.events] };
  } else if (interaction.purpose === 'WEDDING_CARDS') {
    const bundle = selectedBundle(action.selections);
    const transferred = transferBundle(state, action.actorId, activePlayerId, bundle);
    if (transferred === null)
      return rejectAction(state, 'INVALID_TARGET', 'Those hand cards are no longer available.');
    nextState = transferred;
    const weddingTransfers = [
      ...((interaction.context.weddingTransfers as readonly string[] | undefined) ?? []),
      ...action.selections.map((resourceId) => `${action.actorId}|${resourceId}`),
    ];
    const queue = interaction.queue.slice(1);
    const next = queue[0];
    if (next !== undefined) {
      const nextPlayer = nextState.players[next]!;
      const count = Math.min(
        2,
        Object.values(playerHand(nextPlayer)).reduce<number>(
          (total, amount) => total + (amount ?? 0),
          0,
        ),
      );
      return {
        ok: true,
        state: withChoice(
          nextState,
          next,
          cardInstanceId,
          'WEDDING_CARDS',
          HAND_GOODS.filter((good) => (playerHand(nextPlayer)[good.id] ?? 0) > 0).map(
            (good) => good.id,
          ),
          {
            minimum: count,
            maximum: count,
            queue,
            canCancel: false,
            context: { ...interaction.context, weddingTransfers },
          },
        ),
        events: [],
      };
    }
    const transfersByPlayer = new Map<PlayerId, ResourceId[]>();
    for (const transfer of weddingTransfers) {
      const separator = transfer.lastIndexOf('|');
      const playerId = transfer.slice(0, separator) as PlayerId;
      const resourceId = transfer.slice(separator + 1) as ResourceId;
      if (separator < 1 || !HAND_GOODS.some((candidate) => candidate.id === resourceId)) {
        continue;
      }
      transfersByPlayer.set(playerId, [...(transfersByPlayer.get(playerId) ?? []), resourceId]);
    }
    for (const [playerId, resourceIds] of transfersByPlayer) {
      events.push({
        type: 'WEDDING_CARDS_TRANSFERRED',
        playerId: activePlayerId,
        targetPlayerId: playerId,
        resources: selectedBundle(resourceIds),
      });
    }
  } else {
    return rejectAction(state, 'UNKNOWN_ACTION', 'This Progress Card selection has no resolver.');
  }

  const finished = finishCard(nextState, activePlayerId, cardInstanceId);
  return { ok: true, state: finished.state, events: [...events, ...finished.events] };
}
