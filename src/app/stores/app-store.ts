import { create } from 'zustand';

import { createGame } from '../../engine/core/create-game';
import type { GameAction } from '../../engine/core/actions';
import { dispatch as dispatchEngineAction } from '../../engine/core/game-engine';
import type { DispatchResult } from '../../engine/core/game-engine';
import type { GameState } from '../../engine/core/game-state';
import type { GameEvent } from '../../engine/core/events';
import { gameId, playerId } from '../../engine/core/ids';
import type { ColorId, MapId, ModeId, PlayerId } from '../../engine/core/ids';
import type { PlayerCount } from '../../engine/content/types';
import { randomAvailablePlayerAvatarId, type PlayerAvatarId } from '../../engine/content/avatars';
import {
  grantDeveloperLoadout,
  grantDeveloperProgressCards,
} from '../../engine/debug/developer-tools';
import {
  AVAILABLE_MODES,
  buildGameConfig,
  createDefaultLobby,
  type LobbyConfig,
  type LobbyRuleKey,
  type LocalLobbyPlayer,
} from '../lobby/lobby-model';
import { hasAdminDisplayName } from '../../multiplayer/admin-access';
import {
  BOARD_FRAME_RATE_LIMITS,
  BOARD_GRAPHICS_QUALITIES,
  type BoardFrameRateLimit,
  type BoardGraphicsQuality,
} from '../../board-renderer/performance';

export type AnimationSpeed = 'NORMAL' | 'FAST';

export interface AppSettings {
  readonly masterVolume: number;
  readonly sfxVolume: number;
  readonly musicVolume: number;
  readonly timerSounds: boolean;
  readonly reducedMotion: boolean;
  readonly animationSpeed: AnimationSpeed;
  readonly graphicsQuality: BoardGraphicsQuality;
  readonly frameRateLimit: BoardFrameRateLimit;
}

export type BeginGameResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly issues: readonly { readonly code: string; readonly message: string }[];
    };

interface AppStoreState {
  readonly lobby: LobbyConfig;
  readonly previousLobbySeed: string | null;
  readonly gameState: GameState | null;
  readonly recentGameEvents: readonly GameEvent[];
  readonly gameEventHistory: readonly GameEvent[];
  readonly gamePaused: boolean;
  readonly adminMode: boolean;
  readonly settings: AppSettings;
  readonly settingsOpen: boolean;
  readonly startFreshLobby: () => void;
  readonly setLobbyMap: (mapId: MapId) => void;
  readonly setLobbyMode: (modeId: ModeId) => void;
  readonly setLobbySeed: (seed: string) => void;
  readonly setLobbyTurnTime: (seconds: number) => void;
  readonly setLobbyVictoryTarget: (points: number) => void;
  readonly setLobbyDiscardThreshold: (cards: number) => void;
  readonly setLobbyRule: (rule: LobbyRuleKey, enabled: boolean) => void;
  readonly randomizeLobbySeed: () => void;
  readonly usePreviousLobbySeed: () => void;
  readonly confirmLobbyResize: (size: PlayerCount) => void;
  readonly addLobbyPlayer: (name: string, colorId: ColorId) => void;
  readonly editLobbyPlayer: (id: PlayerId, name: string, colorId: ColorId) => void;
  readonly setLobbyPlayerProfile: (
    id: PlayerId,
    avatarId: PlayerAvatarId,
    colorId: ColorId,
  ) => void;
  readonly removeLobbyPlayer: (id: PlayerId) => void;
  readonly beginGame: () => BeginGameResult;
  readonly rematch: () => BeginGameResult;
  readonly dispatchGameAction: (action: GameAction) => DispatchResult | null;
  readonly pauseGame: () => void;
  readonly unpauseGame: () => void;
  readonly toggleAdminMode: () => void;
  readonly grantAllProgressCards: () => void;
  readonly clearGame: () => void;
  readonly returnGameToLobby: () => void;
  readonly openSettings: () => void;
  readonly closeSettings: () => void;
  readonly updateSettings: (settings: Partial<AppSettings>) => void;
}

function createRandomToken(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function createLobbySeed(): string {
  return createRandomToken('territory');
}

function randomUnitInterval(): number {
  const randomValue = new Uint32Array(1);
  globalThis.crypto.getRandomValues(randomValue);
  return (randomValue[0] ?? 0) / 4_294_967_296;
}

export const APP_SETTINGS_STORAGE_KEY = 'territory.settings.v1';

export const DEFAULT_SETTINGS: AppSettings = {
  masterVolume: 80,
  sfxVolume: 80,
  musicVolume: 34,
  timerSounds: true,
  reducedMotion: false,
  animationSpeed: 'NORMAL',
  graphicsQuality: 'HIGH',
  frameRateLimit: 60,
};

function settingsStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function validVolume(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function readStoredAppSettings(): AppSettings {
  const storage = settingsStorage();
  if (storage === null) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(
      storage.getItem(APP_SETTINGS_STORAGE_KEY) ?? 'null',
    ) as Partial<AppSettings> | null;
    if (parsed === null || typeof parsed !== 'object') return DEFAULT_SETTINGS;
    return {
      masterVolume: validVolume(parsed.masterVolume)
        ? parsed.masterVolume
        : DEFAULT_SETTINGS.masterVolume,
      sfxVolume: validVolume(parsed.sfxVolume) ? parsed.sfxVolume : DEFAULT_SETTINGS.sfxVolume,
      musicVolume: validVolume(parsed.musicVolume)
        ? parsed.musicVolume
        : DEFAULT_SETTINGS.musicVolume,
      timerSounds:
        typeof parsed.timerSounds === 'boolean' ? parsed.timerSounds : DEFAULT_SETTINGS.timerSounds,
      reducedMotion:
        typeof parsed.reducedMotion === 'boolean'
          ? parsed.reducedMotion
          : DEFAULT_SETTINGS.reducedMotion,
      animationSpeed:
        parsed.animationSpeed === 'NORMAL' || parsed.animationSpeed === 'FAST'
          ? parsed.animationSpeed
          : DEFAULT_SETTINGS.animationSpeed,
      graphicsQuality: BOARD_GRAPHICS_QUALITIES.includes(
        parsed.graphicsQuality as BoardGraphicsQuality,
      )
        ? (parsed.graphicsQuality as BoardGraphicsQuality)
        : DEFAULT_SETTINGS.graphicsQuality,
      frameRateLimit: BOARD_FRAME_RATE_LIMITS.includes(parsed.frameRateLimit as BoardFrameRateLimit)
        ? (parsed.frameRateLimit as BoardFrameRateLimit)
        : DEFAULT_SETTINGS.frameRateLimit,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistAppSettings(settings: AppSettings): void {
  try {
    settingsStorage()?.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings still apply to this session when browser storage is blocked or full.
  }
}

function initialState() {
  return {
    lobby: createDefaultLobby(createLobbySeed()),
    previousLobbySeed: null,
    gameState: null,
    recentGameEvents: [],
    gameEventHistory: [],
    gamePaused: false,
    adminMode: false,
    settings: readStoredAppSettings(),
    settingsOpen: false,
  };
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  ...initialState(),
  startFreshLobby: () =>
    set({
      lobby: createDefaultLobby(createLobbySeed()),
      previousLobbySeed: null,
      gameState: null,
      recentGameEvents: [],
      gameEventHistory: [],
      gamePaused: false,
      adminMode: false,
    }),
  setLobbyMap: (mapId) => set((state) => ({ lobby: { ...state.lobby, mapId } })),
  setLobbyMode: (modeId) =>
    set((state) =>
      state.lobby.modeId === modeId
        ? state
        : {
            lobby: {
              ...state.lobby,
              modeId,
              victoryTarget:
                AVAILABLE_MODES.find((mode) => mode.id === modeId)?.rules.victoryTarget ??
                state.lobby.victoryTarget,
            },
          },
    ),
  setLobbySeed: (seed) => set((state) => ({ lobby: { ...state.lobby, seed } })),
  setLobbyTurnTime: (turnTimeSeconds) =>
    set((state) => ({ lobby: { ...state.lobby, turnTimeSeconds } })),
  setLobbyVictoryTarget: (victoryTarget) =>
    set((state) => ({ lobby: { ...state.lobby, victoryTarget } })),
  setLobbyDiscardThreshold: (discardThreshold) =>
    set((state) => ({ lobby: { ...state.lobby, discardThreshold } })),
  setLobbyRule: (rule, enabled) => set((state) => ({ lobby: { ...state.lobby, [rule]: enabled } })),
  randomizeLobbySeed: () =>
    set((state) => ({ lobby: { ...state.lobby, seed: createLobbySeed() } })),
  usePreviousLobbySeed: () =>
    set((state) =>
      state.previousLobbySeed === null
        ? state
        : { lobby: { ...state.lobby, seed: state.previousLobbySeed } },
    ),
  confirmLobbyResize: (size) =>
    set((state) => ({
      lobby: { ...state.lobby, size, players: state.lobby.players.slice(0, size) },
    })),
  addLobbyPlayer: (name, colorId) =>
    set((state) => {
      if (state.lobby.players.length >= state.lobby.size) {
        return state;
      }

      const player: LocalLobbyPlayer = {
        id: playerId(createRandomToken('player')),
        name: name.trim(),
        colorId,
        avatarId: randomAvailablePlayerAvatarId(
          state.lobby.players.map((candidate) => candidate.avatarId),
          randomUnitInterval(),
        ),
      };
      return { lobby: { ...state.lobby, players: [...state.lobby.players, player] } };
    }),
  editLobbyPlayer: (id, name, colorId) =>
    set((state) => ({
      lobby: {
        ...state.lobby,
        players: state.lobby.players.map((player) =>
          player.id === id ? { ...player, name: name.trim(), colorId } : player,
        ),
      },
    })),
  setLobbyPlayerProfile: (id, avatarId, colorId) =>
    set((state) => ({
      lobby: {
        ...state.lobby,
        players: state.lobby.players.map((player) =>
          player.id === id ? { ...player, avatarId, colorId } : player,
        ),
      },
    })),
  removeLobbyPlayer: (id) =>
    set((state) => ({
      lobby: { ...state.lobby, players: state.lobby.players.filter((player) => player.id !== id) },
    })),
  beginGame: () => {
    const configResult = buildGameConfig(get().lobby, gameId(createRandomToken('game')));
    if (!configResult.ok) {
      return configResult;
    }

    const gameResult = createGame(configResult.config);
    if (!gameResult.ok) {
      return gameResult;
    }

    set({
      gameState: gameResult.state,
      recentGameEvents: [],
      gameEventHistory: [],
      gamePaused: false,
      adminMode: false,
    });
    return { ok: true };
  },
  rematch: () => {
    const lobby = { ...get().lobby, seed: createLobbySeed() };
    const configResult = buildGameConfig(lobby, gameId(createRandomToken('game')));
    if (!configResult.ok) return configResult;

    const gameResult = createGame(configResult.config);
    if (!gameResult.ok) return gameResult;

    set({
      lobby,
      gameState: gameResult.state,
      recentGameEvents: [],
      gameEventHistory: [],
      gamePaused: false,
      adminMode: false,
    });
    return { ok: true };
  },
  dispatchGameAction: (action) => {
    const { adminMode, gamePaused, gameState } = get();
    if (gameState === null || gamePaused) return null;

    const result = dispatchEngineAction(gameState, action, {
      skipSevenDiscards: adminMode,
      ignoreRobber: adminMode,
      ...(adminMode
        ? { discardExemptPlayerIds: Object.keys(gameState.players) as PlayerId[] }
        : {}),
    });
    if (result.ok) {
      set((state) => ({
        gameState: result.state,
        recentGameEvents: result.events,
        gameEventHistory: [...state.gameEventHistory, ...result.events].slice(-100),
      }));
    }
    return result;
  },
  pauseGame: () => {
    if (get().gameState === null) return;
    set({ gamePaused: true });
  },
  unpauseGame: () => set({ gamePaused: false }),
  toggleAdminMode: () => {
    const state = get();
    if (state.adminMode) {
      set({ adminMode: false });
      return;
    }

    const activePlayerId = state.gameState?.turn.activePlayerId;
    const activePlayer =
      activePlayerId === null || activePlayerId === undefined
        ? undefined
        : state.gameState?.players[activePlayerId];
    if (
      state.gameState === null ||
      activePlayerId === null ||
      activePlayerId === undefined ||
      activePlayer === undefined
    )
      return;
    if (!import.meta.env.DEV && !hasAdminDisplayName(activePlayer.name)) return;

    set({
      adminMode: true,
      gameState: grantDeveloperLoadout(
        state.gameState,
        activePlayerId,
        globalThis.crypto.randomUUID(),
      ),
      recentGameEvents: [],
    });
  },
  grantAllProgressCards: () => {
    const state = get();
    const gameState = state.gameState;
    const activePlayerId = gameState?.turn.activePlayerId;
    const activePlayer =
      activePlayerId === null || activePlayerId === undefined || gameState === null
        ? undefined
        : gameState.players[activePlayerId];
    if (
      gameState === null ||
      activePlayerId === null ||
      activePlayerId === undefined ||
      activePlayer === undefined
    ) {
      return;
    }
    if (!import.meta.env.DEV && !hasAdminDisplayName(activePlayer.name)) return;

    set({
      gameState: grantDeveloperProgressCards(
        gameState,
        activePlayerId,
        globalThis.crypto.randomUUID(),
      ),
      recentGameEvents: [],
    });
  },
  clearGame: () =>
    set({
      gameState: null,
      recentGameEvents: [],
      gameEventHistory: [],
      gamePaused: false,
      adminMode: false,
    }),
  returnGameToLobby: () =>
    set((state) => ({
      lobby: { ...state.lobby, seed: createLobbySeed() },
      previousLobbySeed: state.gameState?.config.seed ?? state.lobby.seed,
      gameState: null,
      recentGameEvents: [],
      gameEventHistory: [],
      gamePaused: false,
      adminMode: false,
    })),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  updateSettings: (settings) =>
    set((state) => {
      const nextSettings = { ...state.settings, ...settings };
      persistAppSettings(nextSettings);
      return { settings: nextSettings };
    }),
}));

export function resetAppStoreForTests(): void {
  try {
    settingsStorage()?.removeItem(APP_SETTINGS_STORAGE_KEY);
  } catch {
    // Tests still receive the in-memory defaults when storage is unavailable.
  }
  useAppStore.setState(initialState());
}
