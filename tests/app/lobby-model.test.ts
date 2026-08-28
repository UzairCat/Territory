import { describe, expect, it } from 'vitest';

import {
  buildGameConfig,
  createDefaultLobby,
  firstAvailableColorId,
  validateLobby,
  type LobbyConfig,
} from '../../src/app/lobby/lobby-model';
import { PLAYER_COLORS } from '../../src/engine/content/colors';
import { gameId, playerId } from '../../src/engine/core/ids';
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
    };
    const result = buildGameConfig(lobby, gameId('custom-rules'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toMatchObject({
      victoryTarget: 18,
      hideBankCards: true,
      friendlyRobber: true,
      balancedDice: true,
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
