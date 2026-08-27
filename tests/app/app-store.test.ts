// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import { resetAppStoreForTests, useAppStore } from '../../src/app/stores/app-store';
import { PLAYER_COLORS } from '../../src/engine/content/colors';

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
});
