import { describe, expect, it } from 'vitest';

import { createOnlineGameView } from '../../src/multiplayer/projection';
import type { OnlineRoomView } from '../../src/multiplayer/protocol';
import { applyOnlineRoomPatch, createOnlineRoomPatch } from '../../src/multiplayer/view-patch';
import { colorId, knightId, mapId, modeId, vertexId } from '../../src/engine/core/ids';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

function roomView(syncVersion = 0): OnlineRoomView {
  const state = createTestGameState('ACTION_PHASE');
  return {
    protocolVersion: 1,
    code: 'ABC234',
    phase: 'PLAYING',
    viewerPlayerId: TEST_PLAYER_IDS[0],
    hostPlayerId: TEST_PLAYER_IDS[0],
    players: [
      {
        id: TEST_PLAYER_IDS[0],
        name: 'Player 1',
        colorId: colorId('cobalt'),
        connected: true,
        ready: true,
        host: true,
      },
    ],
    settings: {
      mapId: mapId('base-small'),
      modeId: modeId('classic'),
      size: 2,
      seed: 'patch-test',
      turnTimeSeconds: 60,
      victoryTarget: 10,
      discardThreshold: 7,
      hideBankCards: false,
      friendlyRobber: false,
      balancedDice: false,
      inventorsMadness: false,
    },
    game: createOnlineGameView(state, TEST_PLAYER_IDS[0], 1, [], [], false, false, null, null),
    syncVersion,
  };
}

describe('online room patches', () => {
  it('updates changed state while preserving untouched board topology by reference', () => {
    const previous = roomView();
    if (previous.game === null) throw new Error('Expected a game fixture.');
    const next: OnlineRoomView = {
      ...previous,
      game: {
        ...previous.game,
        revision: 2,
        state: {
          ...previous.game.state,
          turn: { ...previous.game.state.turn, turnNumber: 3 },
        },
      },
    };

    const patch = createOnlineRoomPatch(previous, next, 0);
    const applied = applyOnlineRoomPatch(previous, patch);

    expect(applied?.game?.revision).toBe(2);
    expect(applied?.game?.state.turn.turnNumber).toBe(3);
    expect(applied?.game?.state.board).toBe(previous.game.state.board);
    expect(JSON.stringify(patch).length).toBeLessThan(JSON.stringify(next).length / 10);
  });

  it('compacts append-only and bounded histories into array-tail operations', () => {
    const previous = roomView();
    if (previous.game === null) throw new Error('Expected a game fixture.');
    const history = Array.from({ length: 20 }, (_, index) => ({
      type: 'DICE_ROLLED' as const,
      playerId: TEST_PLAYER_IDS[0],
      dice: [1 + (index % 6), 1 + ((index * 3) % 6)] as const,
    }));
    const appendedEvent = {
      type: 'DICE_ROLLED' as const,
      playerId: TEST_PLAYER_IDS[1],
      dice: [6, 6] as const,
    };
    const withHistory: OnlineRoomView = {
      ...previous,
      game: { ...previous.game, eventHistory: history },
    };
    const next: OnlineRoomView = {
      ...withHistory,
      game: { ...withHistory.game!, eventHistory: [...history.slice(1), appendedEvent] },
    };

    const patch = createOnlineRoomPatch(withHistory, next, 0);
    const historyOperation = patch.operations.find(
      (operation) => operation.path.join('.') === 'game.eventHistory',
    );

    expect(historyOperation?.type).toBe('ARRAY_TAIL');
    expect(applyOnlineRoomPatch(withHistory, patch)?.game?.eventHistory).toEqual(
      next.game?.eventHistory,
    );
  });

  it('delivers a newly built Knight and its board occupancy in one applied room update', () => {
    const base = roomView();
    if (base.game === null) throw new Error('Expected a game fixture.');
    const targetVertexId = vertexId('online-knight-vertex');
    const vertex = {
      id: targetVertexId,
      adjacentHexIds: [],
      connectedEdgeIds: [],
      adjacentVertexIds: [],
      building: null,
      knightId: null,
      portId: null,
    };
    const previous: OnlineRoomView = {
      ...base,
      game: {
        ...base.game,
        state: {
          ...base.game.state,
          board: {
            ...base.game.state.board,
            vertices: { ...base.game.state.board.vertices, [targetVertexId]: vertex },
          },
        },
      },
    };
    const previousGame = previous.game;
    if (previousGame === null) throw new Error('Expected the prepared game fixture.');
    const player = previousGame.state.players[TEST_PLAYER_IDS[0]]!;
    const knight = {
      id: knightId('online-new-knight'),
      ownerId: player.id,
      vertexId: vertex.id,
      level: 1 as const,
      active: false,
      placedTurn: previousGame.state.turn.turnNumber,
      activeSinceTurn: null,
      lastActionTurn: null,
      upgradedTurn: null,
    };
    const next: OnlineRoomView = {
      ...previous,
      game: {
        ...previousGame,
        revision: 2,
        state: {
          ...previousGame.state,
          players: {
            ...previousGame.state.players,
            [player.id]: { ...player, knights: [...player.knights, knight] },
          },
          board: {
            ...previousGame.state.board,
            vertices: {
              ...previousGame.state.board.vertices,
              [vertex.id]: { ...vertex, knightId: knight.id },
            },
          },
        },
      },
    };

    const applied = applyOnlineRoomPatch(previous, createOnlineRoomPatch(previous, next, 0));

    expect(applied?.game?.state.players[player.id]?.knights).toContainEqual(knight);
    expect(applied?.game?.state.board.vertices[vertex.id]?.knightId).toBe(knight.id);
  });

  it('rejects stale, skipped, or unsafe patches', () => {
    const current = roomView(2);
    expect(
      applyOnlineRoomPatch(current, {
        roomCode: current.code,
        baseVersion: 1,
        version: 2,
        operations: [],
      }),
    ).toBeNull();
    expect(
      applyOnlineRoomPatch(current, {
        roomCode: current.code,
        baseVersion: 2,
        version: 3,
        operations: [{ type: 'SET', path: ['__proto__', 'polluted'], value: true }],
      }),
    ).toBeNull();
  });
});
