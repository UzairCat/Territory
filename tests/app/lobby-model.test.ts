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
