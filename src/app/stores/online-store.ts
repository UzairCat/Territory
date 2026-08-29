import { create } from 'zustand';

import type { DispatchResult } from '../../engine/core/dispatch-result';
import type { GameAction } from '../../engine/core/actions';
import type {
  OnlineAck,
  OnlineConnectionState,
  OnlineError,
  OnlineLobbySettings,
  OnlineRoomView,
  OnlineSessionCredentials,
  SessionAck,
} from '../../multiplayer/protocol';
import { getOnlineSocket } from '../multiplayer/online-client';
import { useAppStore } from './app-store';

const SESSION_STORAGE_KEY = 'territory.online-session.v1';
const ACK_TIMEOUT_MS = 8_000;

interface OnlineStoreState {
  readonly connection: OnlineConnectionState;
  readonly credentials: OnlineSessionCredentials | null;
  readonly room: OnlineRoomView | null;
  readonly clockOffsetMs: number;
  readonly clockOffsetReady: boolean;
  readonly error: OnlineError | null;
  readonly commandPending: boolean;
  readonly actionPending: boolean;
  readonly initialize: () => Promise<boolean>;
  readonly createRoom: (displayName: string) => Promise<boolean>;
  readonly joinRoom: (roomCode: string, displayName: string) => Promise<boolean>;
  readonly updateSettings: (settings: OnlineLobbySettings) => Promise<boolean>;
  readonly startMatch: () => Promise<boolean>;
  readonly rematch: () => Promise<boolean>;
  readonly pauseMatch: () => Promise<boolean>;
  readonly unpauseMatch: () => Promise<boolean>;
  readonly setDebugMode: (enabled: boolean) => Promise<boolean>;
  readonly submitAction: (action: GameAction) => DispatchResult | null;
  readonly leaveRoom: () => Promise<void>;
  readonly clearError: () => void;
}

function storedCredentials(): OnlineSessionCredentials | null {
  if (typeof globalThis.localStorage === 'undefined') return null;
  try {
    const raw = globalThis.localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<OnlineSessionCredentials>;
    return typeof parsed.roomCode === 'string' &&
      typeof parsed.playerId === 'string' &&
      typeof parsed.resumeToken === 'string'
      ? (parsed as OnlineSessionCredentials)
      : null;
  } catch {
    return null;
  }
}

function persistCredentials(credentials: OnlineSessionCredentials | null): void {
  if (typeof globalThis.localStorage === 'undefined') return;
  if (credentials === null) globalThis.localStorage.removeItem(SESSION_STORAGE_KEY);
  else globalThis.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(credentials));
}

function syncRoomToApp(room: OnlineRoomView | null): void {
  const game = room?.game;
  if (game === null || game === undefined) {
    if (room?.phase === 'LOBBY') {
      useAppStore.setState({
        gameState: null,
        recentGameEvents: [],
        gameEventHistory: [],
        gamePaused: false,
        adminMode: false,
      });
    }
    return;
  }
  useAppStore.setState({
    gameState: game.state,
    recentGameEvents: game.recentEvents,
    gameEventHistory: game.eventHistory,
    gamePaused: game.paused,
    adminMode: game.debugMode,
  });
}

function clockOffsetForRoom(room: OnlineRoomView | null): number | null {
  const serverTimeMs = room?.game?.serverTimeMs;
  return serverTimeMs === undefined || !Number.isFinite(serverTimeMs)
    ? null
    : serverTimeMs - Date.now();
}

function nextClockState(
  room: OnlineRoomView | null,
  current: Pick<OnlineStoreState, 'clockOffsetMs' | 'clockOffsetReady'>,
): Pick<OnlineStoreState, 'clockOffsetMs' | 'clockOffsetReady'> {
  const candidate = clockOffsetForRoom(room);
  if (candidate === null) return current;
  return {
    // Snapshot transit time can only make this sample too low. Keeping the highest sample
    // prevents a delayed packet from making the visible clock finish several seconds early.
    clockOffsetMs: current.clockOffsetReady
      ? Math.max(current.clockOffsetMs, candidate)
      : candidate,
    clockOffsetReady: true,
  };
}

function connectionError(message: string): OnlineError {
  return { code: 'CONNECTION_FAILED', message, retryable: true };
}

function emitWithAck<T>(
  emit: (acknowledge: (ack: OnlineAck<T>) => void) => void,
): Promise<OnlineAck<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        error: connectionError('The multiplayer server did not respond in time.'),
      });
    }, ACK_TIMEOUT_MS);
    emit((ack) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      resolve(ack);
    });
  });
}

let listenersInstalled = false;
let connectPromise: Promise<boolean> | null = null;

function ensureConnected(): Promise<boolean> {
  const socket = getOnlineSocket();
  if (socket.connected) return Promise.resolve(true);
  if (connectPromise !== null) return connectPromise;
  useOnlineStore.setState({ connection: 'CONNECTING', error: null });
  connectPromise = new Promise((resolve) => {
    const timeout = globalThis.setTimeout(() => {
      cleanup();
      useOnlineStore.setState({
        connection: 'DISCONNECTED',
        error: connectionError('Could not reach the Territory multiplayer server.'),
      });
      resolve(false);
    }, ACK_TIMEOUT_MS);
    const connected = () => {
      cleanup();
      useOnlineStore.setState({ connection: 'CONNECTED' });
      resolve(true);
    };
    const failed = (reason: Error) => {
      cleanup();
      useOnlineStore.setState({
        connection: 'DISCONNECTED',
        error: connectionError(reason.message || 'Could not connect to the multiplayer server.'),
      });
      resolve(false);
    };
    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      socket.off('connect', connected);
      socket.off('connect_error', failed);
      connectPromise = null;
    };
    socket.once('connect', connected);
    socket.once('connect_error', failed);
    socket.connect();
  });
  return connectPromise;
}

function installListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  const socket = getOnlineSocket();
  socket.on('room:snapshot', (room) => {
    const current = useOnlineStore.getState();
    useOnlineStore.setState({
      room,
      ...nextClockState(room, current),
      error: null,
      actionPending: false,
    });
    syncRoomToApp(room);
  });
  socket.on('room:error', (error) => useOnlineStore.setState({ error }));
  socket.on('connect', () => useOnlineStore.setState({ connection: 'CONNECTED' }));
  socket.on('disconnect', () =>
    useOnlineStore.setState((state) => ({
      connection: state.credentials === null ? 'DISCONNECTED' : 'RECONNECTING',
      actionPending: false,
      clockOffsetReady: false,
    })),
  );
  socket.io.on('reconnect', () => {
    const credentials = useOnlineStore.getState().credentials;
    if (credentials === null) return;
    void emitWithAck<SessionAck>((acknowledge) =>
      socket.emit('session:resume', { credentials }, acknowledge),
    ).then((ack) => {
      if (!ack.ok) {
        useOnlineStore.setState({ error: ack.error, connection: 'DISCONNECTED' });
        return;
      }
      useOnlineStore.setState({
        room: ack.room,
        ...nextClockState(ack.room, useOnlineStore.getState()),
        connection: 'CONNECTED',
        error: null,
      });
      syncRoomToApp(ack.room);
    });
  });
}

function acceptSession(ack: OnlineAck<SessionAck>): boolean {
  if (!ack.ok) {
    useOnlineStore.setState({ error: ack.error, commandPending: false });
    return false;
  }
  persistCredentials(ack.credentials);
  useOnlineStore.setState({
    credentials: ack.credentials,
    room: ack.room,
    ...nextClockState(ack.room, useOnlineStore.getState()),
    error: null,
    commandPending: false,
  });
  syncRoomToApp(ack.room);
  return true;
}

export const useOnlineStore = create<OnlineStoreState>((set, get) => ({
  connection: 'DISCONNECTED',
  credentials: storedCredentials(),
  room: null,
  clockOffsetMs: 0,
  clockOffsetReady: false,
  error: null,
  commandPending: false,
  actionPending: false,
  initialize: async () => {
    installListeners();
    const credentials = get().credentials ?? storedCredentials();
    if (credentials === null) return false;
    set({ credentials, commandPending: true });
    if (!(await ensureConnected())) {
      set({ commandPending: false });
      return false;
    }
    const ack = await emitWithAck<SessionAck>((acknowledge) =>
      getOnlineSocket().emit('session:resume', { credentials }, acknowledge),
    );
    if (!ack.ok && ack.error.code === 'SESSION_EXPIRED') {
      persistCredentials(null);
      set({ credentials: null });
    }
    return acceptSession(ack);
  },
  createRoom: async (displayName) => {
    installListeners();
    persistCredentials(null);
    set({
      credentials: null,
      room: null,
      clockOffsetMs: 0,
      clockOffsetReady: false,
      commandPending: true,
      error: null,
    });
    if (!(await ensureConnected())) {
      set({ commandPending: false });
      return false;
    }
    return acceptSession(
      await emitWithAck<SessionAck>((acknowledge) =>
        getOnlineSocket().emit('room:create', { displayName }, acknowledge),
      ),
    );
  },
  joinRoom: async (roomCode, displayName) => {
    installListeners();
    persistCredentials(null);
    set({
      credentials: null,
      room: null,
      clockOffsetMs: 0,
      clockOffsetReady: false,
      commandPending: true,
      error: null,
    });
    if (!(await ensureConnected())) {
      set({ commandPending: false });
      return false;
    }
    return acceptSession(
      await emitWithAck<SessionAck>((acknowledge) =>
        getOnlineSocket().emit('room:join', { roomCode, displayName }, acknowledge),
      ),
    );
  },
  updateSettings: async (settings) => {
    const credentials = get().credentials;
    if (credentials === null) return false;
    set({ commandPending: true, error: null });
    const ack = await emitWithAck((acknowledge) =>
      getOnlineSocket().emit('room:update-settings', { credentials, settings }, acknowledge),
    );
    set({ commandPending: false, ...(!ack.ok ? { error: ack.error } : {}) });
    return ack.ok;
  },
  startMatch: async () => {
    const credentials = get().credentials;
    if (credentials === null) return false;
    set({ commandPending: true, error: null });
    const ack = await emitWithAck((acknowledge) =>
      getOnlineSocket().emit('room:start', { credentials }, acknowledge),
    );
    set({ commandPending: false, ...(!ack.ok ? { error: ack.error } : {}) });
    return ack.ok;
  },
  rematch: async () => {
    const credentials = get().credentials;
    if (credentials === null) return false;
    set({ commandPending: true, error: null });
    const ack = await emitWithAck((acknowledge) =>
      getOnlineSocket().emit('room:rematch', { credentials }, acknowledge),
    );
    set({ commandPending: false, ...(!ack.ok ? { error: ack.error } : {}) });
    return ack.ok;
  },
  pauseMatch: async () => {
    const credentials = get().credentials;
    if (credentials === null) return false;
    const ack = await emitWithAck((acknowledge) =>
      getOnlineSocket().emit('room:pause', { credentials }, acknowledge),
    );
    if (!ack.ok) set({ error: ack.error });
    return ack.ok;
  },
  unpauseMatch: async () => {
    const credentials = get().credentials;
    if (credentials === null) return false;
    const ack = await emitWithAck((acknowledge) =>
      getOnlineSocket().emit('room:unpause', { credentials }, acknowledge),
    );
    if (!ack.ok) set({ error: ack.error });
    return ack.ok;
  },
  setDebugMode: async (enabled) => {
    const credentials = get().credentials;
    if (credentials === null) return false;
    set({ commandPending: true, error: null });
    const ack = await emitWithAck((acknowledge) =>
      getOnlineSocket().emit('game:set-debug-mode', { credentials, enabled }, acknowledge),
    );
    set({ commandPending: false, ...(!ack.ok ? { error: ack.error } : {}) });
    return ack.ok;
  },
  submitAction: (action) => {
    const { actionPending, connection, credentials, room } = get();
    const game = room?.game;
    if (
      actionPending ||
      connection !== 'CONNECTED' ||
      credentials === null ||
      game === null ||
      game === undefined
    ) {
      set({ error: connectionError('Wait for the multiplayer connection before acting.') });
      return null;
    }
    set({ actionPending: true, error: null });
    void emitWithAck<{ readonly revision: number }>((acknowledge) =>
      getOnlineSocket().emit(
        'game:action',
        { credentials, expectedRevision: game.revision, action },
        acknowledge,
      ),
    ).then((ack) => {
      set({ actionPending: false, ...(!ack.ok ? { error: ack.error } : {}) });
    });
    return { ok: true, state: game.state, events: [] };
  },
  leaveRoom: async () => {
    const credentials = get().credentials;
    if (credentials !== null && getOnlineSocket().connected) {
      await emitWithAck((acknowledge) =>
        getOnlineSocket().emit('room:leave', { credentials }, acknowledge),
      );
    }
    persistCredentials(null);
    set({
      credentials: null,
      room: null,
      clockOffsetMs: 0,
      clockOffsetReady: false,
      error: null,
      commandPending: false,
      actionPending: false,
    });
    useAppStore.getState().clearGame();
  },
  clearError: () => set({ error: null }),
}));

export function resetOnlineStoreForTests(): void {
  persistCredentials(null);
  useOnlineStore.setState({
    connection: 'DISCONNECTED',
    credentials: null,
    room: null,
    clockOffsetMs: 0,
    clockOffsetReady: false,
    error: null,
    commandPending: false,
    actionPending: false,
  });
}
