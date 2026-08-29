import { afterEach, describe, expect, it } from 'vitest';

import { RoomManager } from '../../server/room-manager';
import { KN_PROGRESS_CARDS } from '../../src/engine/content/kn-progress-cards';
import { PROGRESS_CARDS } from '../../src/engine/content/progress-cards';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { getLegalSetupHouseVertexIds } from '../../src/engine/rules/setup-rules';
import { actionId, tradeId } from '../../src/engine/core/ids';

const managers: RoomManager[] = [];

function createStartedRoom() {
  const manager = new RoomManager({ onRoomChanged: () => undefined });
  managers.push(manager);
  const host = manager.create('Host', 'host-socket');
  expect(host.ok).toBe(true);
  if (!host.ok) throw new Error(host.error.message);
  const guest = manager.join(host.credentials.roomCode, 'Guest', 'guest-socket');
  expect(guest.ok).toBe(true);
  if (!guest.ok) throw new Error(guest.error.message);
  const started = manager.start(host.credentials);
  expect(started).toEqual({ ok: true });
  const room = manager.rooms.get(host.credentials.roomCode);
  if (room?.state === null || room?.state === undefined) throw new Error('Room did not start.');
  return { manager, room, host: host.credentials, guest: guest.credentials };
}

afterEach(() => {
  for (const manager of managers.splice(0)) manager.shutdown();
});

describe('authoritative online rooms', () => {
  it('creates private seats, starts only when full, and gives each socket its own view', () => {
    const manager = new RoomManager({ onRoomChanged: () => undefined });
    managers.push(manager);
    const host = manager.create('Host', 'host-socket');
    expect(host.ok).toBe(true);
    if (!host.ok) return;
    expect(manager.start(host.credentials)).toMatchObject({
      ok: false,
      error: { code: 'LOBBY_NOT_READY' },
    });
    const guest = manager.join(host.credentials.roomCode, 'Guest', 'guest-socket');
    expect(guest.ok).toBe(true);
    expect(manager.start(host.credentials)).toEqual({ ok: true });
    const targets = manager.connectedViews(host.credentials.roomCode);
    expect(targets.map((target) => target.socketId).sort()).toEqual([
      'guest-socket',
      'host-socket',
    ]);
    expect(new Set(targets.map((target) => target.view.viewerPlayerId))).toEqual(
      new Set([host.credentials.playerId, guest.ok ? guest.credentials.playerId : '']),
    );
  });

  it('rejects seat impersonation and stale revisions while treating duplicate IDs idempotently', () => {
    const { manager, room, host, guest } = createStartedRoom();
    const activePlayerId = room.state!.turn.activePlayerId;
    if (activePlayerId === null) throw new Error('No setup player.');
    const activeCredentials = activePlayerId === host.playerId ? host : guest;
    const otherCredentials = activePlayerId === host.playerId ? guest : host;
    const vertexId = getLegalSetupHouseVertexIds(room.state!)[0];
    if (vertexId === undefined) throw new Error('No legal setup target.');
    const action = {
      id: actionId('online-action-1'),
      type: 'PLACE_SETUP_HOUSE' as const,
      actorId: activePlayerId,
      vertexId,
    };

    expect(manager.submit(otherCredentials, room.revision, action)).toMatchObject({
      ok: false,
      error: { code: 'WRONG_ACTOR' },
    });
    const acceptedRevision = room.revision;
    expect(manager.submit(activeCredentials, acceptedRevision, action)).toMatchObject({ ok: true });
    expect(manager.submit(activeCredentials, acceptedRevision, action)).toMatchObject({
      ok: true,
      duplicate: true,
    });

    const roadAction = {
      id: actionId('online-action-stale'),
      type: 'PLACE_SETUP_ROAD' as const,
      actorId: activePlayerId,
      edgeId: room.state!.board.vertices[vertexId]!.connectedEdgeIds[0]!,
    };
    expect(manager.submit(activeCredentials, acceptedRevision, roadAction)).toMatchObject({
      ok: false,
      error: { code: 'STALE_REVISION' },
    });
  });

  it('allows only the host to pause and unpause the server clock', () => {
    const { manager, room, host, guest } = createStartedRoom();
    expect(manager.pause(guest, true)).toMatchObject({
      ok: false,
      error: { code: 'HOST_ONLY' },
    });
    expect(manager.pause(host, true)).toEqual({ ok: true });
    expect(room.paused).toBe(true);
    expect(room.deadlineAt).toBeNull();
    expect(manager.pause(host, false)).toEqual({ ok: true });
    expect(room.paused).toBe(false);
    expect(room.deadlineAt).toBeGreaterThan(Date.now());
  });

  it('keeps the turn deadline while a separate fifteen-second trade deadline runs', () => {
    const { manager, room, host, guest } = createStartedRoom();
    const activePlayerId = room.state!.turn.activePlayerId;
    if (activePlayerId === null) throw new Error('No active player.');
    const recipientId = activePlayerId === host.playerId ? guest.playerId : host.playerId;
    const activeCredentials = activePlayerId === host.playerId ? host : guest;
    const recipientCredentials = activePlayerId === host.playerId ? guest : host;
    room.state = {
      ...room.state!,
      players: {
        ...room.state!.players,
        [activePlayerId]: {
          ...room.state!.players[activePlayerId]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 2]]),
        },
        [recipientId]: {
          ...room.state!.players[recipientId]!,
          resources: resourceBundle([[RESOURCE_IDS.brick, 2]]),
        },
      },
      turn: { ...room.state!.turn, phase: 'ACTION_PHASE', dice: [2, 3] },
      pendingInteraction: null,
    };
    const turnDeadline = Date.now() + 45_000;
    room.timerKey = `actions-${room.state.turn.turnNumber}`;
    room.deadlineAt = turnDeadline;
    const offerId = tradeId('independent-online-trade-timer');

    expect(
      manager.submit(activeCredentials, room.revision, {
        id: actionId('create-independent-timed-trade'),
        type: 'CREATE_TRADE',
        actorId: activePlayerId,
        tradeId: offerId,
        recipientIds: [recipientId],
        offered: resourceBundle([[RESOURCE_IDS.wood, 1]]),
        requested: resourceBundle([[RESOURCE_IDS.brick, 1]]),
      }),
    ).toMatchObject({ ok: true });

    expect(room.deadlineAt).toBe(turnDeadline);
    expect(room.tradeDeadlineAt).toBeGreaterThan(Date.now() + 13_000);
    expect(room.tradeDeadlineAt).toBeLessThanOrEqual(Date.now() + 15_000);
    expect(manager.view(room, activePlayerId).game).toMatchObject({
      deadlineAt: turnDeadline,
      tradeDeadlineAt: room.tradeDeadlineAt,
    });
    expect(
      manager.submit(recipientCredentials, room.revision, {
        id: actionId('accept-independent-timed-trade'),
        type: 'RESPOND_TO_TRADE',
        actorId: recipientId,
        tradeId: offerId,
        accepted: true,
      }),
    ).toMatchObject({ ok: true });
    expect(room.deadlineAt).toBe(turnDeadline);
  });

  it('raises a low action timer only to the twenty-second floor', () => {
    const { manager, room, host, guest } = createStartedRoom();
    const activePlayerId = room.state!.turn.activePlayerId;
    if (activePlayerId === null) throw new Error('No active player.');
    const activeCredentials = activePlayerId === host.playerId ? host : guest;
    room.state = {
      ...room.state!,
      players: {
        ...room.state!.players,
        [activePlayerId]: {
          ...room.state!.players[activePlayerId]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 4]]),
        },
      },
      turn: { ...room.state!.turn, phase: 'ACTION_PHASE', dice: [2, 3] },
      pendingInteraction: null,
    };
    room.timerKey = 'choice-before-returning-to-actions';
    room.deadlineAt = Date.now() + 5_000;

    expect(
      manager.submit(activeCredentials, room.revision, {
        id: actionId('online-timer-floor-bank-trade'),
        type: 'BANK_TRADE',
        actorId: activePlayerId,
        offered: resourceBundle([[RESOURCE_IDS.wood, 4]]),
        requested: resourceBundle([[RESOURCE_IDS.grain, 1]]),
      }),
    ).toMatchObject({ ok: true });

    const remaining = (room.deadlineAt ?? 0) - Date.now();
    expect(remaining).toBeGreaterThan(19_000);
    expect(remaining).toBeLessThanOrEqual(20_000);
  });

  it('gives each online developer their own authoritative test loadout', () => {
    const { manager, room, host, guest } = createStartedRoom();
    expect(manager.setDebugMode(guest, true)).toEqual({ ok: true });
    const guestPlayer = room.state!.players[guest.playerId]!;
    expect(guestPlayer.resources[RESOURCE_IDS.wood]).toBe(99);
    expect(
      room.state!.kn === null
        ? guestPlayer.progressCardIds.length
        : guestPlayer.knProgressCardIds.length + guestPlayer.revealedKNProgressCardIds.length,
    ).toBe(room.state!.kn === null ? PROGRESS_CARDS.length : KN_PROGRESS_CARDS.length);
    expect(manager.view(room, guest.playerId).game?.debugMode).toBe(true);
    expect(manager.view(room, host.playerId).game?.debugMode).toBe(false);
    expect(manager.setDebugMode(guest, false)).toEqual({ ok: true });
    expect(manager.view(room, guest.playerId).game?.debugMode).toBe(false);
  });

  it('lets only the host create a fresh authoritative rematch', () => {
    const { manager, room, host, guest } = createStartedRoom();
    const firstGameId = room.state!.config.gameId;
    room.phase = 'FINISHED';
    expect(manager.rematch(guest)).toMatchObject({
      ok: false,
      error: { code: 'HOST_ONLY' },
    });
    expect(manager.rematch(host)).toEqual({ ok: true });
    expect(room.phase).toBe('PLAYING');
    expect(room.state!.config.gameId).not.toBe(firstGameId);
    expect(room.state!.turn.phase).toBe('SETUP_PLACE_HOUSE');
  });
});
