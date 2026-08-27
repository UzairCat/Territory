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
import {
  buildGameConfig,
  createDefaultLobby,
  type LobbyConfig,
  type LocalLobbyPlayer,
} from '../lobby/lobby-model';

export type AnimationSpeed = 'NORMAL' | 'FAST';

export interface AppSettings {
  readonly masterVolume: number;
  readonly sfxVolume: number;
  readonly reducedMotion: boolean;
  readonly animationSpeed: AnimationSpeed;
  readonly turnPrivacy: boolean;
}

export type BeginGameResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly issues: readonly { readonly code: string; readonly message: string }[];
    };

interface AppStoreState {
  readonly lobby: LobbyConfig;
  readonly gameState: GameState | null;
  readonly recentGameEvents: readonly GameEvent[];
  readonly settings: AppSettings;
  readonly settingsOpen: boolean;
  readonly startFreshLobby: () => void;
  readonly setLobbyMap: (mapId: MapId) => void;
  readonly setLobbyMode: (modeId: ModeId) => void;
  readonly setLobbySeed: (seed: string) => void;
  readonly randomizeLobbySeed: () => void;
  readonly confirmLobbyResize: (size: PlayerCount) => void;
  readonly addLobbyPlayer: (name: string, colorId: ColorId) => void;
  readonly editLobbyPlayer: (id: PlayerId, name: string, colorId: ColorId) => void;
  readonly removeLobbyPlayer: (id: PlayerId) => void;
  readonly beginGame: () => BeginGameResult;
  readonly dispatchGameAction: (action: GameAction) => DispatchResult | null;
  readonly clearGame: () => void;
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

const DEFAULT_SETTINGS: AppSettings = {
  masterVolume: 80,
  sfxVolume: 80,
  reducedMotion: false,
  animationSpeed: 'NORMAL',
  turnPrivacy: true,
};

function initialState() {
  return {
    lobby: createDefaultLobby(createLobbySeed()),
    gameState: null,
    recentGameEvents: [],
    settings: DEFAULT_SETTINGS,
    settingsOpen: false,
  };
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  ...initialState(),
  startFreshLobby: () =>
    set({ lobby: createDefaultLobby(createLobbySeed()), gameState: null, recentGameEvents: [] }),
  setLobbyMap: (mapId) => set((state) => ({ lobby: { ...state.lobby, mapId } })),
  setLobbyMode: (modeId) => set((state) => ({ lobby: { ...state.lobby, modeId } })),
  setLobbySeed: (seed) => set((state) => ({ lobby: { ...state.lobby, seed } })),
  randomizeLobbySeed: () =>
    set((state) => ({ lobby: { ...state.lobby, seed: createLobbySeed() } })),
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

    set({ gameState: gameResult.state, recentGameEvents: [] });
    return { ok: true };
  },
  dispatchGameAction: (action) => {
    const gameState = get().gameState;
    if (gameState === null) return null;

    const result = dispatchEngineAction(gameState, action);
    if (result.ok) set({ gameState: result.state, recentGameEvents: result.events });
    return result;
  },
  clearGame: () => set({ gameState: null, recentGameEvents: [] }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  updateSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),
}));

export function resetAppStoreForTests(): void {
  useAppStore.setState(initialState());
}
