import { BUILDING_DEFINITIONS } from '../content/buildings';
import { RESOURCES } from '../content/resources';
import { COMMODITIES } from '../content/commodities';
import { resourceBundle } from '../content/types';
import { validateClassicContent } from '../content/validate-content';
import { generateBoard } from '../board/generate-board';
import { validateBoard } from '../board/validate-board';
import { generateProgressDeck } from '../cards/generate-deck';
import { generateKNProgressDecks } from '../cards/generate-kn-decks';
import { getMapDefinition } from '../maps/maps';
import { CLASSIC_MODE } from '../modes/classic';
import { KN_MODE } from '../modes/kn';
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
  const map = getMapDefinition(config.mapId);
  const issues: CreateGameIssue[] = [
    ...validateGameConfig(config).map(toCreateGameIssue),
    ...validateClassicContent(),
  ];

  if (config.modeId !== CLASSIC_MODE.id && config.modeId !== KN_MODE.id) {
    issues.push({ code: 'UNSUPPORTED_MODE', message: 'The requested game mode is unavailable.' });
  }

  if (map === undefined) {
    issues.push({ code: 'UNSUPPORTED_MAP', message: 'The requested map is unavailable.' });
  }

  if (map !== undefined && !map.supportedPlayerCounts.includes(config.playerCount)) {
    issues.push({
      code: 'MAP_PLAYER_COUNT_UNSUPPORTED',
      message: 'The selected map does not support this player count.',
    });
  }

  if (map !== undefined && !map.supportedModeIds.includes(config.modeId)) {
    issues.push({
      code: 'MAP_MODE_UNSUPPORTED',
      message: 'The selected map does not support this game mode.',
    });
  }

  if (issues.length > 0 || map === undefined) {
    return { ok: false, issues };
  }

  const initialPlayers = [...config.players].sort((first, second) => first.order - second.order);
  const shuffledPlayers = shuffle(createRandomState(config.seed), initialPlayers);
  const orderedPlayers = shuffledPlayers.value.map((player, order) => ({ ...player, order }));
  const resolvedConfig = { ...config, players: orderedPlayers };
  let generatedBoard: ReturnType<typeof generateBoard>;
  let generatedDeck: ReturnType<typeof generateProgressDeck> | null = null;
  let generatedKNDecks: ReturnType<typeof generateKNProgressDecks> | null = null;

  try {
    generatedBoard = generateBoard(map, shuffledPlayers.state);
    const boardIssues = validateBoard(generatedBoard.board, map);
    if (boardIssues.length > 0) {
      return { ok: false, issues: boardIssues };
    }
    if (config.modeId === KN_MODE.id) {
      generatedKNDecks = generateKNProgressDecks(generatedBoard.random);
    } else {
      generatedDeck = generateProgressDeck(generatedBoard.random);
    }
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
        commodities: resourceBundle([]),
        progressCardIds: [],
        roadsRemaining: BUILDING_DEFINITIONS.ROAD.initialSupply,
        housesRemaining: BUILDING_DEFINITIONS.HOUSE.initialSupply,
        mansionsRemaining: BUILDING_DEFINITIONS.MANSION.initialSupply,
        playedForceCards: 0,
        cityImprovements: { SCIENCE: 0, TRADE: 0, POLITICS: 0 },
        knights: [],
        cityWallsRemaining: 3,
        knProgressCardIds: [],
        revealedKNProgressCardIds: [],
        defenderPoints: 0,
        mustRebuildDestroyedMansion: false,
        forcedMansionRebuildVertexIds: [],
        craneDiscountAvailable: false,
        merchantFleetGoodId: null,
      },
    ]),
  );
  const bank = resourceBundle(
    RESOURCES.map((resource) => [resource.id, config.rules.bankCardsPerResource] as const),
  );
  const commodityBank = resourceBundle(
    COMMODITIES.map((commodity) => [commodity.id, config.rules.bankCardsPerResource] as const),
  );
  const isKN = config.modeId === KN_MODE.id;
  const random = generatedKNDecks?.random ?? generatedDeck?.random;
  if (random === undefined) {
    return {
      ok: false,
      issues: [
        { code: 'MATCH_GENERATION_FAILED', message: 'Card deck generation did not complete.' },
      ],
    };
  }

  return {
    ok: true,
    state: {
      schemaVersion: GAME_STATE_VERSION,
      config: resolvedConfig,
      players,
      board: generatedBoard.board,
      bank,
      commodityBank,
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
      progressDeck: generatedDeck?.deck ?? [],
      progressDiscard: [],
      progressCards: generatedDeck?.cards ?? {},
      tradeOffers: {},
      pendingInteraction: null,
      bonuses: { longestRoadHolderId: null, largestForceHolderId: null },
      winnerId: null,
      actionHistory: [],
      random,
      balancedDice: config.balancedDice
        ? { remainingPairIds: Array.from({ length: 36 }, (_, index) => index), recentTotals: [] }
        : null,
      inventorsMadness: config.inventorsMadness ? { pendingHexIds: null } : null,
      kn:
        !isKN || generatedKNDecks === null
          ? null
          : {
              barbarianPosition: 0,
              barbarianTrackLength: 7,
              firstBarbarianAttackResolved: false,
              eventDieResult: null,
              redDieResult: null,
              regularDieResult: null,
              progressDecks: generatedKNDecks.decks,
              progressDiscards: { SCIENCE: [], TRADE: [], POLITICS: [] },
              progressCards: generatedKNDecks.cards,
              metropolisOwners: { SCIENCE: null, TRADE: null, POLITICS: null },
              merchant: null,
              pendingRoll: null,
              attackSummary: null,
            },
    },
  };
}
