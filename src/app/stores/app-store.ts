import { create } from 'zustand';

import { RESOURCES } from '../../engine/content/resources';
import { COMMODITIES } from '../../engine/content/commodities';
import { PROGRESS_CARDS } from '../../engine/content/progress-cards';
import { KN_PROGRESS_CARDS } from '../../engine/content/kn-progress-cards';
import { resourceBundle } from '../../engine/content/types';
import { createGame } from '../../engine/core/create-game';
import type { GameAction } from '../../engine/core/actions';
import { dispatch as dispatchEngineAction } from '../../engine/core/game-engine';
import type { DispatchResult } from '../../engine/core/game-engine';
import type { GameState } from '../../engine/core/game-state';
import type { GameEvent } from '../../engine/core/events';
import { cardInstanceId, gameId, playerId } from '../../engine/core/ids';
import type { ColorId, MapId, ModeId, PlayerId } from '../../engine/core/ids';
import type { PlayerCount } from '../../engine/content/types';
import {
  AVAILABLE_MODES,
  buildGameConfig,
  createDefaultLobby,
  type LobbyConfig,
  type LobbyRuleKey,
  type LocalLobbyPlayer,
} from '../lobby/lobby-model';

export type AnimationSpeed = 'NORMAL' | 'FAST';

export interface AppSettings {
  readonly masterVolume: number;
  readonly sfxVolume: number;
  readonly timerSounds: boolean;
  readonly reducedMotion: boolean;
  readonly animationSpeed: AnimationSpeed;
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
  readonly confirmLobbyResize: (size: PlayerCount) => void;
  readonly addLobbyPlayer: (name: string, colorId: ColorId) => void;
  readonly editLobbyPlayer: (id: PlayerId, name: string, colorId: ColorId) => void;
  readonly removeLobbyPlayer: (id: PlayerId) => void;
  readonly beginGame: () => BeginGameResult;
  readonly rematch: () => BeginGameResult;
  readonly dispatchGameAction: (action: GameAction) => DispatchResult | null;
  readonly pauseGame: () => void;
  readonly unpauseGame: () => void;
  readonly toggleAdminMode: () => void;
  readonly grantAllProgressCards: () => void;
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
  timerSounds: true,
  reducedMotion: false,
  animationSpeed: 'NORMAL',
};

function initialState() {
  return {
    lobby: createDefaultLobby(createLobbySeed()),
    gameState: null,
    recentGameEvents: [],
    gameEventHistory: [],
    gamePaused: false,
    adminMode: false,
    settings: DEFAULT_SETTINGS,
    settingsOpen: false,
  };
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  ...initialState(),
  startFreshLobby: () =>
    set({
      lobby: createDefaultLobby(createLobbySeed()),
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
      skipSevenDiscards: import.meta.env.DEV && adminMode,
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
    if (!import.meta.env.DEV) return;

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

    set({
      adminMode: true,
      gameState: {
        ...state.gameState,
        players: {
          ...state.gameState.players,
          [activePlayerId]: {
            ...activePlayer,
            resources: resourceBundle(RESOURCES.map((resource) => [resource.id, 99])),
            commodities: resourceBundle(COMMODITIES.map((commodity) => [commodity.id, 99])),
          },
        },
      },
    });
  },
  grantAllProgressCards: () => {
    if (!import.meta.env.DEV) return;
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

    const grantToken = globalThis.crypto.randomUUID();
    if (gameState.kn !== null) {
      const grantedCards = KN_PROGRESS_CARDS.map((definition) => {
        const instanceId = cardInstanceId(`dev-${grantToken}-${definition.id}`);
        return {
          instanceId,
          definition,
          card: {
            instanceId,
            definitionId: definition.id,
            ownerId: activePlayerId,
            drawnTurn: gameState.turn.turnNumber,
            playedTurn: null,
            revealed: definition.revealedVictoryPoints > 0,
          },
        };
      });
      set({
        gameState: {
          ...gameState,
          players: {
            ...gameState.players,
            [activePlayerId]: {
              ...activePlayer,
              knProgressCardIds: [
                ...activePlayer.knProgressCardIds,
                ...grantedCards
                  .filter(({ definition }) => definition.revealedVictoryPoints === 0)
                  .map(({ instanceId }) => instanceId),
              ],
              revealedKNProgressCardIds: [
                ...activePlayer.revealedKNProgressCardIds,
                ...grantedCards
                  .filter(({ definition }) => definition.revealedVictoryPoints > 0)
                  .map(({ instanceId }) => instanceId),
              ],
            },
          },
          kn: {
            ...gameState.kn,
            progressCards: {
              ...gameState.kn.progressCards,
              ...Object.fromEntries(
                grantedCards.map(({ instanceId, card }) => [instanceId, card] as const),
              ),
            },
          },
        },
        recentGameEvents: [],
      });
      return;
    }

    const grantedCards = PROGRESS_CARDS.map((definition) => {
      const instanceId = cardInstanceId(`dev-${grantToken}-${definition.id}`);
      return {
        instanceId,
        card: {
          instanceId,
          definitionId: definition.id,
          ownerId: activePlayerId,
          purchasedTurn: null,
          playedTurn: null,
        },
      };
    });
    set({
      gameState: {
        ...gameState,
        players: {
          ...gameState.players,
          [activePlayerId]: {
            ...activePlayer,
            progressCardIds: [
              ...activePlayer.progressCardIds,
              ...grantedCards.map(({ instanceId }) => instanceId),
            ],
          },
        },
        progressCards: {
          ...gameState.progressCards,
          ...Object.fromEntries(
            grantedCards.map(({ instanceId, card }) => [instanceId, card] as const),
          ),
        },
      },
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
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  updateSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),
}));

export function resetAppStoreForTests(): void {
  useAppStore.setState(initialState());
}
