// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import {
  APP_SETTINGS_STORAGE_KEY,
  DEFAULT_SETTINGS,
  readStoredAppSettings,
  resetAppStoreForTests,
  useAppStore,
} from '../../src/app/stores/app-store';
import { PLAYER_COLORS } from '../../src/engine/content/colors';
import { PLAYER_AVATARS } from '../../src/engine/content/avatars';
import { KN_PROGRESS_CARDS } from '../../src/engine/content/kn-progress-cards';
import { actionId } from '../../src/engine/core/ids';
import { KN_MODE } from '../../src/engine/modes/kn';
import { getLegalSetupHouseVertexIds } from '../../src/engine/rules/setup-rules';

describe('application session store', () => {
  beforeEach(() => resetAppStoreForTests());

  it('only truncates players through confirmed resizing', () => {
    const actions = useAppStore.getState();
    actions.confirmLobbyResize(4);
    actions.addLobbyPlayer('Alex', PLAYER_COLORS[0]!.id);
    actions.addLobbyPlayer('Sam', PLAYER_COLORS[1]!.id);
    actions.addLobbyPlayer('Jo', PLAYER_COLORS[2]!.id);
    actions.addLobbyPlayer('Rae', PLAYER_COLORS[3]!.id);

    actions.confirmLobbyResize(2);
    expect(useAppStore.getState().lobby.players.map((player) => player.name)).toEqual([
      'Alex',
      'Sam',
    ]);
  });

  it('persists performance settings and safely rejects invalid stored values', () => {
    useAppStore.getState().updateSettings({
      graphicsQuality: 'PERFORMANCE',
      frameRateLimit: 30,
      reducedMotion: true,
    });

    expect(JSON.parse(localStorage.getItem(APP_SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
      graphicsQuality: 'PERFORMANCE',
      frameRateLimit: 30,
      reducedMotion: true,
    });
    expect(readStoredAppSettings()).toMatchObject({
      graphicsQuality: 'PERFORMANCE',
      frameRateLimit: 30,
      reducedMotion: true,
    });

    localStorage.setItem(
      APP_SETTINGS_STORAGE_KEY,
      JSON.stringify({ graphicsQuality: 'ULTRA', frameRateLimit: 500, masterVolume: -4 }),
    );
    expect(readStoredAppSettings()).toMatchObject({
      graphicsQuality: DEFAULT_SETTINGS.graphicsQuality,
      frameRateLimit: DEFAULT_SETTINGS.frameRateLimit,
      masterVolume: DEFAULT_SETTINGS.masterVolume,
    });
  });

  it('randomly assigns unused preset portraits to new local players', () => {
    const actions = useAppStore.getState();
    actions.confirmLobbyResize(4);
    actions.addLobbyPlayer('Alex', PLAYER_COLORS[0]!.id);
    actions.addLobbyPlayer('Sam', PLAYER_COLORS[1]!.id);
    actions.addLobbyPlayer('Jo', PLAYER_COLORS[2]!.id);
    actions.addLobbyPlayer('Rae', PLAYER_COLORS[3]!.id);

    const avatarIds = useAppStore.getState().lobby.players.map((player) => player.avatarId);
    expect(avatarIds.every((avatarId) => avatarId !== undefined)).toBe(true);
    expect(new Set(avatarIds)).toHaveProperty('size', 4);
  });

  it('creates a game only after the lobby becomes valid', () => {
    const actions = useAppStore.getState();
    expect(actions.beginGame().ok).toBe(false);
    expect(useAppStore.getState().gameState).toBeNull();

    actions.addLobbyPlayer('Alex', PLAYER_COLORS[0]!.id);
    actions.addLobbyPlayer('Sam', PLAYER_COLORS[1]!.id);
    expect(actions.beginGame().ok).toBe(true);
    const initializedNames =
      useAppStore.getState().gameState?.config.players.map((player) => player.name) ?? [];
    expect([...initializedNames].sort()).toEqual(['Alex', 'Sam']);
  });

  it('carries a local guest profile from the lobby into the match', () => {
    const actions = useAppStore.getState();
    actions.addLobbyPlayer('Alex', PLAYER_COLORS[0]!.id);
    actions.addLobbyPlayer('Sam', PLAYER_COLORS[1]!.id);
    const alex = useAppStore.getState().lobby.players[0]!;
    actions.setLobbyPlayerProfile(alex.id, PLAYER_AVATARS[7].id, PLAYER_COLORS[4]!.id);

    expect(actions.beginGame().ok).toBe(true);
    expect(useAppStore.getState().gameState?.players[alex.id]).toMatchObject({
      avatarId: PLAYER_AVATARS[7].id,
      colorId: PLAYER_COLORS[4]!.id,
    });
  });

  it('applies mode defaults and carries custom lobby rules into the match', () => {
    const actions = useAppStore.getState();
    actions.setLobbyMode(KN_MODE.id);
    expect(useAppStore.getState().lobby.victoryTarget).toBe(13);
    actions.setLobbyVictoryTarget(17);
    actions.setLobbyDiscardThreshold(11);
    actions.setLobbyRule('hideBankCards', true);
    actions.setLobbyRule('friendlyRobber', true);
    actions.setLobbyRule('balancedDice', true);
    actions.setLobbyRule('inventorsMadness', true);
    actions.addLobbyPlayer('Alex', PLAYER_COLORS[0]!.id);
    actions.addLobbyPlayer('Sam', PLAYER_COLORS[1]!.id);

    expect(actions.beginGame().ok).toBe(true);
    expect(useAppStore.getState().gameState?.config).toMatchObject({
      victoryTarget: 17,
      hideBankCards: true,
      friendlyRobber: true,
      balancedDice: true,
      inventorsMadness: true,
      rules: { discardThreshold: 11 },
    });
    expect(useAppStore.getState().gameState?.balancedDice?.remainingPairIds).toHaveLength(36);
    expect(useAppStore.getState().gameState?.inventorsMadness).toEqual({ pendingHexIds: null });
  });

  it('submits setup actions through the engine and stores only accepted state', () => {
    const actions = useAppStore.getState();
    actions.addLobbyPlayer('Alex', PLAYER_COLORS[0]!.id);
    actions.addLobbyPlayer('Sam', PLAYER_COLORS[1]!.id);
    expect(actions.beginGame().ok).toBe(true);
    const gameState = useAppStore.getState().gameState;
    const target = gameState === null ? undefined : getLegalSetupHouseVertexIds(gameState)[0];
    if (gameState === null || gameState.turn.activePlayerId === null || target === undefined) {
      throw new Error('Game did not enter setup with a legal target.');
    }

    const result = actions.dispatchGameAction({
      id: actionId('store-setup-house'),
      type: 'PLACE_SETUP_HOUSE',
      actorId: gameState.turn.activePlayerId,
      vertexId: target,
    });

    expect(result?.ok).toBe(true);
    expect(useAppStore.getState().gameState?.turn.phase).toBe('SETUP_PLACE_ROAD');
    expect(useAppStore.getState().recentGameEvents.map((event) => event.type)).toEqual([
      'BUILDING_PLACED',
    ]);
  });

  it('blocks game actions while paused and starts new matches unpaused', () => {
    const actions = useAppStore.getState();
    actions.addLobbyPlayer('Alex', PLAYER_COLORS[0]!.id);
    actions.addLobbyPlayer('Sam', PLAYER_COLORS[1]!.id);
    expect(actions.beginGame().ok).toBe(true);
    const gameState = useAppStore.getState().gameState;
    const target = gameState === null ? undefined : getLegalSetupHouseVertexIds(gameState)[0];
    if (gameState?.turn.activePlayerId === null || gameState === null || target === undefined) {
      throw new Error('Paused-game fixture has no legal setup action.');
    }

    actions.pauseGame();
    expect(useAppStore.getState().gamePaused).toBe(true);
    expect(
      actions.dispatchGameAction({
        id: actionId('paused-setup-house'),
        type: 'PLACE_SETUP_HOUSE',
        actorId: gameState.turn.activePlayerId,
        vertexId: target,
      }),
    ).toBeNull();
    expect(useAppStore.getState().gameState?.turn.phase).toBe('SETUP_PLACE_HOUSE');

    actions.unpauseGame();
    expect(useAppStore.getState().gamePaused).toBe(false);
    actions.pauseGame();
    expect(actions.rematch().ok).toBe(true);
    expect(useAppStore.getState().gamePaused).toBe(false);
  });

  it('opens a fresh lobby with a new seed and no retained match', () => {
    const actions = useAppStore.getState();
    const originalSeed = useAppStore.getState().lobby.seed;
    actions.addLobbyPlayer('Alex', PLAYER_COLORS[0]!.id);
    actions.addLobbyPlayer('Sam', PLAYER_COLORS[1]!.id);
    actions.beginGame();

    actions.startFreshLobby();
    expect(useAppStore.getState().lobby.players).toEqual([]);
    expect(useAppStore.getState().lobby.seed).not.toBe(originalSeed);
    expect(useAppStore.getState().gameState).toBeNull();
  });

  it('starts a rematch with the same lobby and a fresh deterministic seed', () => {
    const actions = useAppStore.getState();
    actions.addLobbyPlayer('Alex', PLAYER_COLORS[0]!.id);
    actions.addLobbyPlayer('Sam', PLAYER_COLORS[1]!.id);
    expect(actions.beginGame().ok).toBe(true);
    const firstMatch = useAppStore.getState().gameState;
    if (firstMatch === null) throw new Error('First match was not created.');

    expect(actions.rematch().ok).toBe(true);
    const rematch = useAppStore.getState().gameState;
    expect(rematch?.config.seed).not.toBe(firstMatch.config.seed);
    expect(useAppStore.getState().lobby.players.map((player) => player.name)).toEqual([
      'Alex',
      'Sam',
    ]);
    expect(rematch?.turn.phase).toBe('SETUP_PLACE_HOUSE');
    expect(useAppStore.getState().gameEventHistory).toEqual([]);
  });

  it('prepares a new seed when returning to the lobby and can restore the completed seed', () => {
    const actions = useAppStore.getState();
    actions.addLobbyPlayer('Alex', PLAYER_COLORS[0]!.id);
    actions.addLobbyPlayer('Sam', PLAYER_COLORS[1]!.id);
    expect(actions.beginGame().ok).toBe(true);
    const completedSeed = useAppStore.getState().gameState?.config.seed;
    if (completedSeed === undefined) throw new Error('Return-to-lobby fixture has no match seed.');

    actions.returnGameToLobby();
    expect(useAppStore.getState()).toMatchObject({
      gameState: null,
      previousLobbySeed: completedSeed,
    });
    expect(useAppStore.getState().lobby.seed).not.toBe(completedSeed);

    actions.usePreviousLobbySeed();
    expect(useAppStore.getState().lobby.seed).toBe(completedSeed);
  });

  it('grants one fresh copy of every Progress Card on each developer-button press', () => {
    const actions = useAppStore.getState();
    actions.setLobbyMode(KN_MODE.id);
    actions.addLobbyPlayer('Alex', PLAYER_COLORS[0]!.id);
    actions.addLobbyPlayer('Sam', PLAYER_COLORS[1]!.id);
    expect(actions.beginGame().ok).toBe(true);
    const activePlayerId = useAppStore.getState().gameState?.turn.activePlayerId;
    if (activePlayerId === null || activePlayerId === undefined) {
      throw new Error('Developer Progress Card fixture has no active player.');
    }

    actions.grantAllProgressCards();
    actions.grantAllProgressCards();

    const gameState = useAppStore.getState().gameState;
    const player = gameState?.players[activePlayerId];
    const grantedIds = [
      ...(player?.knProgressCardIds ?? []),
      ...(player?.revealedKNProgressCardIds ?? []),
    ];
    expect(grantedIds).toHaveLength(KN_PROGRESS_CARDS.length * 2);
    expect(new Set(grantedIds).size).toBe(grantedIds.length);
    expect(
      new Set(
        grantedIds.map((id) => gameState?.kn?.progressCards[id]?.definitionId).filter(Boolean),
      ).size,
    ).toBe(KN_PROGRESS_CARDS.length);
  });
});
