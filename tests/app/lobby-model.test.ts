import { describe, expect, it } from 'vitest';

import {
  buildGameConfig,
  createDefaultLobby,
  firstAvailableColorId,
  RANDOM_MAP_ID,
  validateLobby,
  type LobbyConfig,
} from '../../src/app/lobby/lobby-model';
import { PLAYER_COLORS } from '../../src/engine/content/colors';
import { PLAYER_AVATARS } from '../../src/engine/content/avatars';
import { gameId, playerId } from '../../src/engine/core/ids';
import { MAPS } from '../../src/engine/maps/maps';
import { KN_MODE } from '../../src/engine/modes/kn';

function completeLobby(): LobbyConfig {
  return {
    ...createDefaultLobby('known-seed'),
    players: [
      { id: playerId('alex'), name: ' Alex ', colorId: PLAYER_COLORS[0]!.id },
      { id: playerId('sam'), name: 'Sam', colorId: PLAYER_COLORS[1]!.id },
    ],
  };
}

describe('local lobby model', () => {
  it('offers fourteen player colors and eight original preset avatars', () => {
    expect(PLAYER_COLORS).toHaveLength(14);
    expect(PLAYER_AVATARS).toHaveLength(8);
    expect(new Set(PLAYER_COLORS.map((color) => color.id)).size).toBe(14);
    expect(new Set(PLAYER_AVATARS.map((avatar) => avatar.id)).size).toBe(8);
  });

  it('explains why an incomplete lobby cannot start', () => {
    expect(validateLobby(createDefaultLobby('seed'))).toContainEqual({
      code: 'PLAYER_COUNT_INCOMPLETE',
      message: 'Add 2 more local players to start.',
    });
  });

  it('accepts a complete lobby and creates ordered, trimmed game configuration', () => {
    const result = buildGameConfig(completeLobby(), gameId('game-1'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.players.map((player) => [player.name, player.order])).toEqual([
      ['Alex', 0],
      ['Sam', 1],
    ]);
    expect(result.config.seed).toBe('known-seed');
    expect(result.config.playerCount).toBe(2);
    expect(result.config.turnTimeSeconds).toBe(60);
  });

  it('resolves Random to a reproducible concrete map when the match starts', () => {
    const lobby = { ...completeLobby(), mapId: RANDOM_MAP_ID };
    const first = buildGameConfig(lobby, gameId('random-map-game-1'));
    const second = buildGameConfig(lobby, gameId('random-map-game-2'));

    expect(validateLobby(lobby)).toEqual([]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(MAPS.map((map) => map.id)).toContain(first.config.mapId);
    expect(first.config.mapId).not.toBe(RANDOM_MAP_ID);
    expect(second.config.mapId).toBe(first.config.mapId);
  });

  it('persists a configured turn time and uses the K+N victory target', () => {
    const lobby: LobbyConfig = {
      ...completeLobby(),
      modeId: KN_MODE.id,
      turnTimeSeconds: 120,
      victoryTarget: KN_MODE.rules.victoryTarget,
    };
    const result = buildGameConfig(lobby, gameId('kn-game'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.turnTimeSeconds).toBe(120);
    expect(result.config.victoryTarget).toBe(13);
  });

  it('uses the requested scoring, discard, and room-rule settings', () => {
    const lobby: LobbyConfig = {
      ...completeLobby(),
      victoryTarget: 18,
      discardThreshold: 12,
      hideBankCards: true,
      friendlyRobber: true,
      balancedDice: true,
      inventorsMadness: true,
    };
    const result = buildGameConfig(lobby, gameId('custom-rules'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toMatchObject({
      victoryTarget: 18,
      hideBankCards: true,
      friendlyRobber: true,
      balancedDice: true,
      inventorsMadness: true,
      rules: { victoryTarget: 18, discardThreshold: 12 },
    });
  });

  it('validates the public lobby ranges', () => {
    expect(
      validateLobby({ ...completeLobby(), victoryTarget: 2, discardThreshold: 21 }).map(
        (issue) => issue.code,
      ),
    ).toEqual(expect.arrayContaining(['INVALID_VICTORY_TARGET', 'INVALID_DISCARD_THRESHOLD']));
  });

  it('rejects a turn time outside the supported range', () => {
    const codes = validateLobby({ ...completeLobby(), turnTimeSeconds: 19 }).map(
      (issue) => issue.code,
    );

    expect(codes).toContain('INVALID_TURN_TIME');
  });

  it('rejects duplicate names and colors', () => {
    const lobby = completeLobby();
    const invalid: LobbyConfig = {
      ...lobby,
      players: [
        lobby.players[0]!,
        { ...lobby.players[1]!, name: 'ALEX', colorId: PLAYER_COLORS[0]!.id },
      ],
    };
    const codes = validateLobby(invalid).map((issue) => issue.code);

    expect(codes).toContain('DUPLICATE_PLAYER_NAME');
    expect(codes).toContain('DUPLICATE_PLAYER_COLOR');
  });

  it('selects the first color not already used by another player', () => {
    const lobby = completeLobby();

    expect(firstAvailableColorId(lobby.players)).toBe(PLAYER_COLORS[2]!.id);
    expect(firstAvailableColorId(lobby.players, lobby.players[0]!.id)).toBe(PLAYER_COLORS[0]!.id);
  });
});
