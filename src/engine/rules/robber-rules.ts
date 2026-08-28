import { HAND_GOODS } from '../content/commodities';
import { resourceBundle } from '../content/types';
import type { ResourceBundle } from '../content/types';
import type { GameAction } from '../core/actions';
import { acceptAction, rejectAction } from '../core/dispatch-result';
import type { DispatchResult } from '../core/dispatch-result';
import type { GameEvent } from '../core/events';
import type { GameState, PlayerState } from '../core/game-state';
import type { HexId, PlayerId, ResourceId } from '../core/ids';
import { randomInteger } from '../core/random';
import type { RandomState } from '../core/random';
import { addResourceBundles, canAfford, subtractResourceBundles } from './resource-rules';
import { combinedBank, playerHand, splitBank, withPlayerHand } from './resource-rules';
import { orderedPlayerIds } from './setup-rules';
import { calculatePublicScore } from './scoring-rules';

export interface DiscardQueue {
  readonly queue: readonly PlayerId[];
  readonly requiredCounts: Readonly<Record<string, number>>;
}

export function resourceCardCount(player: PlayerState): number {
  return HAND_GOODS.reduce((total, resource) => total + (playerHand(player)[resource.id] ?? 0), 0);
}

export function getDiscardSafeLimit(state: GameState, playerId: PlayerId): number {
  if (state.kn === null) return state.config.rules.discardThreshold;
  const wallCount = Object.values(state.board.vertices).filter(
    (vertex) => vertex.building?.ownerId === playerId && vertex.building.hasWall === true,
  ).length;
  return state.config.rules.discardThreshold + wallCount * 2;
}

export function createDiscardQueue(state: GameState): DiscardQueue {
  const requiredCounts: Record<string, number> = {};
  const queue = orderedPlayerIds(state).filter((playerId) => {
    const player = state.players[playerId];
    if (player === undefined) return false;
    const count = resourceCardCount(player);
    if (count <= getDiscardSafeLimit(state, playerId)) return false;
    requiredCounts[playerId] = Math.floor(count / 2);
    return true;
  });
  return { queue, requiredCounts };
}

function normalizeDiscardSelection(resources: ResourceBundle): ResourceBundle | null {
  const knownIds = new Set<ResourceId>(HAND_GOODS.map((resource) => resource.id));
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
    HAND_GOODS.flatMap((resource) => {
      const amount = resources[resource.id] ?? 0;
      return amount > 0 ? ([[resource.id, amount]] as const) : [];
    }),
  );
}

function bundleCount(resources: ResourceBundle): number {
  return HAND_GOODS.reduce((total, resource) => total + (resources[resource.id] ?? 0), 0);
}

export function discardResources(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'DISCARD_RESOURCES' }>,
): DispatchResult {
  if (state.turn.phase !== 'DISCARD_RESOURCES') {
    return rejectAction(state, 'WRONG_PHASE', 'Resources can only be discarded after a seven.');
  }
  const interaction = state.pendingInteraction;
  if (interaction?.type !== 'DISCARD_RESOURCES') {
    return rejectAction(
      state,
      'PENDING_INTERACTION_REQUIRED',
      'The discard queue is not available.',
    );
  }
  const expectedPlayerId = interaction.queue[0];
  if (expectedPlayerId !== action.actorId) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'Only the next player in the queue can discard.');
  }
  const player = state.players[action.actorId];
  const requiredCount = interaction.requiredCounts[action.actorId];
  if (player === undefined || requiredCount === undefined) {
    return rejectAction(state, 'INVALID_DISCARD', 'The required discard could not be resolved.');
  }

  const selection = normalizeDiscardSelection(action.resources);
  if (selection === null || bundleCount(selection) !== requiredCount) {
    return rejectAction(
      state,
      'INVALID_DISCARD',
      `Select exactly ${requiredCount} resource cards to discard.`,
    );
  }
  const currentHand = playerHand(player);
  if (!canAfford(currentHand, selection)) {
    return rejectAction(
      state,
      'INVALID_DISCARD',
      'The selected discard contains resources the player does not own.',
    );
  }

  const remainingQueue = interaction.queue.slice(1);
  const remainingRequiredCounts = Object.fromEntries(
    Object.entries(interaction.requiredCounts).filter(([playerId]) => playerId !== action.actorId),
  );
  const robberPlayerId = state.turn.activePlayerId;
  if (remainingQueue.length === 0 && robberPlayerId === null) {
    return rejectAction(state, 'WRONG_PHASE', 'The robber sequence has no active player.');
  }

  const events: GameEvent[] = [
    { type: 'RESOURCES_DISCARDED', playerId: action.actorId, resources: selection },
  ];
  const nextCombinedBank = addResourceBundles(
    combinedBank(state.bank, state.commodityBank),
    selection,
  );
  const nextBanks = splitBank(nextCombinedBank);
  const robberUnlocked = state.kn === null || state.kn.firstBarbarianAttackResolved;
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [action.actorId]: withPlayerHand(player, subtractResourceBundles(currentHand, selection)),
    },
    bank: nextBanks.bank,
    commodityBank: nextBanks.commodityBank,
    turn: {
      ...state.turn,
      phase:
        remainingQueue.length > 0
          ? 'DISCARD_RESOURCES'
          : robberUnlocked
            ? 'MOVE_ROBBER'
            : 'ACTION_PHASE',
    },
    pendingInteraction:
      remainingQueue.length > 0
        ? {
            type: 'DISCARD_RESOURCES',
            queue: remainingQueue,
            requiredCounts: remainingRequiredCounts,
          }
        : robberUnlocked
          ? { type: 'MOVE_ROBBER', playerId: robberPlayerId! }
          : null,
  };
  return acceptAction(state, action, nextState, events);
}

export function getRobberDestinationHexIds(state: GameState, playerId: PlayerId): readonly HexId[] {
  const destinations = Object.values(state.board.hexes).filter(
    (hex) => hex.id !== state.board.robberHexId,
  );
  if (state.config.friendlyRobber !== true) return destinations.map((hex) => hex.id);

  const friendlyDestinations = destinations.filter((hex) =>
    hex.vertexIds.every((vertexId) => {
      const ownerId = state.board.vertices[vertexId]?.building?.ownerId;
      return (
        ownerId === undefined || ownerId === playerId || calculatePublicScore(state, ownerId) >= 3
      );
    }),
  );
  return friendlyDestinations.map((hex) => hex.id);
}

export function getValidRobberHexIds(state: GameState, playerId: PlayerId): readonly HexId[] {
  const interaction = state.pendingInteraction;
  return state.turn.phase === 'MOVE_ROBBER' &&
    state.turn.activePlayerId === playerId &&
    interaction?.type === 'MOVE_ROBBER' &&
    interaction.playerId === playerId
    ? getRobberDestinationHexIds(state, playerId)
    : [];
}

export function getEligibleStealTargetIds(
  state: GameState,
  playerId: PlayerId,
  hexId: HexId,
): readonly PlayerId[] {
  const hex = state.board.hexes[hexId];
  if (hex === undefined) return [];
  const adjacentOwners = new Set(
    hex.vertexIds.flatMap((vertexId) => {
      const ownerId = state.board.vertices[vertexId]?.building?.ownerId;
      return ownerId === undefined || ownerId === playerId ? [] : [ownerId];
    }),
  );

  return orderedPlayerIds(state).filter((candidateId) => {
    const candidate = state.players[candidateId];
    return (
      candidateId !== playerId &&
      adjacentOwners.has(candidateId) &&
      candidate !== undefined &&
      (state.config.friendlyRobber !== true || calculatePublicScore(state, candidateId) >= 3) &&
      resourceCardCount(candidate) > 0
    );
  });
}

interface RandomSteal {
  readonly players: GameState['players'];
  readonly random: RandomState;
  readonly resourceId: ResourceId;
}

function stealRandomResource(
  state: GameState,
  playerId: PlayerId,
  targetPlayerId: PlayerId,
): RandomSteal | null {
  const player = state.players[playerId];
  const target = state.players[targetPlayerId];
  if (player === undefined || target === undefined) return null;

  const targetHand = playerHand(target);
  const weightedCards = HAND_GOODS.flatMap((resource) =>
    Array.from({ length: targetHand[resource.id] ?? 0 }, () => resource.id),
  );
  if (weightedCards.length === 0) return null;
  const selected = randomInteger(state.random, 0, weightedCards.length);
  const resourceId = weightedCards[selected.value];
  if (resourceId === undefined) return null;
  const card = resourceBundle([[resourceId, 1]]);

  return {
    random: selected.state,
    resourceId,
    players: {
      ...state.players,
      [playerId]: withPlayerHand(player, addResourceBundles(playerHand(player), card)),
      [targetPlayerId]: withPlayerHand(target, subtractResourceBundles(targetHand, card)),
    },
  };
}

export function moveRobber(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'MOVE_ROBBER' }>,
): DispatchResult {
  if (state.turn.phase !== 'MOVE_ROBBER') {
    return rejectAction(state, 'WRONG_PHASE', 'The robber can only move during robber movement.');
  }
  const interaction = state.pendingInteraction;
  if (interaction?.type !== 'MOVE_ROBBER' || interaction.playerId !== action.actorId) {
    return rejectAction(
      state,
      'PENDING_INTERACTION_REQUIRED',
      'The robber movement belongs to another interaction.',
    );
  }
  if (state.turn.activePlayerId !== action.actorId) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'Only the active player can move the robber.');
  }
  if (state.board.hexes[action.hexId] === undefined) {
    return rejectAction(state, 'INVALID_TARGET', 'The selected robber hex does not exist.');
  }
  if (state.board.robberHexId === action.hexId) {
    return rejectAction(
      state,
      'INVALID_ROBBER_DESTINATION',
      'The robber must move to a different hex.',
    );
  }
  if (!getRobberDestinationHexIds(state, action.actorId).includes(action.hexId)) {
    return rejectAction(
      state,
      'INVALID_ROBBER_DESTINATION',
      'Friendly Robber protects players with fewer than 3 public victory points.',
    );
  }

  const targets = getEligibleStealTargetIds(state, action.actorId, action.hexId);
  const events: GameEvent[] = [
    {
      type: 'ROBBER_MOVED',
      playerId: action.actorId,
      fromHexId: state.board.robberHexId,
      hexId: action.hexId,
    },
  ];
  let players = state.players;
  let random = state.random;
  const phase: GameState['turn']['phase'] =
    targets.length > 1 ? 'CHOOSE_STEAL_TARGET' : 'ACTION_PHASE';
  const pendingInteraction: GameState['pendingInteraction'] =
    targets.length > 1
      ? {
          type: 'CHOOSE_STEAL_TARGET',
          playerId: action.actorId,
          eligibleTargets: targets,
          ...(interaction.sourceCardId === undefined
            ? {}
            : { sourceCardId: interaction.sourceCardId }),
        }
      : null;

  const onlyTarget = targets[0];
  if (targets.length === 1 && onlyTarget !== undefined) {
    const steal = stealRandomResource(state, action.actorId, onlyTarget);
    if (steal !== null) {
      players = steal.players;
      random = steal.random;
      events.push({
        type: 'RESOURCE_STOLEN',
        playerId: action.actorId,
        targetPlayerId: onlyTarget,
        resourceId: steal.resourceId,
      });
    }
  }

  if (targets.length <= 1 && interaction.sourceCardId !== undefined) {
    const card = state.progressCards[interaction.sourceCardId];
    if (card !== undefined) {
      events.push({
        type: 'PROGRESS_CARD_RESOLVED',
        playerId: action.actorId,
        cardInstanceId: interaction.sourceCardId,
        cardDefinitionId: card.definitionId,
        amount: targets.length,
      });
    }
  }

  const nextState: GameState = {
    ...state,
    players,
    random,
    board: { ...state.board, robberHexId: action.hexId },
    turn: { ...state.turn, phase },
    pendingInteraction,
  };
  return acceptAction(state, action, nextState, events);
}

export function stealFromPlayer(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'STEAL_FROM_PLAYER' }>,
): DispatchResult {
  if (state.turn.phase !== 'CHOOSE_STEAL_TARGET') {
    return rejectAction(
      state,
      'WRONG_PHASE',
      'A steal target can only be chosen after moving the robber.',
    );
  }
  const interaction = state.pendingInteraction;
  if (interaction?.type !== 'CHOOSE_STEAL_TARGET' || interaction.playerId !== action.actorId) {
    return rejectAction(
      state,
      'PENDING_INTERACTION_REQUIRED',
      'The steal choice belongs to another interaction.',
    );
  }
  if (state.turn.activePlayerId !== action.actorId) {
    return rejectAction(
      state,
      'NOT_YOUR_TURN',
      'Only the active player can choose a steal target.',
    );
  }
  const robberHexId = state.board.robberHexId;
  const currentlyEligible =
    robberHexId === null ? [] : getEligibleStealTargetIds(state, action.actorId, robberHexId);
  if (
    !interaction.eligibleTargets.includes(action.targetPlayerId) ||
    !currentlyEligible.includes(action.targetPlayerId)
  ) {
    return rejectAction(
      state,
      'INVALID_STEAL_TARGET',
      'The selected player is not eligible to lose a resource.',
    );
  }

  const steal = stealRandomResource(state, action.actorId, action.targetPlayerId);
  if (steal === null) {
    return rejectAction(
      state,
      'INVALID_STEAL_TARGET',
      'The selected player has no resource card to steal.',
    );
  }
  const events: GameEvent[] = [
    {
      type: 'RESOURCE_STOLEN',
      playerId: action.actorId,
      targetPlayerId: action.targetPlayerId,
      resourceId: steal.resourceId,
    },
  ];
  if (interaction.sourceCardId !== undefined) {
    const card = state.progressCards[interaction.sourceCardId];
    if (card !== undefined) {
      events.push({
        type: 'PROGRESS_CARD_RESOLVED',
        playerId: action.actorId,
        cardInstanceId: interaction.sourceCardId,
        cardDefinitionId: card.definitionId,
        amount: 1,
      });
    }
  }
  const nextState: GameState = {
    ...state,
    players: steal.players,
    random: steal.random,
    turn: { ...state.turn, phase: 'ACTION_PHASE' },
    pendingInteraction: null,
  };
  return acceptAction(state, action, nextState, events);
}
