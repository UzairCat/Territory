import type { ClassicRules, PlayerCount } from '../content/types';
import type { ColorId, GameId, MapId, ModeId, PlayerId } from './ids';

export const GAME_CONFIG_VERSION = 1;

export interface PlayerConfig {
  readonly id: PlayerId;
  readonly name: string;
  readonly colorId: ColorId;
  readonly order: number;
}

export interface GameConfig {
  readonly schemaVersion: typeof GAME_CONFIG_VERSION;
  readonly gameId: GameId;
  readonly modeId: ModeId;
  readonly mapId: MapId;
  readonly playerCount: PlayerCount;
  readonly seed: string;
  readonly victoryTarget: number;
  readonly turnTimeSeconds?: number;
  readonly hideBankCards?: boolean;
  readonly friendlyRobber?: boolean;
  readonly balancedDice?: boolean;
  readonly players: readonly PlayerConfig[];
  readonly rules: ClassicRules;
}

export type GameConfigIssueCode =
  | 'UNSUPPORTED_PLAYER_COUNT'
  | 'PLAYER_COUNT_MISMATCH'
  | 'DUPLICATE_PLAYER_ID'
  | 'DUPLICATE_PLAYER_NAME'
  | 'DUPLICATE_PLAYER_COLOR'
  | 'INVALID_PLAYER_NAME'
  | 'INVALID_PLAYER_ORDER'
  | 'INVALID_SEED'
  | 'INVALID_TURN_TIME'
  | 'INVALID_VICTORY_TARGET'
  | 'INVALID_DISCARD_THRESHOLD'
  | 'INVALID_RULE_TOGGLE';

export interface GameConfigIssue {
  readonly code: GameConfigIssueCode;
  readonly message: string;
}

export function validateGameConfig(config: GameConfig): readonly GameConfigIssue[] {
  const issues: GameConfigIssue[] = [];
  const playerIds = new Set(config.players.map((player) => player.id));
  const playerNames = new Set(
    config.players.map((player) => player.name.trim().toLocaleLowerCase()),
  );
  const playerColors = new Set(config.players.map((player) => player.colorId));
  const playerOrders = new Set(config.players.map((player) => player.order));

  if (
    config.playerCount < config.rules.playerCount.minimum ||
    config.playerCount > config.rules.playerCount.maximum
  ) {
    issues.push({
      code: 'UNSUPPORTED_PLAYER_COUNT',
      message: 'Classic mode supports 2–4 players.',
    });
  }

  if (config.players.length !== config.playerCount) {
    issues.push({
      code: 'PLAYER_COUNT_MISMATCH',
      message: 'Player count must match the configured players.',
    });
  }

  if (playerIds.size !== config.players.length) {
    issues.push({ code: 'DUPLICATE_PLAYER_ID', message: 'Every player must have a unique ID.' });
  }

  if (playerNames.size !== config.players.length) {
    issues.push({
      code: 'DUPLICATE_PLAYER_NAME',
      message: 'Player names must be unique, ignoring case.',
    });
  }

  if (playerColors.size !== config.players.length) {
    issues.push({ code: 'DUPLICATE_PLAYER_COLOR', message: 'Player colors must be unique.' });
  }

  if (
    playerOrders.size !== config.players.length ||
    !config.players.every(
      (player) =>
        Number.isSafeInteger(player.order) &&
        player.order >= 0 &&
        player.order < config.players.length,
    )
  ) {
    issues.push({ code: 'INVALID_PLAYER_ORDER', message: 'Player order values must be unique.' });
  }

  for (const player of config.players) {
    const trimmedName = player.name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 20) {
      issues.push({
        code: 'INVALID_PLAYER_NAME',
        message: 'Player names must contain 1–20 characters.',
      });
      break;
    }
  }

  if (config.seed.trim().length === 0) {
    issues.push({ code: 'INVALID_SEED', message: 'A match seed is required.' });
  }

  if (
    !Number.isSafeInteger(config.victoryTarget) ||
    config.victoryTarget < 3 ||
    config.victoryTarget > 26
  ) {
    issues.push({
      code: 'INVALID_VICTORY_TARGET',
      message: 'Victory target must be between 3 and 26.',
    });
  }

  if (
    !Number.isSafeInteger(config.rules.discardThreshold) ||
    config.rules.discardThreshold < 5 ||
    config.rules.discardThreshold > 20
  ) {
    issues.push({
      code: 'INVALID_DISCARD_THRESHOLD',
      message: 'Discard threshold must be between 5 and 20.',
    });
  }

  if (
    [config.hideBankCards, config.friendlyRobber, config.balancedDice].some(
      (value) => value !== undefined && typeof value !== 'boolean',
    )
  ) {
    issues.push({ code: 'INVALID_RULE_TOGGLE', message: 'Rule toggles must be boolean values.' });
  }

  if (
    config.turnTimeSeconds !== undefined &&
    (!Number.isSafeInteger(config.turnTimeSeconds) ||
      config.turnTimeSeconds < 20 ||
      config.turnTimeSeconds > 600)
  ) {
    issues.push({
      code: 'INVALID_TURN_TIME',
      message: 'Turn time must be between 20 seconds and 10 minutes.',
    });
  }

  return issues;
}
