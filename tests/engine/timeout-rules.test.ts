import { describe, expect, it } from 'vitest';

import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { KN_PROGRESS_CARDS } from '../../src/engine/content/kn-progress-cards';
import { resourceBundle } from '../../src/engine/content/types';
import { createGame } from '../../src/engine/core/create-game';
import { dispatch } from '../../src/engine/core/game-engine';
import type { GameState } from '../../src/engine/core/game-state';
import { actionId } from '../../src/engine/core/ids';
import { rollKNDice } from '../../src/engine/rules/kn-turn-rules';
import { createTestConfig, createTestKNConfig } from '../helpers/game-state';
import { TEST_PLAYER_IDS } from '../helpers/game-state';

function createdState(kn = false): GameState {
  const result = createGame(kn ? createTestKNConfig() : createTestConfig());
  if (!result.ok) throw new Error('Timeout fixture failed to initialize.');
  return result.state;
}

describe('automatic timeout actions', () => {
  it('places a legal setup building and records that the timer made the move', () => {
    const state = createdState();
    const actorId = state.turn.activePlayerId;
    if (actorId === null) throw new Error('Setup fixture has no active player.');

    const result = dispatch(state, {
      id: actionId('setup-house-timeout'),
      type: 'AUTO_TIMEOUT',
      actorId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn.phase).toBe('SETUP_PLACE_ROAD');
    expect(
      Object.values(result.state.board.vertices).some(
        (vertex) => vertex.building?.ownerId === actorId,
      ),
    ).toBe(true);
    expect(result.state.actionHistory.at(-1)?.actionType).toBe('AUTO_TIMEOUT');
  });

  it('chooses one die from each Alchemist row when its progress timer expires', () => {
    const original = createdState(true);
    const actorId = original.turn.activePlayerId;
    const definition = KN_PROGRESS_CARDS.find((card) => card.effect === 'ALCHEMIST');
    const card = Object.values(original.kn?.progressCards ?? {}).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    const player = actorId === null ? undefined : original.players[actorId];
    if (
      original.kn === null ||
      actorId === null ||
      definition === undefined ||
      card === undefined ||
      player === undefined
    ) {
      throw new Error('Alchemist timeout fixture is incomplete.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [actorId]: { ...player, knProgressCardIds: [card.instanceId] },
      },
      turn: {
        ...original.turn,
        phase: 'WAITING_FOR_ROLL',
        turnNumber: 3,
        dice: null,
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      pendingInteraction: null,
      kn: {
        ...original.kn,
        progressDecks: {
          ...original.kn.progressDecks,
          [definition.family]: original.kn.progressDecks[definition.family].filter(
            (id) => id !== card.instanceId,
          ),
        },
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: { ...card, ownerId: actorId, drawnTurn: 2 },
        },
      },
    };
    const activated = dispatch(state, {
      id: actionId('activate-alchemist-timeout'),
      type: 'PLAY_KN_PROGRESS_CARD',
      actorId,
      cardInstanceId: card.instanceId,
    });
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;

    const timedOut = dispatch(activated.state, {
      id: actionId('alchemist-timeout'),
      type: 'AUTO_TIMEOUT',
      actorId,
    });
    expect(timedOut.ok).toBe(true);
    if (!timedOut.ok) return;
    expect(timedOut.state.turn.dice?.every((value) => value >= 1 && value <= 6)).toBe(true);
    expect(timedOut.state.actionHistory.at(-1)?.actionType).toBe('AUTO_TIMEOUT');
    expect(timedOut.events).toContainEqual(expect.objectContaining({ type: 'KN_DICE_ROLLED' }));
  });

  it('moves the robber to an opponent-adjacent tile and completes the steal when time expires', () => {
    const original = createdState();
    const actorId = original.turn.activePlayerId;
    if (actorId === null) throw new Error('Robber fixture has no active player.');
    const opponent = Object.values(original.players).find((player) => player.id !== actorId);
    const targetHex = Object.values(original.board.hexes).find(
      (hex) => hex.id !== original.board.robberHexId,
    );
    const vertexId = targetHex?.vertexIds[0];
    if (opponent === undefined || targetHex === undefined || vertexId === undefined) {
      throw new Error('Robber fixture is incomplete.');
    }
    const vertex = original.board.vertices[vertexId]!;
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [opponent.id]: {
          ...opponent,
          resources: resourceBundle([[RESOURCE_IDS.wood, 1]]),
        },
      },
      board: {
        ...original.board,
        vertices: {
          ...original.board.vertices,
          [vertexId]: {
            ...vertex,
            building: { ownerId: opponent.id, type: 'HOUSE' },
            knightId: null,
          },
        },
      },
      turn: {
        ...original.turn,
        activePlayerId: actorId,
        turnNumber: 3,
        phase: 'MOVE_ROBBER',
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      pendingInteraction: { type: 'MOVE_ROBBER', playerId: actorId },
    };

    const result = dispatch(state, {
      id: actionId('robber-timeout'),
      type: 'AUTO_TIMEOUT',
      actorId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const destination = result.state.board.robberHexId;
    expect(destination).not.toBeNull();
    expect(
      destination === null
        ? false
        : result.state.board.hexes[destination]?.vertexIds.includes(vertexId),
    ).toBe(true);
    expect(result.state.turn.phase).toBe('ACTION_PHASE');
    expect(result.state.players[actorId]?.resources[RESOURCE_IDS.wood]).toBe(1);
    expect(result.state.actionHistory.at(-1)?.actionType).toBe('AUTO_TIMEOUT');
  });

  it('ends an action phase automatically instead of remaining at zero', () => {
    const original = createdState();
    const actorId = original.turn.activePlayerId;
    if (actorId === null) throw new Error('Action timeout fixture has no active player.');
    const state: GameState = {
      ...original,
      turn: {
        ...original.turn,
        phase: 'ACTION_PHASE',
        dice: [2, 4],
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      pendingInteraction: null,
    };

    const result = dispatch(state, {
      id: actionId('action-phase-timeout'),
      type: 'AUTO_TIMEOUT',
      actorId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn.phase).toBe('WAITING_FOR_ROLL');
    expect(result.state.turn.activePlayerId).not.toBe(actorId);
    expect(result.state.actionHistory.at(-1)?.actionType).toBe('AUTO_TIMEOUT');
  });

  it('randomly discards the required number of cards for the queued player', () => {
    const original = createdState();
    const discardPlayerId = TEST_PLAYER_IDS[1];
    const player = original.players[discardPlayerId];
    if (player === undefined) throw new Error('Discard timeout fixture has no queued player.');
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [discardPlayerId]: {
          ...player,
          resources: resourceBundle([
            [RESOURCE_IDS.wood, 2],
            [RESOURCE_IDS.brick, 2],
            [RESOURCE_IDS.grain, 2],
            [RESOURCE_IDS.livestock, 2],
          ]),
        },
      },
      turn: {
        ...original.turn,
        phase: 'DISCARD_RESOURCES',
        dice: [3, 4],
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      pendingInteraction: {
        type: 'DISCARD_RESOURCES',
        queue: [discardPlayerId],
        requiredCounts: { [discardPlayerId]: 4 },
      },
    };

    const result = dispatch(state, {
      id: actionId('discard-timeout'),
      type: 'AUTO_TIMEOUT',
      actorId: discardPlayerId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const remainingCards = Object.values(
      result.state.players[discardPlayerId]?.resources ?? {},
    ).reduce<number>((total, amount) => total + (amount ?? 0), 0);
    expect(remainingCards).toBe(4);
    expect(result.state.random.draws - state.random.draws).toBe(4);
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'RESOURCES_DISCARDED', playerId: discardPlayerId }),
    );
    expect(result.state.turn.phase).toBe('MOVE_ROBBER');
  });

  it('randomly gives the required Wedding cards when its victim runs out of time', () => {
    const original = createdState(true);
    if (original.kn === null) throw new Error('Wedding timeout fixture has no K+N state.');
    const initiatorId = TEST_PLAYER_IDS[0];
    const victimId = TEST_PLAYER_IDS[1];
    const definition = KN_PROGRESS_CARDS.find((card) => card.effect === 'WEDDING');
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    if (definition === undefined || card === undefined) {
      throw new Error('Wedding timeout fixture has no Wedding card.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [initiatorId]: {
          ...original.players[initiatorId]!,
          resources: resourceBundle([]),
          knProgressCardIds: [],
        },
        [victimId]: {
          ...original.players[victimId]!,
          resources: resourceBundle([
            [RESOURCE_IDS.wood, 2],
            [RESOURCE_IDS.brick, 1],
          ]),
        },
      },
      turn: {
        ...original.turn,
        activePlayerId: initiatorId,
        turnNumber: 4,
        phase: 'CARD_RESOLUTION',
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: victimId,
        purpose: 'WEDDING_CARDS',
        sourceCardId: card.instanceId,
        eligibleIds: [RESOURCE_IDS.wood, RESOURCE_IDS.brick],
        minimumSelections: 2,
        maximumSelections: 2,
        queue: [victimId],
        canCancel: false,
        context: { activePlayerId: initiatorId },
      },
      kn: {
        ...original.kn,
        progressDecks: {
          ...original.kn.progressDecks,
          [definition.family]: original.kn.progressDecks[definition.family].filter(
            (id) => id !== card.instanceId,
          ),
        },
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: {
            ...card,
            ownerId: initiatorId,
            playedTurn: original.turn.turnNumber,
          },
        },
      },
    };

    const result = dispatch(state, {
      id: actionId('wedding-timeout'),
      type: 'AUTO_TIMEOUT',
      actorId: victimId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const initiatorCards = Object.values(
      result.state.players[initiatorId]?.resources ?? {},
    ).reduce<number>((total, amount) => total + (amount ?? 0), 0);
    const victimCards = Object.values(
      result.state.players[victimId]?.resources ?? {},
    ).reduce<number>((total, amount) => total + (amount ?? 0), 0);
    expect(initiatorCards).toBe(2);
    expect(victimCards).toBe(1);
    expect(result.state.random.draws - state.random.draws).toBe(2);
    expect(result.state.pendingInteraction).toBeNull();
    expect(result.state.actionHistory.at(-1)?.actionType).toBe('AUTO_TIMEOUT');
  });

  it('cancels an uncommitted Progress Card preview before ending the timed-out turn', () => {
    const original = createdState(true);
    if (original.kn === null) throw new Error('Preview timeout fixture has no K+N state.');
    const actorId = TEST_PLAYER_IDS[0];
    const definition = KN_PROGRESS_CARDS.find((card) => card.effect === 'MERCHANT');
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    const hex = Object.values(original.board.hexes).find(
      (candidate) => candidate.resourceId !== null,
    );
    if (definition === undefined || card === undefined || hex === undefined) {
      throw new Error('Preview timeout fixture is incomplete.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [actorId]: { ...original.players[actorId]!, knProgressCardIds: [] },
      },
      turn: {
        ...original.turn,
        activePlayerId: actorId,
        turnNumber: 4,
        phase: 'CARD_RESOLUTION',
        dice: [3, 4],
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: actorId,
        purpose: 'MERCHANT_HEX',
        sourceCardId: card.instanceId,
        eligibleIds: [hex.id],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [actorId],
        canCancel: true,
        context: {},
      },
      kn: {
        ...original.kn,
        progressDecks: {
          ...original.kn.progressDecks,
          [definition.family]: original.kn.progressDecks[definition.family].filter(
            (id) => id !== card.instanceId,
          ),
        },
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: {
            ...card,
            ownerId: actorId,
            playedTurn: original.turn.turnNumber,
          },
        },
      },
    };

    const result = dispatch(state, {
      id: actionId('preview-turn-timeout'),
      type: 'AUTO_TIMEOUT',
      actorId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[actorId]?.knProgressCardIds).toContain(card.instanceId);
    expect(result.state.kn?.progressCards[card.instanceId]?.playedTurn).toBeNull();
    expect(result.state.turn.activePlayerId).not.toBe(actorId);
    expect(result.state.turn.phase).toBe('WAITING_FOR_ROLL');
    expect(result.state.actionHistory).toHaveLength(state.actionHistory.length + 1);
    expect(result.state.actionHistory.at(-1)?.actionType).toBe('AUTO_TIMEOUT');
  });

  it('preserves admin-mode seven-discard suppression in a K+N roll', () => {
    const original = createdState(true);
    const actorId = original.turn.activePlayerId;
    if (actorId === null || original.kn === null) {
      throw new Error('K+N timeout fixture is incomplete.');
    }
    const state: GameState = {
      ...original,
      players: Object.fromEntries(
        Object.entries(original.players).map(([id, player]) => [
          id,
          {
            ...player,
            resources: resourceBundle([[RESOURCE_IDS.wood, id === actorId ? 99 : 9]]),
          },
        ]),
      ),
      turn: {
        ...original.turn,
        activePlayerId: actorId,
        turnNumber: 3,
        phase: 'WAITING_FOR_ROLL',
        dice: null,
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      pendingInteraction: null,
      kn: { ...original.kn, firstBarbarianAttackResolved: true },
    };

    const result = rollKNDice(
      state,
      { id: actionId('kn-seven-admin'), type: 'ROLL_KN_DICE', actorId },
      { red: 3, regular: 4 },
      { skipSevenDiscards: true },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turn.phase).toBe('MOVE_ROBBER');
    expect(result.state.pendingInteraction).toEqual({ type: 'MOVE_ROBBER', playerId: actorId });
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'ROBBER_SEQUENCE_STARTED',
        playerId: actorId,
        discardPlayerIds: [],
      }),
    );
  });
});
