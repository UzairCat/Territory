import { afterEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  credentials: {
    roomCode: 'ROOM24',
    playerId: 'online-player-host',
    resumeToken: 'r'.repeat(32),
  },
  room: {
    protocolVersion: 1 as const,
    code: 'ROOM24',
    phase: 'LOBBY' as const,
    viewerPlayerId: 'online-player-host',
    hostPlayerId: 'online-player-host',
    players: [
      {
        id: 'online-player-host',
        name: 'Alex',
        colorId: 'cobalt',
        connected: true,
        host: true,
      },
    ],
    settings: {
      mapId: 'base-map',
      modeId: 'classic' as const,
      size: 2,
      seed: 'online-session-regression',
      turnTimeSeconds: 60,
      victoryTarget: 10,
      discardThreshold: 7,
      hideBankCards: false,
      friendlyRobber: false,
      balancedDice: false,
      inventorsMadness: false,
    },
    game: null,
  },
}));

const socket = vi.hoisted(() => ({
  connected: true,
  io: { on: vi.fn() },
  on: vi.fn(),
  once: vi.fn(),
  off: vi.fn(),
  connect: vi.fn(),
  emit: vi.fn(
    (
      event: string,
      _payload: unknown,
      acknowledge?: (ack: {
        ok: true;
        credentials: typeof session.credentials;
        room: typeof session.room;
      }) => void,
    ) => {
      if (event === 'room:create') acknowledge?.({ ok: true, ...session });
      else acknowledge?.({ ok: true } as never);
    },
  ),
}));

const disconnectOnlineSocket = vi.hoisted(() => vi.fn());

vi.mock('../../src/app/multiplayer/online-client', () => ({
  getOnlineSocket: () => socket,
  disconnectOnlineSocket,
}));

import { resetOnlineStoreForTests, useOnlineStore } from '../../src/app/stores/online-store';

describe('online room sessions', () => {
  afterEach(() => {
    resetOnlineStoreForTests();
    vi.clearAllMocks();
  });

  it('keeps an accepted lobby room when no game clock exists yet', async () => {
    await expect(useOnlineStore.getState().createRoom('Alex')).resolves.toBe(true);

    expect(useOnlineStore.getState()).toMatchObject({
      credentials: session.credentials,
      room: session.room,
      commandPending: false,
      error: null,
    });
  });

  it('closes the idle transport after leaving a room', async () => {
    await expect(useOnlineStore.getState().createRoom('Alex')).resolves.toBe(true);
    await useOnlineStore.getState().leaveRoom();

    expect(disconnectOnlineSocket).toHaveBeenCalledOnce();
    expect(useOnlineStore.getState()).toMatchObject({
      connection: 'DISCONNECTED',
      credentials: null,
      room: null,
    });
  });
});
