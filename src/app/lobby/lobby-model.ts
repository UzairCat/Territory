import { PLAYER_COLORS } from '../../engine/content/colors';
import type { PlayerCount } from '../../engine/content/types';
import type { GameConfig } from '../../engine/core/game-config';
import type { ColorId, GameId, MapId, ModeId, PlayerId } from '../../engine/core/ids';
import { BASE_MAP } from '../../engine/maps/base-map';
import { CLASSIC_MODE } from '../../engine/modes/classic';

export const AVAILABLE_MAPS = [BASE_MAP] as const;
export const AVAILABLE_MODES = [CLASSIC_MODE] as const;
export const LOBBY_SIZES: readonly PlayerCount[] = [2, 3, 4];

export interface LocalLobbyPlayer {
  readonly id: PlayerId;
  readonly name: string;
  readonly colorId: ColorId;
}

export interface LobbyConfig {
  readonly mapId: MapId;
  readonly modeId: ModeId;
  readonly size: PlayerCount;
  readonly seed: string;
  readonly players: readonly LocalLobbyPlayer[];
}

export type LobbyIssueCode =
  | 'PLAYER_COUNT_INCOMPLETE'
  | 'PLAYER_COUNT_EXCEEDED'
  | 'INVALID_PLAYER_NAME'
  | 'DUPLICATE_PLAYER_NAME'
  | 'DUPLICATE_PLAYER_COLOR'
  | 'INVALID_PLAYER_COLOR'
  | 'INVALID_SEED'
  | 'INVALID_MAP'
  | 'INVALID_MODE'
  | 'INCOMPATIBLE_MAP_MODE'
  | 'UNSUPPORTED_MAP_SIZE';

export interface LobbyIssue {
  readonly code: LobbyIssueCode;
  readonly message: string;
}

export type BuildGameConfigResult =
  | { readonly ok: true; readonly config: GameConfig }
  | { readonly ok: false; readonly issues: readonly LobbyIssue[] };

export function createDefaultLobby(seed: string): LobbyConfig {
  return {
    mapId: BASE_MAP.id,
    modeId: CLASSIC_MODE.id,
    size: 2,
    seed,
    players: [],
  };
}

export function suggestPlayerName(players: readonly LocalLobbyPlayer[]): string {
  for (let number = 1; number <= 99; number += 1) {
    const suggestion = `Player ${number}`;
    if (
      !players.some(
        (player) => player.name.trim().toLocaleLowerCase() === suggestion.toLocaleLowerCase(),
      )
    ) {
      return suggestion;
    }
  }

  return 'New Player';
}

export function firstAvailableColorId(
  players: readonly LocalLobbyPlayer[],
  editingPlayerId: PlayerId | null = null,
): ColorId | null {
  const usedColors = new Set(
    players.filter((player) => player.id !== editingPlayerId).map((player) => player.colorId),
  );

  return PLAYER_COLORS.find((color) => !usedColors.has(color.id))?.id ?? null;
}

export function validateLobby(lobby: LobbyConfig): readonly LobbyIssue[] {
  const issues: LobbyIssue[] = [];
  const map = AVAILABLE_MAPS.find((entry) => entry.id === lobby.mapId);
  const mode = AVAILABLE_MODES.find((entry) => entry.id === lobby.modeId);
  const normalizedNames = lobby.players.map((player) => player.name.trim().toLocaleLowerCase());
  const colorIds = lobby.players.map((player) => player.colorId);
  const allowedColors = new Set(PLAYER_COLORS.map((color) => color.id));

  if (lobby.players.length < lobby.size) {
    const remaining = lobby.size - lobby.players.length;
    issues.push({
      code: 'PLAYER_COUNT_INCOMPLETE',
      message: `Add ${remaining} more local ${remaining === 1 ? 'player' : 'players'} to start.`,
    });
  }

  if (lobby.players.length > lobby.size) {
    issues.push({
      code: 'PLAYER_COUNT_EXCEEDED',
      message: 'Remove excess players before starting.',
    });
  }

  if (
    lobby.players.some((player) => player.name.trim().length < 1 || player.name.trim().length > 20)
  ) {
    issues.push({
      code: 'INVALID_PLAYER_NAME',
      message: 'Player names must contain 1–20 characters.',
    });
  }

  if (new Set(normalizedNames).size !== normalizedNames.length) {
    issues.push({
      code: 'DUPLICATE_PLAYER_NAME',
      message: 'Player names must be unique, ignoring capitalization.',
    });
  }

  if (new Set(colorIds).size !== colorIds.length) {
    issues.push({ code: 'DUPLICATE_PLAYER_COLOR', message: 'Each player needs a unique color.' });
  }

  if (colorIds.some((colorId) => !allowedColors.has(colorId))) {
    issues.push({ code: 'INVALID_PLAYER_COLOR', message: 'A player has an unavailable color.' });
  }

  if (lobby.seed.trim().length === 0) {
    issues.push({ code: 'INVALID_SEED', message: 'Enter or generate a match seed.' });
  }

  if (map === undefined) {
    issues.push({ code: 'INVALID_MAP', message: 'Select an available map.' });
  }

  if (mode === undefined) {
    issues.push({ code: 'INVALID_MODE', message: 'Select an available game mode.' });
  }

  if (map !== undefined && mode !== undefined && !map.supportedModeIds.includes(mode.id)) {
    issues.push({
      code: 'INCOMPATIBLE_MAP_MODE',
      message: 'The selected map and mode are incompatible.',
    });
  }

  if (map !== undefined && !map.supportedPlayerCounts.includes(lobby.size)) {
    issues.push({
      code: 'UNSUPPORTED_MAP_SIZE',
      message: 'The selected map does not support this lobby size.',
    });
  }

  return issues;
}

export function buildGameConfig(lobby: LobbyConfig, id: GameId): BuildGameConfigResult {
  const issues = validateLobby(lobby);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    config: {
      schemaVersion: 1,
      gameId: id,
      modeId: lobby.modeId,
      mapId: lobby.mapId,
      playerCount: lobby.size,
      seed: lobby.seed.trim(),
      victoryTarget: CLASSIC_MODE.rules.victoryTarget,
      players: lobby.players.map((player, order) => ({
        id: player.id,
        name: player.name.trim(),
        colorId: player.colorId,
        order,
      })),
      rules: CLASSIC_MODE.rules,
    },
  };
}
