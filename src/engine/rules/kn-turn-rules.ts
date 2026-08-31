import { RESOURCES } from '../content/resources';
import { getKNProgressCardDefinition } from '../content/kn-progress-cards';
import type { KNProgressFamily, ResourceBundle } from '../content/types';
import type { GameAction } from '../core/actions';
import { acceptAction, rejectAction } from '../core/dispatch-result';
import type { DispatchResult } from '../core/dispatch-result';
import type { GameEvent } from '../core/events';
import type {
  GameState,
  KNEventDieResult,
  KNProgressCardInstance,
  PlayerState,
} from '../core/game-state';
import type { PlayerId, VertexId } from '../core/ids';
import { randomInteger } from '../core/random';
import { rollNumericDice } from './dice-rules';
import { createDiscardQueue } from './robber-rules';
import { resolveKNProduction } from './kn-production-rules';
import { orderedPlayerIds } from './setup-rules';
import type { RollDiceOptions } from './turn-rules';

const EVENT_DIE_FACES: readonly KNEventDieResult[] = [
  'BARBARIAN',
  'BARBARIAN',
  'BARBARIAN',
  'SCIENCE',
  'TRADE',
  'POLITICS',
];

export interface KNResolution {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

function playerOrderFrom(state: GameState, firstPlayerId: PlayerId): readonly PlayerId[] {
  const playerIds = orderedPlayerIds(state);
  const start = playerIds.indexOf(firstPlayerId);
  return start < 0 ? playerIds : [...playerIds.slice(start), ...playerIds.slice(0, start)];
}

function handHasCards(bundle: ResourceBundle): boolean {
  return Object.values(bundle).some((amount) => (amount ?? 0) > 0);
}

export function drawKNProgressCard(
  state: GameState,
  playerId: PlayerId,
  family: KNProgressFamily,
): KNResolution {
  const kn = state.kn;
  const player = state.players[playerId];
  const cardInstanceId = kn?.progressDecks[family][0];
  if (kn === null || kn === undefined || player === undefined || cardInstanceId === undefined) {
    return { state, events: [] };
  }
  const card = kn.progressCards[cardInstanceId];
  const definition =
    card === undefined ? undefined : getKNProgressCardDefinition(card.definitionId);
  if (card === undefined || definition === undefined) return { state, events: [] };

  const revealed = definition.revealedVictoryPoints > 0;
  const nextCard: KNProgressCardInstance = {
    ...card,
    ownerId: playerId,
    drawnTurn: state.turn.turnNumber,
    revealed,
  };
  const nextPlayer: PlayerState = {
    ...player,
    knProgressCardIds: revealed
      ? player.knProgressCardIds
      : [...player.knProgressCardIds, cardInstanceId],
    revealedKNProgressCardIds: revealed
      ? [...player.revealedKNProgressCardIds, cardInstanceId]
      : player.revealedKNProgressCardIds,
  };
  return {
    state: {
      ...state,
      players: { ...state.players, [playerId]: nextPlayer },
      kn: {
        ...kn,
        progressDecks: {
          ...kn.progressDecks,
          [family]: kn.progressDecks[family].slice(1),
        },
        progressCards: { ...kn.progressCards, [cardInstanceId]: nextCard },
      },
    },
    events: [{ type: 'KN_PROGRESS_CARD_DRAWN', playerId, family, cardInstanceId, revealed }],
  };
}

export function downgradeBarbarianCity(
  state: GameState,
  playerId: PlayerId,
  vertexId: VertexId,
): KNResolution {
  const player = state.players[playerId];
  const vertex = state.board.vertices[vertexId];
  const building = vertex?.building;
  if (
    player === undefined ||
    vertex === undefined ||
    building?.ownerId !== playerId ||
    building.type !== 'MANSION' ||
    (building.metropolis !== null && building.metropolis !== undefined)
  ) {
    return { state, events: [] };
  }
  const wallDestroyed = building.hasWall === true;
  const hasHousePiece = player.housesRemaining > 0;
  return {
    state: {
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...player,
          housesRemaining: Math.max(0, player.housesRemaining - 1),
          mansionsRemaining: player.mansionsRemaining + 1,
          cityWallsRemaining: wallDestroyed
            ? Math.min(3, player.cityWallsRemaining + 1)
            : player.cityWallsRemaining,
          mustRebuildDestroyedMansion: player.mustRebuildDestroyedMansion || !hasHousePiece,
          forcedMansionRebuildVertexIds: hasHousePiece
            ? player.forcedMansionRebuildVertexIds
            : player.forcedMansionRebuildVertexIds.includes(vertexId)
              ? player.forcedMansionRebuildVertexIds
              : [...player.forcedMansionRebuildVertexIds, vertexId],
        },
      },
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [vertexId]: {
            ...vertex,
            building: { ownerId: playerId, type: 'HOUSE', hasWall: false, metropolis: null },
          },
        },
      },
    },
    events: [{ type: 'CITY_DOWNGRADED', playerId, vertexId, wallDestroyed }],
  };
}

export function resolveBarbarianAttack(state: GameState): KNResolution {
  const kn = state.kn;
  const activePlayerId = state.turn.activePlayerId;
  if (kn === null || activePlayerId === null) return { state, events: [] };

  const cityBuildings = Object.values(state.board.vertices).flatMap((vertex) =>
    vertex.building?.type === 'MANSION' ? [{ vertex, building: vertex.building }] : [],
  );
  const barbarianStrength = cityBuildings.length;
  const contributions = Object.fromEntries(
    orderedPlayerIds(state).map((playerId) => [
      playerId,
      (state.players[playerId]?.knights ?? []).reduce(
        (total, knight) => total + (knight.active ? knight.level : 0),
        0,
      ),
    ]),
  ) as Readonly<Record<string, number>>;
  const defenderStrength = Object.values(contributions).reduce<number>(
    (total, amount) => total + (amount ?? 0),
    0,
  );
  const defended = defenderStrength >= barbarianStrength;
  let nextState: GameState = state;
  const events: GameEvent[] = [];
  let defenderAwardPlayerId: PlayerId | null = null;
  let affectedPlayerIds: readonly PlayerId[] = [];
  let nextInteraction: GameState['pendingInteraction'] = null;

  if (defended && barbarianStrength > 0) {
    const maximum = Math.max(...Object.values(contributions));
    const leaders = orderedPlayerIds(state).filter(
      (playerId) => maximum > 0 && contributions[playerId] === maximum,
    );
    if (leaders.length === 1) {
      const leader = leaders[0]!;
      const player = state.players[leader];
      if (player !== undefined) {
        nextState = {
          ...nextState,
          players: {
            ...nextState.players,
            [leader]: { ...player, defenderPoints: player.defenderPoints + 1 },
          },
        };
        defenderAwardPlayerId = leader;
      }
    } else if (leaders.length > 1) {
      const queue = playerOrderFrom(state, activePlayerId).filter((playerId) =>
        leaders.includes(playerId),
      );
      const first = queue[0];
      if (first !== undefined) {
        nextInteraction = {
          type: 'KN_SELECTION',
          playerId: first,
          purpose: 'DEFENDER_TIE_DECK',
          eligibleIds: ['SCIENCE', 'TRADE', 'POLITICS'],
          minimumSelections: 1,
          maximumSelections: 1,
          queue,
          simultaneous: true,
          canCancel: false,
          context: {},
        };
      }
    }
  } else if (!defended && barbarianStrength > 0) {
    const vulnerableByPlayer = new Map<PlayerId, VertexId[]>();
    for (const { vertex, building } of cityBuildings) {
      if (building.metropolis !== null && building.metropolis !== undefined) continue;
      const list = vulnerableByPlayer.get(building.ownerId) ?? [];
      list.push(vertex.id);
      vulnerableByPlayer.set(building.ownerId, list);
    }
    const eligiblePlayers = [...vulnerableByPlayer.keys()];
    if (eligiblePlayers.length > 0) {
      const minimum = Math.min(...eligiblePlayers.map((playerId) => contributions[playerId] ?? 0));
      affectedPlayerIds = playerOrderFrom(state, activePlayerId).filter(
        (playerId) =>
          vulnerableByPlayer.has(playerId) && (contributions[playerId] ?? 0) === minimum,
      );
      const choices = affectedPlayerIds.filter(
        (playerId) => (vulnerableByPlayer.get(playerId)?.length ?? 0) > 0,
      );
      const first = choices[0];
      if (first !== undefined) {
        nextInteraction = {
          type: 'KN_SELECTION',
          playerId: first,
          purpose: 'BARBARIAN_CITY_LOSS',
          eligibleIds: vulnerableByPlayer.get(first) ?? [],
          minimumSelections: 1,
          maximumSelections: 1,
          queue: choices,
          canCancel: false,
          context: {},
        };
      }
    }
  }

  const players = Object.fromEntries(
    Object.entries(nextState.players).map(([playerId, player]) => [
      playerId,
      {
        ...player,
        knights: player.knights.map((knight) => ({ ...knight, active: false })),
      },
    ]),
  );
  const attackSummary = {
    barbarianStrength,
    defenderStrength,
    contributions,
    defended,
    defenderAwardPlayerId,
    affectedPlayerIds,
  };
  nextState = {
    ...nextState,
    players,
    pendingInteraction: nextInteraction,
    turn: {
      ...nextState.turn,
      phase: nextInteraction === null ? nextState.turn.phase : 'CARD_RESOLUTION',
    },
    kn: {
      ...kn,
      barbarianPosition: 0,
      firstBarbarianAttackResolved: true,
      attackSummary,
      pendingRoll:
        kn.pendingRoll === null
          ? null
          : {
              ...kn.pendingRoll,
              stage: 'NUMBER',
            },
    },
  };
  events.push({
    type: 'BARBARIAN_ATTACK_RESOLVED',
    barbarianStrength,
    defenderStrength,
    defended,
    defenderAwardPlayerId,
    affectedPlayerIds,
  });
  return { state: nextState, events };
}

function resolveProgressGate(
  state: GameState,
  family: KNProgressFamily,
  redDie: number,
): KNResolution {
  const activePlayerId = state.turn.activePlayerId;
  if (state.kn === null || activePlayerId === null) return { state, events: [] };
  let nextState = state;
  const events: GameEvent[] = [];
  const eligiblePlayers = playerOrderFrom(state, activePlayerId).filter((playerId) => {
    const level = state.players[playerId]?.cityImprovements[family] ?? 0;
    return level > 0 && redDie <= Math.min(6, level + 1);
  });

  for (const playerId of eligiblePlayers) {
    const drawn = drawKNProgressCard(nextState, playerId, family);
    nextState = drawn.state;
    events.push(...drawn.events);
  }

  const discardQueue = eligiblePlayers.filter(
    (playerId) =>
      playerId !== activePlayerId &&
      (nextState.players[playerId]?.knProgressCardIds.length ?? 0) > 4,
  );
  const first = discardQueue[0];
  if (first !== undefined) {
    nextState = {
      ...nextState,
      turn: { ...nextState.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: first,
        purpose: 'PROGRESS_DISCARD',
        eligibleIds: nextState.players[first]?.knProgressCardIds ?? [],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: discardQueue,
        canCancel: false,
        context: {},
      },
      kn: {
        ...nextState.kn!,
        pendingRoll: {
          playerId: activePlayerId,
          red: nextState.kn?.redDieResult ?? redDie,
          regular: nextState.kn?.regularDieResult ?? 1,
          event: family,
          numericTotal: redDie + (nextState.kn?.regularDieResult ?? 1),
          stage: 'NUMBER',
          skipSevenDiscards: nextState.kn?.pendingRoll?.skipSevenDiscards === true,
          ignoreRobber: nextState.kn?.pendingRoll?.ignoreRobber === true,
          ...(nextState.kn?.pendingRoll?.discardExemptPlayerIds === undefined
            ? {}
            : {
                discardExemptPlayerIds: nextState.kn.pendingRoll.discardExemptPlayerIds,
              }),
        },
      },
    };
  }
  return { state: nextState, events };
}

export function resolveKNNumber(state: GameState): KNResolution {
  const kn = state.kn;
  const activePlayerId = state.turn.activePlayerId;
  const pendingRoll = kn?.pendingRoll;
  if (
    kn === null ||
    kn === undefined ||
    activePlayerId === null ||
    pendingRoll === null ||
    pendingRoll === undefined
  ) {
    return { state, events: [] };
  }
  const total = pendingRoll.numericTotal;
  const events: GameEvent[] = [];

  if (total === state.config.rules.dice.robberTotal) {
    if (pendingRoll.ignoreRobber === true) {
      return {
        state: {
          ...state,
          turn: { ...state.turn, phase: 'ACTION_PHASE' },
          pendingInteraction: null,
          kn: { ...kn, pendingRoll: null },
        },
        events,
      };
    }
    const { queue, requiredCounts } = pendingRoll.skipSevenDiscards
      ? { queue: [], requiredCounts: {} }
      : createDiscardQueue(state, pendingRoll.discardExemptPlayerIds);
    const robberUnlocked = kn.firstBarbarianAttackResolved;
    events.push({
      type: 'ROBBER_SEQUENCE_STARTED',
      playerId: activePlayerId,
      discardPlayerIds: queue,
      robberUnlocked,
    });
    return {
      state: {
        ...state,
        turn: {
          ...state.turn,
          phase:
            queue.length > 0
              ? 'DISCARD_RESOURCES'
              : robberUnlocked
                ? 'MOVE_ROBBER'
                : 'ACTION_PHASE',
        },
        pendingInteraction:
          queue.length > 0
            ? { type: 'DISCARD_RESOURCES', queue, requiredCounts }
            : robberUnlocked
              ? { type: 'MOVE_ROBBER', playerId: activePlayerId }
              : null,
        kn: { ...kn, pendingRoll: null },
      },
      events,
    };
  }

  const production = resolveKNProduction(state, total);
  events.push({
    type: 'RESOURCES_PRODUCED',
    source: 'DICE',
    rollTotal: total,
    grants: production.grants,
    unavailableResourceIds: production.unavailableResourceIds,
  });
  let nextState: GameState = {
    ...state,
    players: production.players,
    bank: production.bank,
    commodityBank: production.commodityBank,
  };
  const aqueductQueue = playerOrderFrom(state, activePlayerId).filter((playerId) => {
    const player = nextState.players[playerId];
    return (
      player !== undefined &&
      player.cityImprovements.SCIENCE >= 3 &&
      !handHasCards(production.grants[playerId] ?? {}) &&
      RESOURCES.some((resource) => (nextState.bank[resource.id] ?? 0) > 0)
    );
  });
  const first = aqueductQueue[0];
  if (first !== undefined) {
    nextState = {
      ...nextState,
      turn: { ...nextState.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: first,
        purpose: 'AQUEDUCT_RESOURCE',
        eligibleIds: RESOURCES.filter((resource) => (nextState.bank[resource.id] ?? 0) > 0).map(
          (resource) => resource.id,
        ),
        minimumSelections: 1,
        maximumSelections: 1,
        queue: aqueductQueue,
        simultaneous: true,
        canCancel: false,
        context: {},
      },
      kn: { ...kn, pendingRoll: { ...pendingRoll, stage: 'AQUEDUCT' } },
    };
  } else {
    nextState = {
      ...nextState,
      turn: { ...nextState.turn, phase: 'ACTION_PHASE' },
      pendingInteraction: null,
      kn: { ...kn, pendingRoll: null },
    };
  }
  return { state: nextState, events };
}

export function rollKNDice(
  state: GameState,
  action: Extract<GameAction, { readonly type: 'ROLL_DICE' | 'ROLL_KN_DICE' }>,
  prescribedDice?: { readonly red: number; readonly regular: number },
  options: RollDiceOptions = {},
): DispatchResult {
  if (state.kn === null) {
    return rejectAction(state, 'WRONG_PHASE', 'K+N dice are only available in a K+N match.');
  }
  if (state.turn.activePlayerId !== action.actorId) {
    return rejectAction(state, 'NOT_YOUR_TURN', 'Only the active player can roll the dice.');
  }
  if (state.turn.phase !== 'WAITING_FOR_ROLL') {
    return state.turn.dice === null
      ? rejectAction(state, 'WRONG_PHASE', 'Dice can only be rolled at the start of a normal turn.')
      : rejectAction(state, 'DICE_ALREADY_ROLLED', 'The dice have already been rolled this turn.');
  }
  if (
    prescribedDice !== undefined &&
    ![prescribedDice.red, prescribedDice.regular].every(
      (value) => Number.isSafeInteger(value) && value >= 1 && value <= 6,
    )
  ) {
    return rejectAction(state, 'INVALID_TARGET', 'Alchemist dice must each be between 1 and 6.');
  }

  let random = state.random;
  let balancedDice = state.balancedDice;
  let red: number;
  let regular: number;
  if (prescribedDice === undefined) {
    const numericRoll = rollNumericDice(state);
    random = numericRoll.random;
    balancedDice = numericRoll.balancedDice;
    red = numericRoll.dice[0];
    regular = numericRoll.dice[1];
  } else {
    red = prescribedDice.red;
    regular = prescribedDice.regular;
  }
  const eventRoll = randomInteger(random, 0, EVENT_DIE_FACES.length);
  random = eventRoll.state;
  const event = EVENT_DIE_FACES[eventRoll.value]!;
  const total = red + regular;
  const events: GameEvent[] = [
    { type: 'KN_DICE_ROLLED', playerId: action.actorId, red, regular, event, numericTotal: total },
  ];
  let nextState: GameState = {
    ...state,
    random,
    balancedDice,
    turn: {
      ...state.turn,
      dice: [red, regular],
      knDice: { red, regular, event },
      phase: 'RESOLVING_PRODUCTION',
    },
    kn: {
      ...state.kn,
      redDieResult: red,
      regularDieResult: regular,
      eventDieResult: event,
      pendingRoll: {
        playerId: action.actorId,
        red,
        regular,
        event,
        numericTotal: total,
        stage: 'EVENT',
        skipSevenDiscards: options.skipSevenDiscards === true,
        ignoreRobber: options.ignoreRobber === true,
        ...(options.discardExemptPlayerIds === undefined
          ? {}
          : { discardExemptPlayerIds: options.discardExemptPlayerIds }),
      },
      attackSummary: null,
    },
  };

  if (event === 'BARBARIAN') {
    const position = nextState.kn!.barbarianPosition + 1;
    nextState = {
      ...nextState,
      kn: { ...nextState.kn!, barbarianPosition: position },
    };
    events.push({
      type: 'BARBARIAN_ADVANCED',
      position,
      trackLength: nextState.kn!.barbarianTrackLength,
    });
    if (position >= nextState.kn!.barbarianTrackLength) {
      const attack = resolveBarbarianAttack(nextState);
      nextState = attack.state;
      events.push(...attack.events);
    }
  } else {
    const progress = resolveProgressGate(nextState, event, red);
    nextState = progress.state;
    events.push(...progress.events);
  }

  if (nextState.pendingInteraction === null) {
    nextState = {
      ...nextState,
      kn: {
        ...nextState.kn!,
        pendingRoll: { ...nextState.kn!.pendingRoll!, stage: 'NUMBER' },
      },
    };
    const numeric = resolveKNNumber(nextState);
    nextState = numeric.state;
    events.push(...numeric.events);
  }
  return acceptAction(state, action, nextState, events);
}
