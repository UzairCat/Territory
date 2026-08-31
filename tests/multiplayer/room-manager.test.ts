import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoomManager } from '../../server/room-manager';
import { PLAYER_AVATARS } from '../../src/engine/content/avatars';
import { PLAYER_COLORS } from '../../src/engine/content/colors';
import { KN_PROGRESS_CARDS } from '../../src/engine/content/kn-progress-cards';
import { PROGRESS_CARDS } from '../../src/engine/content/progress-cards';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { getLegalSetupHouseVertexIds } from '../../src/engine/rules/setup-rules';
import { actionId, tradeId } from '../../src/engine/core/ids';
import { KN_MODE } from '../../src/engine/modes/kn';
import {
  MATCH_DISCONNECT_GRACE_MS,
  type OnlineSessionCredentials,
} from '../../src/multiplayer/protocol';

const managers: RoomManager[] = [];

function readyPlayers(
  manager: RoomManager,
  ...credentials: readonly OnlineSessionCredentials[]
): void {
  for (const playerCredentials of credentials) {
    expect(manager.setReady(playerCredentials, true)).toEqual({ ok: true });
  }
}

function createStartedRoom(kNMode = false) {
  const manager = new RoomManager({ onRoomChanged: () => undefined });
  managers.push(manager);
  const host = manager.create('Host', 'host-socket');
  expect(host.ok).toBe(true);
  if (!host.ok) throw new Error(host.error.message);
  const guest = manager.join(host.credentials.roomCode, 'Guest', 'guest-socket');
  expect(guest.ok).toBe(true);
  if (!guest.ok) throw new Error(guest.error.message);
  if (kNMode) {
    expect(
      manager.updateSettings(host.credentials, {
        ...host.room.settings,
        modeId: KN_MODE.id,
        victoryTarget: KN_MODE.rules.victoryTarget,
      }),
    ).toEqual({ ok: true });
  }
  readyPlayers(manager, host.credentials, guest.credentials);
  const started = manager.start(host.credentials);
  expect(started).toEqual({ ok: true });
  const room = manager.rooms.get(host.credentials.roomCode);
  if (room?.state === null || room?.state === undefined) throw new Error('Room did not start.');
  return { manager, room, host: host.credentials, guest: guest.credentials };
}

afterEach(() => {
  for (const manager of managers.splice(0)) manager.shutdown();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('authoritative online rooms', () => {
  it('reclaims a started room after every player remains disconnected', () => {
    vi.useFakeTimers();
    const manager = new RoomManager({
      onRoomChanged: () => undefined,
      inactiveRoomTtlMs: 1_000,
    });
    managers.push(manager);
    const host = manager.create('Host', 'inactive-host-socket');
    expect(host.ok).toBe(true);
    if (!host.ok) throw new Error(host.error.message);
    const guest = manager.join(host.credentials.roomCode, 'Guest', 'inactive-guest-socket');
    expect(guest.ok).toBe(true);
    if (!guest.ok) throw new Error(guest.error.message);
    readyPlayers(manager, host.credentials, guest.credentials);
    expect(manager.start(host.credentials)).toEqual({ ok: true });
    const room = manager.rooms.get(host.credentials.roomCode);
    if (room === undefined) throw new Error('Inactive room fixture disappeared before disconnect.');

    manager.disconnect('inactive-host-socket');
    manager.disconnect('inactive-guest-socket');
    expect(room.timer).toBeNull();
    expect(room.deadlineAt).toBeNull();
    vi.advanceTimersByTime(999);
    expect(manager.rooms.has(host.credentials.roomCode)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(manager.rooms.has(host.credentials.roomCode)).toBe(false);
  });

  it('suspends abandoned match timers and restarts them when a player reconnects', () => {
    const { manager, room, host } = createStartedRoom();
    manager.disconnect('host-socket');
    manager.disconnect('guest-socket');

    expect(room.timer).toBeNull();
    expect(room.deadlineAt).toBeNull();
    expect(manager.resume(host, 'resumed-host-socket')).toMatchObject({ ok: true });
    expect(room.timer).not.toBeNull();
    expect(room.deadlineAt).toBeGreaterThan(Date.now());
  });

  it('shows a three-minute match absence window, then removes the seat and its pieces', () => {
    vi.useFakeTimers();
    const { manager, room, host, guest } = createStartedRoom();
    const vertex = Object.values(room.state!.board.vertices)[0];
    const edge = Object.values(room.state!.board.edges)[0];
    if (vertex === undefined || edge === undefined)
      throw new Error('Online board fixture is empty.');
    const bankWoodBefore = room.state!.bank[RESOURCE_IDS.wood] ?? 0;
    room.state = {
      ...room.state!,
      players: {
        ...room.state!.players,
        [guest.playerId]: {
          ...room.state!.players[guest.playerId]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 2]]),
        },
      },
      board: {
        ...room.state!.board,
        vertices: {
          ...room.state!.board.vertices,
          [vertex.id]: {
            ...vertex,
            building: { ownerId: guest.playerId, type: 'HOUSE' },
          },
        },
        edges: {
          ...room.state!.board.edges,
          [edge.id]: { ...edge, roadOwnerId: guest.playerId },
        },
      },
    };

    const disconnectedAt = Date.now();
    manager.disconnect('guest-socket');
    expect(
      manager.view(room, host.playerId).players.find((player) => player.id === guest.playerId),
    ).toMatchObject({
      connected: false,
      disconnectDeadlineAt: disconnectedAt + MATCH_DISCONNECT_GRACE_MS,
    });

    vi.advanceTimersByTime(MATCH_DISCONNECT_GRACE_MS - 1);
    expect(room.members.has(guest.playerId)).toBe(true);
    expect(room.state.board.vertices[vertex.id]?.building?.ownerId).toBe(guest.playerId);

    vi.advanceTimersByTime(1);
    expect(room.members.has(guest.playerId)).toBe(false);
    expect(room.state.players[guest.playerId]).toBeUndefined();
    expect(room.state.config.players.some((player) => player.id === guest.playerId)).toBe(false);
    expect(room.state.board.vertices[vertex.id]?.building).toBeNull();
    expect(room.state.board.edges[edge.id]?.roadOwnerId).toBeNull();
    expect(room.state.bank[RESOURCE_IDS.wood]).toBe(bankWoodBefore + 2);
  });

  it('cancels match-seat removal when the absent player reconnects', () => {
    vi.useFakeTimers();
    const { manager, room, guest } = createStartedRoom();
    manager.disconnect('guest-socket');
    vi.advanceTimersByTime(MATCH_DISCONNECT_GRACE_MS - 10_000);

    expect(manager.resume(guest, 'guest-reconnected-socket')).toMatchObject({ ok: true });
    expect(
      manager.view(room, guest.playerId).players.find((player) => player.id === guest.playerId),
    ).toMatchObject({ connected: true, disconnectDeadlineAt: null });

    vi.advanceTimersByTime(10_001);
    expect(room.members.has(guest.playerId)).toBe(true);
    expect(room.state!.players[guest.playerId]).toBeDefined();
  });

  it('freezes an absent player countdown while the match is paused', () => {
    vi.useFakeTimers();
    const { manager, room, host, guest } = createStartedRoom();
    manager.disconnect('guest-socket');
    vi.advanceTimersByTime(60_000);

    expect(manager.pause(host, true)).toEqual({ ok: true });
    const pausedDeadline = manager
      .view(room, host.playerId)
      .players.find((player) => player.id === guest.playerId)?.disconnectDeadlineAt;
    if (pausedDeadline === null || pausedDeadline === undefined) {
      throw new Error('Paused disconnect deadline is missing.');
    }
    const remainingAtPause = pausedDeadline - Date.now();
    expect(remainingAtPause).toBe(120_000);

    vi.advanceTimersByTime(5 * 60_000);
    expect(room.members.has(guest.playerId)).toBe(true);
    const frozenDeadline = manager
      .view(room, host.playerId)
      .players.find((player) => player.id === guest.playerId)?.disconnectDeadlineAt;
    if (frozenDeadline === null || frozenDeadline === undefined) {
      throw new Error('Frozen disconnect deadline is missing.');
    }
    const remainingAfterWait = frozenDeadline - Date.now();
    expect(remainingAfterWait).toBe(remainingAtPause);

    room.pausedRemainingMs = 10 * 60_000;
    expect(manager.pause(host, false)).toEqual({ ok: true });
    vi.advanceTimersByTime(remainingAtPause - 1);
    expect(room.members.has(guest.playerId)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(room.members.has(guest.playerId)).toBe(false);
  });

  it('randomly assigns different preset portraits to joining online guests', () => {
    const manager = new RoomManager({ onRoomChanged: () => undefined });
    managers.push(manager);
    const host = manager.create('Host', 'host-random-avatar-socket');
    expect(host.ok).toBe(true);
    if (!host.ok) throw new Error(host.error.message);
    const guest = manager.join(host.credentials.roomCode, 'Guest', 'guest-random-avatar-socket');
    expect(guest.ok).toBe(true);
    if (!guest.ok) throw new Error(guest.error.message);

    const avatars = manager
      .view(manager.rooms.get(host.credentials.roomCode)!, host.credentials.playerId)
      .players.map((player) => player.avatarId);
    expect(new Set(avatars)).toHaveProperty('size', 2);
  });

  it('lets each guest choose a validated preset avatar and an unused lobby color', () => {
    const manager = new RoomManager({ onRoomChanged: () => undefined });
    managers.push(manager);
    const host = manager.create('Host', 'host-profile-socket');
    expect(host.ok).toBe(true);
    if (!host.ok) throw new Error(host.error.message);
    const guest = manager.join(host.credentials.roomCode, 'Guest', 'guest-profile-socket');
    expect(guest.ok).toBe(true);
    if (!guest.ok) throw new Error(guest.error.message);
    const avatar = PLAYER_AVATARS.find((candidate) => candidate.id === 'navigator')!;
    const usedColors = manager
      .view(manager.rooms.get(host.credentials.roomCode)!, host.credentials.playerId)
      .players.map((player) => player.colorId);
    const color = PLAYER_COLORS.find((candidate) => !usedColors.includes(candidate.id))!;

    expect(manager.updateProfile(guest.credentials, avatar.id, color.id)).toEqual({ ok: true });
    expect(
      manager
        .view(manager.rooms.get(host.credentials.roomCode)!, host.credentials.playerId)
        .players.find((player) => player.id === guest.credentials.playerId),
    ).toMatchObject({ avatarId: avatar.id, colorId: color.id });
    expect(manager.updateProfile(host.credentials, avatar.id, color.id)).toMatchObject({
      ok: false,
      error: { code: 'COLOR_TAKEN' },
    });

    readyPlayers(manager, host.credentials, guest.credentials);
    expect(manager.start(host.credentials)).toEqual({ ok: true });
    const room = manager.rooms.get(host.credentials.roomCode)!;
    expect(room.state?.players[guest.credentials.playerId]).toMatchObject({
      avatarId: avatar.id,
      colorId: color.id,
    });
    expect(manager.updateProfile(guest.credentials, avatar.id, color.id)).toMatchObject({
      ok: false,
      error: { code: 'MATCH_ALREADY_STARTED' },
    });
  });

  it('assigns every online arrival a valid unused color', () => {
    const manager = new RoomManager({ onRoomChanged: () => undefined });
    managers.push(manager);
    const host = manager.create('Host', 'random-color-host');
    expect(host.ok).toBe(true);
    if (!host.ok) throw new Error(host.error.message);
    const guest = manager.join(host.credentials.roomCode, 'Guest', 'random-color-guest');
    expect(guest.ok).toBe(true);
    if (!guest.ok) throw new Error(guest.error.message);

    const colors = manager
      .view(manager.rooms.get(host.credentials.roomCode)!, host.credentials.playerId)
      .players.map((player) => player.colorId);
    expect(colors.every((colorId) => PLAYER_COLORS.some((color) => color.id === colorId))).toBe(
      true,
    );
    expect(new Set(colors)).toHaveProperty('size', 2);
  });

  it('starts only when every full-room player is ready without settings clearing readiness', () => {
    const manager = new RoomManager({ onRoomChanged: () => undefined });
    managers.push(manager);
    const host = manager.create('Host', 'host-socket');
    expect(host.ok).toBe(true);
    if (!host.ok) return;
    expect(host.room.players).toHaveLength(1);
    expect(host.room.players[0]).toMatchObject({ ready: false });
    expect(manager.start(host.credentials)).toMatchObject({
      ok: false,
      error: { code: 'LOBBY_NOT_READY' },
    });

    expect(manager.setReady(host.credentials, true)).toEqual({ ok: true });
    expect(
      manager
        .view(manager.rooms.get(host.credentials.roomCode)!, host.credentials.playerId)
        .players.find((player) => player.id === host.credentials.playerId),
    ).toMatchObject({ ready: true });
    expect(
      manager.updateSettings(host.credentials, {
        ...host.room.settings,
        seed: 'settings-do-not-clear-ready',
      }),
    ).toEqual({ ok: true });
    expect(
      manager
        .view(manager.rooms.get(host.credentials.roomCode)!, host.credentials.playerId)
        .players.find((player) => player.id === host.credentials.playerId),
    ).toMatchObject({ ready: true });

    const guest = manager.join(host.credentials.roomCode, 'Guest', 'guest-socket');
    expect(guest.ok).toBe(true);
    if (!guest.ok) return;
    expect(
      guest.room.players.find((player) => player.id === guest.credentials.playerId),
    ).toMatchObject({
      ready: false,
    });
    expect(manager.start(host.credentials)).toMatchObject({
      ok: false,
      error: { code: 'PLAYERS_NOT_READY' },
    });

    expect(manager.setReady(guest.credentials, true)).toEqual({ ok: true });
    expect(manager.setReady(guest.credentials, false)).toEqual({ ok: true });
    expect(manager.start(host.credentials)).toMatchObject({
      ok: false,
      error: { code: 'PLAYERS_NOT_READY' },
    });
    expect(manager.setReady(guest.credentials, true)).toEqual({ ok: true });
    const readyRoom = manager.rooms.get(host.credentials.roomCode)!;
    expect(
      manager.updateSettings(host.credentials, {
        ...readyRoom.settings,
        victoryTarget: readyRoom.settings.victoryTarget + 1,
      }),
    ).toEqual({ ok: true });
    expect(
      manager.view(readyRoom, host.credentials.playerId).players.every((player) => player.ready),
    ).toBe(true);
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

  it('accepts concurrent reward choices from one shared revision and deadline', () => {
    const { manager, room, host, guest } = createStartedRoom(true);
    if (room.state?.kn === null || room.state === null) {
      throw new Error('Concurrent reward room did not start in K+N mode.');
    }
    room.state = {
      ...room.state,
      turn: {
        ...room.state.turn,
        activePlayerId: host.playerId,
        phase: 'CARD_RESOLUTION',
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: host.playerId,
        purpose: 'AQUEDUCT_RESOURCE',
        eligibleIds: [RESOURCE_IDS.wood, RESOURCE_IDS.ore],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [host.playerId, guest.playerId],
        simultaneous: true,
        canCancel: false,
        context: {},
      },
    };
    const sharedRevision = room.revision;
    const sharedDeadline = Date.now() + 12_000;
    room.timerKey = `choice-${room.state.turn.turnNumber}-AQUEDUCT_RESOURCE-simultaneous`;
    room.deadlineAt = sharedDeadline;

    expect(
      manager.submit(host, sharedRevision, {
        id: actionId('concurrent-aqueduct-host'),
        type: 'RESOLVE_PROGRESS_SELECTION',
        actorId: host.playerId,
        selections: [RESOURCE_IDS.wood],
      }),
    ).toMatchObject({ ok: true });
    expect(room.deadlineAt).toBe(sharedDeadline);
    expect(room.state.pendingInteraction).toMatchObject({
      playerId: guest.playerId,
      queue: [guest.playerId],
      simultaneous: true,
    });

    expect(
      manager.submit(guest, sharedRevision, {
        id: actionId('concurrent-aqueduct-guest-stale-revision'),
        type: 'RESOLVE_PROGRESS_SELECTION',
        actorId: guest.playerId,
        selections: [RESOURCE_IDS.ore],
      }),
    ).toMatchObject({ ok: true });
    expect(room.state.players[host.playerId]?.resources[RESOURCE_IDS.wood]).toBe(1);
    expect(room.state.players[guest.playerId]?.resources[RESOURCE_IDS.ore]).toBe(1);
    expect(room.state.pendingInteraction).toBeNull();
  });

  it('accepts simultaneous seven discards from one shared revision and deadline', () => {
    const { manager, room, host, guest } = createStartedRoom();
    if (room.state === null) throw new Error('Concurrent discard room did not start.');
    room.state = {
      ...room.state,
      players: {
        ...room.state.players,
        [host.playerId]: {
          ...room.state.players[host.playerId]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 8]]),
        },
        [guest.playerId]: {
          ...room.state.players[guest.playerId]!,
          resources: resourceBundle([[RESOURCE_IDS.brick, 8]]),
        },
      },
      turn: {
        ...room.state.turn,
        activePlayerId: host.playerId,
        phase: 'DISCARD_RESOURCES',
        dice: [3, 4],
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      pendingInteraction: {
        type: 'DISCARD_RESOURCES',
        queue: [host.playerId, guest.playerId],
        requiredCounts: { [host.playerId]: 4, [guest.playerId]: 4 },
      },
    };
    const sharedRevision = room.revision;
    const sharedDeadline = Date.now() + 12_000;
    room.timerKey = `discard-${room.state.turn.turnNumber}-simultaneous`;
    room.deadlineAt = sharedDeadline;

    expect(
      manager.submit(host, sharedRevision, {
        id: actionId('concurrent-discard-host'),
        type: 'DISCARD_RESOURCES',
        actorId: host.playerId,
        resources: resourceBundle([[RESOURCE_IDS.wood, 4]]),
      }),
    ).toMatchObject({ ok: true });
    expect(room.deadlineAt).toBe(sharedDeadline);
    expect(room.state.pendingInteraction).toEqual({
      type: 'DISCARD_RESOURCES',
      queue: [guest.playerId],
      requiredCounts: { [guest.playerId]: 4 },
    });

    expect(
      manager.submit(guest, sharedRevision, {
        id: actionId('concurrent-discard-guest-stale-revision'),
        type: 'DISCARD_RESOURCES',
        actorId: guest.playerId,
        resources: resourceBundle([[RESOURCE_IDS.brick, 4]]),
      }),
    ).toMatchObject({ ok: true });
    expect(room.state.turn.phase).toBe('MOVE_ROBBER');
    expect(room.state.pendingInteraction).toEqual({
      type: 'MOVE_ROBBER',
      playerId: host.playerId,
    });
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

  it('returns the shared match to its existing lobby without removing any seats', () => {
    const { manager, room, host, guest } = createStartedRoom();
    const memberIds = [...room.members.keys()];
    const completedSeed = room.settings.seed;

    expect(manager.returnToLobby(guest)).toMatchObject({
      ok: false,
      error: { code: 'HOST_ONLY' },
    });
    expect(manager.returnToLobby(host)).toEqual({ ok: true });

    expect(room.phase).toBe('LOBBY');
    expect(room.state).toBeNull();
    expect(room.settings.seed).not.toBe(completedSeed);
    expect(room.previousSeed).toBe(completedSeed);
    expect([...room.members.keys()]).toEqual(memberIds);
    expect(manager.view(room, host.playerId)).toMatchObject({
      phase: 'LOBBY',
      viewerPlayerId: host.playerId,
      previousSeed: completedSeed,
      game: null,
    });

    expect(manager.updateSettings(host, { ...room.settings, seed: completedSeed })).toEqual({
      ok: true,
    });
    expect(manager.view(room, host.playerId).players.every((player) => !player.ready)).toBe(true);
    readyPlayers(manager, host, guest);
    expect(manager.start(host)).toEqual({ ok: true });
    expect(room.state?.config.seed).toBe(completedSeed);
    expect(manager.resume(host, 'host-returned-socket')).toMatchObject({ ok: true });
  });

  it('allows the Admin username to use production debug controls while rejecting other names', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const manager = new RoomManager({ onRoomChanged: () => undefined });
    managers.push(manager);
    const admin = manager.create('Admin', 'admin-socket');
    expect(admin.ok).toBe(true);
    if (!admin.ok) throw new Error(admin.error.message);
    const guest = manager.join(admin.credentials.roomCode, 'Guest', 'guest-socket');
    expect(guest.ok).toBe(true);
    if (!guest.ok) throw new Error(guest.error.message);
    readyPlayers(manager, admin.credentials, guest.credentials);
    expect(manager.start(admin.credentials)).toEqual({ ok: true });
    const room = manager.rooms.get(admin.credentials.roomCode);
    if (room?.state === null || room?.state === undefined)
      throw new Error('Admin room did not start.');

    expect(manager.setDebugMode(guest.credentials, true)).toMatchObject({
      ok: false,
      error: { code: 'DEBUG_DISABLED' },
    });
    expect(manager.setDebugMode(admin.credentials, true)).toEqual({ ok: true });
    expect(room.state.players[admin.credentials.playerId]?.resources[RESOURCE_IDS.wood]).toBe(99);
    expect(manager.view(room, admin.credentials.playerId).game?.debugMode).toBe(true);

    const cardsBefore = room.state.players[admin.credentials.playerId]?.progressCardIds.length ?? 0;
    expect(manager.grantProgressCards(admin.credentials)).toEqual({ ok: true });
    expect(room.state.players[admin.credentials.playerId]?.progressCardIds.length).toBe(
      cardsBefore + PROGRESS_CARDS.length,
    );
    expect(manager.grantProgressCards(guest.credentials)).toMatchObject({
      ok: false,
      error: { code: 'DEBUG_DISABLED' },
    });
  });
});
