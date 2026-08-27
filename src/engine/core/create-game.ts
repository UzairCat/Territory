import { BUILDING_DEFINITIONS } from '../content/buildings';
import { RESOURCES } from '../content/resources';
import { resourceBundle } from '../content/types';
import { validateClassicContent } from '../content/validate-content';
import { generateBaseBoard } from '../board/generate-board';
import { validateBoard } from '../board/validate-board';
import { generateProgressDeck } from '../cards/generate-deck';
import { BASE_MAP } from '../maps/base-map';
import { CLASSIC_MODE } from '../modes/classic';
import type { GameConfigIssue } from './game-config';
import { validateGameConfig } from './game-config';
import { GAME_STATE_VERSION } from './game-state';
import type { GameState, PlayerState } from './game-state';
import { createRandomState, shuffle } from './random';

export interface CreateGameIssue {
  readonly code: string;
  readonly message: string;
}

export type CreateGameResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly issues: readonly CreateGameIssue[] };

function toCreateGameIssue(issue: GameConfigIssue): CreateGameIssue {
  return issue;
}

export function createGame(config: GameState['config']): CreateGameResult {
  const issues: CreateGameIssue[] = [
    ...validateGameConfig(config).map(toCreateGameIssue),
    ...validateClassicContent(),
  ];

  if (config.modeId !== CLASSIC_MODE.id) {
    issues.push({ code: 'UNSUPPORTED_MODE', message: 'The requested game mode is unavailable.' });
  }

  if (config.mapId !== BASE_MAP.id) {
    issues.push({ code: 'UNSUPPORTED_MAP', message: 'The requested map is unavailable.' });
  }

  if (!BASE_MAP.supportedPlayerCounts.includes(config.playerCount)) {
    issues.push({
      code: 'MAP_PLAYER_COUNT_UNSUPPORTED',
      message: 'The selected map does not support this player count.',
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const initialPlayers = [...config.players].sort((first, second) => first.order - second.order);
  const shuffledPlayers = shuffle(createRandomState(config.seed), initialPlayers);
  const orderedPlayers = shuffledPlayers.value.map((player, order) => ({ ...player, order }));
  const resolvedConfig = { ...config, players: orderedPlayers };
  let generatedBoard: ReturnType<typeof generateBaseBoard>;
  let generatedDeck: ReturnType<typeof generateProgressDeck>;

  try {
    generatedBoard = generateBaseBoard(shuffledPlayers.state);
    const boardIssues = validateBoard(generatedBoard.board);
    if (boardIssues.length > 0) {
      return { ok: false, issues: boardIssues };
    }
    generatedDeck = generateProgressDeck(generatedBoard.random);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          code: 'MATCH_GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'Match generation failed unexpectedly.',
        },
      ],
    };
  }
  const players = Object.fromEntries(
    orderedPlayers.map((player): readonly [string, PlayerState] => [
      player.id,
      {
        id: player.id,
        name: player.name.trim(),
        colorId: player.colorId,
        resources: resourceBundle([]),
        progressCardIds: [],
        roadsRemaining: BUILDING_DEFINITIONS.ROAD.initialSupply,
        housesRemaining: BUILDING_DEFINITIONS.HOUSE.initialSupply,
        mansionsRemaining: BUILDING_DEFINITIONS.MANSION.initialSupply,
        playedForceCards: 0,
      },
    ]),
  );
  const bank = resourceBundle(
    RESOURCES.map((resource) => [resource.id, config.rules.bankCardsPerResource] as const),
  );

  return {
    ok: true,
    state: {
      schemaVersion: GAME_STATE_VERSION,
      config: resolvedConfig,
      players,
      board: generatedBoard.board,
      bank,
      turn: {
        activePlayerId: orderedPlayers[0]?.id ?? null,
        turnNumber: 0,
        phase: 'SETUP_PLACE_HOUSE',
        dice: null,
        cardsPlayedThisTurn: 0,
        cardIdsBoughtThisTurn: [],
        setupPlacementIndex: 0,
        setupPlacementVertexId: null,
      },
      progressDeck: generatedDeck.deck,
      progressDiscard: [],
      progressCards: generatedDeck.cards,
      pendingInteraction: null,
      bonuses: { longestRoadHolderId: null, largestForceHolderId: null },
      winnerId: null,
      actionHistory: [],
      random: generatedDeck.random,
    },
  };
}
