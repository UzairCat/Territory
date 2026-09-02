// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../../src/app/App';
import { audioManager } from '../../src/app/audio/audio-manager';
import { resetAppStoreForTests, useAppStore } from '../../src/app/stores/app-store';
import { resetOnlineStoreForTests, useOnlineStore } from '../../src/app/stores/online-store';
import type { BoardViewportProps } from '../../src/board-renderer/BoardViewport';
import { COMMODITY_IDS } from '../../src/engine/content/commodities';
import { KN_PROGRESS_CARDS } from '../../src/engine/content/kn-progress-cards';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { createGame } from '../../src/engine/core/create-game';
import type { GameEvent } from '../../src/engine/core/events';
import type { GameState } from '../../src/engine/core/game-state';
import { edgeId, knightId } from '../../src/engine/core/ids';
import { createOnlineGameView } from '../../src/multiplayer/projection';
import { BarbarianTracker } from '../../src/ui/game/BarbarianTracker';
import { PlayerPanel } from '../../src/ui/game/PlayerPanel';
import { createTestKNConfig, TEST_PLAYER_IDS } from '../helpers/game-state';

const boardRenderProbe = vi.hoisted(() => ({
  emphasizedVertexRefs: [] as unknown[],
  robberAttention: [] as boolean[],
  inventorSelectionActive: [] as boolean[],
  inventorSelectedHexIds: [] as unknown[],
  inventorPendingHexIds: [] as unknown[],
  numberTokenSwaps: [] as unknown[],
  merchantPlacementActive: [] as boolean[],
}));

vi.mock('../../src/board-renderer/BoardViewport', () => ({
  BoardViewport: ({
    board,
    selectableTargets,
    emphasizedEdgeIds = [],
    emphasizedVertexIds = [],
    resourceFlyovers = [],
    progressCardFlyovers = [],
    showRobberAttention = false,
    inventorSelectionActive = false,
    inventorSelectedHexId = null,
    inventorPendingHexId = null,
    numberTokenSwap = null,
    merchantPlacementActive = false,
    onInspect,
    onSelect,
  }: BoardViewportProps) => {
    boardRenderProbe.emphasizedVertexRefs.push(emphasizedVertexIds);
    boardRenderProbe.robberAttention.push(showRobberAttention);
    boardRenderProbe.inventorSelectionActive.push(inventorSelectionActive);
    boardRenderProbe.inventorSelectedHexIds.push(inventorSelectedHexId);
    boardRenderProbe.inventorPendingHexIds.push(inventorPendingHexId);
    boardRenderProbe.numberTokenSwaps.push(numberTokenSwap);
    boardRenderProbe.merchantPlacementActive.push(merchantPlacementActive);
    const firstHexId = Object.values(board.hexes)[0]?.id;
    const firstRoadEdge = Object.values(board.edges).find((edge) => edge.roadOwnerId !== null);
    return (
      <section aria-label="Territory board">
        <button
          type="button"
          onMouseEnter={() =>
            onInspect(firstHexId === undefined ? null : { kind: 'HEX', id: firstHexId })
          }
        >
          Inspect map
        </button>
        <output data-testid="resource-flyovers">
          {resourceFlyovers.map((flyover) => `${flyover.source.kind}:${flyover.resourceId}|`)}
        </output>
        <output data-testid="resource-flyover-targets">
          {resourceFlyovers.map((flyover) =>
            flyover.target?.kind === 'PLAYER'
              ? `${flyover.target.playerId}|`
              : `${flyover.targetPlayerId ?? (flyover.target?.kind === 'BANK' ? 'BANK' : 'visible')}|`,
          )}
        </output>
        <output data-testid="progress-card-flyovers">
          {progressCardFlyovers.map(
            (flyover) =>
              `${flyover.source.kind === 'PLAYER' ? flyover.source.playerId : `deck-${flyover.source.family ?? 'base'}`}:${flyover.cardDefinitionId}|`,
          )}
        </output>
        <output data-testid="emphasized-vertices">{emphasizedVertexIds.join('|')}</output>
        <output data-testid="emphasized-road-chain">{emphasizedEdgeIds.join('|')}</output>
        <output data-testid="inventor-selection">
          {inventorSelectionActive ? `active:${inventorSelectedHexId ?? 'none'}` : 'inactive'}
        </output>
        <output data-testid="inventor-pending">{inventorPendingHexId ?? 'none'}</output>
        <output data-testid="number-token-swap">{numberTokenSwap?.join('|') ?? ''}</output>
        <output data-testid="merchant-placement">
          {merchantPlacementActive ? 'active' : 'inactive'}
        </output>
        {firstRoadEdge === undefined ? null : (
          <button
            type="button"
            aria-label={`Inspect road ${firstRoadEdge.id}`}
            onMouseEnter={() => onInspect({ kind: 'EDGE', id: firstRoadEdge.id })}
            onMouseLeave={() => onInspect(null)}
          >
            Inspect road
          </button>
        )}
        {selectableTargets.map((target) => (
          <button
            key={`${target.kind}:${target.id}`}
            type="button"
            onClick={() => onSelect(target, { x: 500, y: 300 })}
          >
            Select {target.kind} {target.id}
          </button>
        ))}
      </section>
    );
  },
}));

function knActionState(): GameState {
  const created = createGame(createTestKNConfig());
  if (!created.ok || created.state.kn === null)
    throw new Error('K+N test game did not initialize.');
  return {
    ...created.state,
    turn: {
      ...created.state.turn,
      activePlayerId: TEST_PLAYER_IDS[0],
      phase: 'ACTION_PHASE',
      turnNumber: 3,
      dice: [3, 4],
      setupPlacementIndex: null,
      setupPlacementVertexId: null,
    },
    pendingInteraction: null,
  };
}

function renderGame(state: GameState, recentGameEvents: readonly GameEvent[] = []) {
  useAppStore.setState({ gameState: state, recentGameEvents, gameEventHistory: recentGameEvents });
  return render(
    <MemoryRouter initialEntries={['/game']}>
      <App />
    </MemoryRouter>,
  );
}

function findBoardEdgePath(board: GameState['board'], length: number) {
  const walk = (
    vertexId: (typeof board.vertices)[string]['id'],
    trail: readonly (typeof board.edges)[string]['id'][],
  ): readonly (typeof board.edges)[string]['id'][] | null => {
    if (trail.length === length) return trail;
    const vertex = board.vertices[vertexId];
    if (vertex === undefined) return null;
    for (const nextEdgeId of vertex.connectedEdgeIds) {
      if (trail.includes(nextEdgeId)) continue;
      const edge = board.edges[nextEdgeId];
      if (edge === undefined) continue;
      const nextVertexId = edge.vertexAId === vertexId ? edge.vertexBId : edge.vertexAId;
      const result = walk(nextVertexId, [...trail, nextEdgeId]);
      if (result !== null) return result;
    }
    return null;
  };

  for (const vertex of Object.values(board.vertices)) {
    const path = walk(vertex.id, []);
    if (path !== null) return path;
  }
  throw new Error(`Could not find a ${length}-edge board path.`);
}

describe('K+N compact choice flows', () => {
  beforeEach(() => {
    resetAppStoreForTests();
    resetOnlineStoreForTests();
    boardRenderProbe.emphasizedVertexRefs.length = 0;
    boardRenderProbe.robberAttention.length = 0;
    boardRenderProbe.inventorSelectionActive.length = 0;
    boardRenderProbe.inventorSelectedHexIds.length = 0;
    boardRenderProbe.inventorPendingHexIds.length = 0;
    boardRenderProbe.numberTokenSwaps.length = 0;
    boardRenderProbe.merchantPlacementActive.length = 0;
  });
  afterEach(() => {
    cleanup();
    resetOnlineStoreForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('chooses an Aqueduct resource in the hand tray and animates it from the bank', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Aqueduct fixture has no K+N state.');
    const state: GameState = {
      ...original,
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[1],
        purpose: 'AQUEDUCT_RESOURCE',
        eligibleIds: [
          RESOURCE_IDS.wood,
          RESOURCE_IDS.brick,
          RESOURCE_IDS.grain,
          RESOURCE_IDS.livestock,
          RESOURCE_IDS.ore,
        ],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [TEST_PLAYER_IDS[1]],
        canCancel: false,
        context: {},
      },
    };
    renderGame(state);

    const tray = screen.getByRole('dialog', { name: 'Choose an Aqueduct card' });
    expect(screen.getByLabelText('Sam, player 2')).toHaveTextContent('Choosing an Aqueduct card');
    expect(
      screen
        .getByLabelText('Sam, player 2')
        .querySelector('.game-player__portrait > .game-player__busy-dots'),
    ).not.toBeNull();
    const confirm = within(tray).getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    await user.click(within(tray).getByRole('button', { name: 'Choose Ore from the bank' }));
    expect(confirm).toBeEnabled();
    expect(confirm).toHaveClass('is-ready');
    await user.click(confirm);

    expect(screen.queryByRole('dialog', { name: 'Choose an Aqueduct card' })).toBeNull();
    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[1]]?.resources).toMatchObject({
      ore: 1,
    });
    expect(screen.getByTestId('resource-flyovers')).toHaveTextContent('BANK:ore|');
  });

  it('chooses a tied defender reward from a three-deck shelf with a 15-second timer', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Defender reward fixture has no K+N state.');
    const state: GameState = {
      ...original,
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[0],
        purpose: 'DEFENDER_TIE_DECK',
        eligibleIds: ['SCIENCE', 'TRADE', 'POLITICS'],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [TEST_PLAYER_IDS[0]],
        canCancel: false,
        context: {},
      },
    };
    renderGame(state);

    const tray = screen.getByRole('dialog', { name: 'Choose your defender reward' });
    expect(
      screen.getByLabelText('Alex is choosing a defender reward: 15 seconds remaining'),
    ).toBeInTheDocument();
    const confirm = within(tray).getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    await user.click(within(tray).getByRole('button', { name: 'Choose the Trade Progress deck' }));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    const player = useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]];
    expect(
      (player?.knProgressCardIds.length ?? 0) + (player?.revealedKNProgressCardIds.length ?? 0),
    ).toBe(1);
    expect(screen.getByTestId('progress-card-flyovers')).toHaveTextContent('deck-TRADE:');
  });

  it('chooses Resource Monopoly from the hand tray instead of a central modal', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Resource Monopoly fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find(
      (candidate) => candidate.effect === 'RESOURCE_MONOPOLY',
    );
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    if (definition === undefined || card === undefined) {
      throw new Error('Resource Monopoly fixture card is missing.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          knProgressCardIds: [],
        },
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([[RESOURCE_IDS.brick, 3]]),
        },
      },
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[0],
        purpose: 'RESOURCE_MONOPOLY',
        sourceCardId: card.instanceId,
        eligibleIds: [
          RESOURCE_IDS.wood,
          RESOURCE_IDS.brick,
          RESOURCE_IDS.grain,
          RESOURCE_IDS.livestock,
          RESOURCE_IDS.ore,
        ],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [TEST_PLAYER_IDS[0]],
        canCancel: true,
        context: {},
      },
      kn: {
        ...original.kn,
        progressDecks: {
          ...original.kn.progressDecks,
          [definition.family]: original.kn.progressDecks[definition.family].filter(
            (id) => id !== card.instanceId,
          ),
        },
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: {
            ...card,
            ownerId: TEST_PLAYER_IDS[0],
            playedTurn: original.turn.turnNumber,
          },
        },
      },
    };
    renderGame(state);

    const tray = screen.getByRole('dialog', {
      name: 'Choose a resource for Resource Monopoly',
    });
    expect(tray).toHaveClass('kn-choice-tray--monopoly');
    const confirm = within(tray).getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    await user.click(
      within(tray).getByRole('button', { name: 'Choose Brick for Resource Monopoly' }),
    );
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(
      screen.queryByRole('dialog', { name: 'Choose a resource for Resource Monopoly' }),
    ).toBeNull();
    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.resources[RESOURCE_IDS.brick],
    ).toBe(2);
    expect(screen.getByTestId('resource-flyovers')).toHaveTextContent(
      `PLAYER:${RESOURCE_IDS.brick}|PLAYER:${RESOURCE_IDS.brick}|`,
    );
    expect(screen.getByTestId('resource-flyover-targets')).toHaveTextContent(
      `${TEST_PLAYER_IDS[0]}|${TEST_PLAYER_IDS[0]}|`,
    );
    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[1]]?.resources[RESOURCE_IDS.brick],
    ).toBe(1);
  });

  it('chooses Commodity Monopoly from the same card shelf', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Commodity Monopoly fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find(
      (candidate) => candidate.effect === 'COMMODITY_MONOPOLY',
    );
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    if (definition === undefined || card === undefined) {
      throw new Error('Commodity Monopoly fixture card is missing.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          knProgressCardIds: [],
        },
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          commodities: resourceBundle([[COMMODITY_IDS.coin, 2]]),
        },
      },
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[0],
        purpose: 'COMMODITY_MONOPOLY',
        sourceCardId: card.instanceId,
        eligibleIds: [COMMODITY_IDS.cloth, COMMODITY_IDS.coin, COMMODITY_IDS.paper],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [TEST_PLAYER_IDS[0]],
        canCancel: true,
        context: {},
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: {
            ...card,
            ownerId: TEST_PLAYER_IDS[0],
            playedTurn: original.turn.turnNumber,
          },
        },
      },
    };
    renderGame(state);

    const tray = screen.getByRole('dialog', {
      name: 'Choose a commodity for Commodity Monopoly',
    });
    await user.click(
      within(tray).getByRole('button', { name: 'Choose Coin for Commodity Monopoly' }),
    );
    await user.click(within(tray).getByRole('button', { name: 'Confirm' }));

    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.commodities[
        COMMODITY_IDS.coin
      ],
    ).toBe(1);
  });

  it('runs Commercial Harbor through player, offered-resource, and returned-commodity shelves', async () => {
    const user = userEvent.setup();
    const invalidSound = vi.spyOn(audioManager, 'playInvalid');
    const original = knActionState();
    if (original.kn === null) throw new Error('Commercial Harbor fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find(
      (candidate) => candidate.effect === 'COMMERCIAL_HARBOR',
    );
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    if (card === undefined) throw new Error('Commercial Harbor fixture card is missing.');
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 1]]),
          commodities: resourceBundle([[COMMODITY_IDS.cloth, 1]]),
          knProgressCardIds: [],
        },
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          commodities: resourceBundle([[COMMODITY_IDS.cloth, 2]]),
        },
      },
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[0],
        purpose: 'COMMERCIAL_HARBOR_PLAYER',
        sourceCardId: card.instanceId,
        eligibleIds: [TEST_PLAYER_IDS[1]],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [TEST_PLAYER_IDS[0]],
        canCancel: true,
        context: {
          activePlayerId: TEST_PLAYER_IDS[0],
          remainingOpponents: [TEST_PLAYER_IDS[1]],
        },
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: {
            ...card,
            ownerId: TEST_PLAYER_IDS[0],
            playedTurn: original.turn.turnNumber,
          },
        },
      },
    };
    renderGame(state);

    await user.click(screen.getByRole('button', { name: /Visit Sam with Commercial Harbor/ }));
    const offered = screen.getByRole('dialog', { name: 'Choose a card to give Sam' });
    await user.click(
      screen.getByRole('button', {
        name: 'Select Cloth for Commercial Harbor. 1 card available',
      }),
    );
    expect(within(offered).getByRole('alert')).toHaveTextContent(
      'Commercial Harbor can only give a resource card.',
    );
    expect(invalidSound).toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', {
        name: 'Select Wood for Commercial Harbor. 1 card available',
      }),
    );
    await user.click(within(offered).getByRole('button', { name: 'Confirm' }));
    const returned = screen.getByRole('dialog', {
      name: 'Sam, choose a commodity to return',
    });
    expect(
      within(returned).getAllByRole('button', {
        name: 'Return Cloth through Commercial Harbor',
      }),
    ).toHaveLength(2);
    expect(
      within(returned).queryByRole('button', {
        name: 'Return Coin through Commercial Harbor',
      }),
    ).toBeNull();
    await user.click(
      within(returned).getAllByRole('button', {
        name: 'Return Cloth through Commercial Harbor',
      })[0]!,
    );
    await user.click(within(returned).getByRole('button', { name: 'Confirm' }));

    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.commodities[
        COMMODITY_IDS.cloth
      ],
    ).toBe(2);
    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[1]]?.resources[RESOURCE_IDS.wood],
    ).toBe(1);
    expect(screen.getByTestId('resource-flyovers')).toHaveTextContent(
      `PLAYER:${COMMODITY_IDS.cloth}|`,
    );
  });

  it('shows the public commodity count for a Commercial Harbor partner online', () => {
    const original = knActionState();
    if (original.kn === null) throw new Error('Commercial Harbor fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find(
      (candidate) => candidate.effect === 'COMMERCIAL_HARBOR',
    );
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    if (card === undefined) throw new Error('Commercial Harbor fixture card is missing.');
    const actorId = TEST_PLAYER_IDS[0];
    const targetId = TEST_PLAYER_IDS[1];
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [actorId]: {
          ...original.players[actorId]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 1]]),
        },
        [targetId]: {
          ...original.players[targetId]!,
          commodities: resourceBundle([[COMMODITY_IDS.cloth, 2]]),
        },
      },
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: actorId,
        purpose: 'COMMERCIAL_HARBOR_PLAYER',
        sourceCardId: card.instanceId,
        eligibleIds: [targetId],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [actorId],
        canCancel: true,
        context: { activePlayerId: actorId, remainingOpponents: [targetId] },
      },
    };
    const game = createOnlineGameView(state, actorId, 1, [], [], false, false, null, null);
    useOnlineStore.setState({
      connection: 'CONNECTED',
      credentials: { roomCode: 'HARBOR', playerId: actorId, resumeToken: 'h'.repeat(32) },
      room: {
        protocolVersion: 1,
        code: 'HARBOR',
        phase: 'PLAYING',
        viewerPlayerId: actorId,
        hostPlayerId: actorId,
        players: state.config.players.map((player) => ({
          id: player.id,
          name: player.name,
          colorId: player.colorId,
          connected: true,
          ready: true,
          host: player.id === actorId,
        })),
        settings: {
          mapId: state.config.mapId,
          modeId: state.config.modeId,
          size: 2,
          seed: state.config.seed,
          turnTimeSeconds: state.config.turnTimeSeconds ?? 60,
          victoryTarget: state.config.victoryTarget,
          discardThreshold: state.config.rules.discardThreshold,
          hideBankCards: state.config.hideBankCards ?? false,
          friendlyRobber: state.config.friendlyRobber ?? false,
          balancedDice: state.config.balancedDice ?? false,
          inventorsMadness: state.config.inventorsMadness ?? false,
        },
        game,
      },
    });

    expect(game.state.players[targetId]?.commodities).toEqual({});
    renderGame(game.state);

    expect(
      screen.getByRole('button', { name: 'Visit Sam with Commercial Harbor' }),
    ).toHaveTextContent('2 commodities');
  });

  it('lets Master Merchant take duplicate cards on a two-card selection shelf', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Master Merchant fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find(
      (candidate) => candidate.effect === 'MASTER_MERCHANT',
    );
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    const cityVertex = Object.values(original.board.vertices)[0];
    if (card === undefined || cityVertex === undefined) {
      throw new Error('Master Merchant fixture is incomplete.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          knProgressCardIds: [],
        },
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([[RESOURCE_IDS.brick, 2]]),
        },
      },
      board: {
        ...original.board,
        vertices: {
          ...original.board.vertices,
          [cityVertex.id]: {
            ...cityVertex,
            building: { ownerId: TEST_PLAYER_IDS[1], type: 'MANSION' },
          },
        },
      },
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[0],
        purpose: 'MASTER_MERCHANT_PLAYER',
        sourceCardId: card.instanceId,
        eligibleIds: [TEST_PLAYER_IDS[1]],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [TEST_PLAYER_IDS[0]],
        canCancel: true,
        context: {},
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: {
            ...card,
            ownerId: TEST_PLAYER_IDS[0],
            playedTurn: original.turn.turnNumber,
          },
        },
      },
    };
    renderGame(state);

    await user.click(screen.getByRole('button', { name: 'Choose Sam for Master Merchant' }));
    const tray = screen.getByRole('dialog', { name: 'Choose two of Sam’s cards' });
    expect(
      within(tray).getAllByRole('button', {
        name: 'Take Brick with Master Merchant',
      }),
    ).toHaveLength(2);
    expect(within(tray).queryByText('Take from Sam')).not.toBeInTheDocument();
    await user.click(
      within(tray).getAllByRole('button', {
        name: 'Take Brick with Master Merchant',
      })[0]!,
    );
    await user.click(
      within(tray).getByRole('button', {
        name: 'Take Brick with Master Merchant',
      }),
    );
    expect(within(tray).getByLabelText('Master Merchant selected cards').children).toHaveLength(2);
    await user.click(within(tray).getByRole('button', { name: 'Confirm' }));

    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.resources[RESOURCE_IDS.brick],
    ).toBe(2);
    expect(screen.getByTestId('resource-flyovers')).toHaveTextContent(
      `PLAYER:${RESOURCE_IDS.brick}|PLAYER:${RESOURCE_IDS.brick}|`,
    );
    expect(screen.getByTestId('resource-flyover-targets')).toHaveTextContent(
      `${TEST_PLAYER_IDS[0]}|${TEST_PLAYER_IDS[0]}|`,
    );
  });

  it('shows Merchant Fleet as a resource-and-commodity choice shelf', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Merchant Fleet fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === 'MERCHANT_FLEET');
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    if (definition === undefined || card === undefined) {
      throw new Error('Merchant Fleet fixture card is missing.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          knProgressCardIds: [],
        },
      },
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[0],
        purpose: 'MERCHANT_FLEET_GOOD',
        sourceCardId: card.instanceId,
        eligibleIds: [
          RESOURCE_IDS.wood,
          RESOURCE_IDS.brick,
          RESOURCE_IDS.grain,
          RESOURCE_IDS.livestock,
          RESOURCE_IDS.ore,
          COMMODITY_IDS.paper,
          COMMODITY_IDS.cloth,
          COMMODITY_IDS.coin,
        ],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [TEST_PLAYER_IDS[0]],
        canCancel: true,
        context: {},
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: {
            ...card,
            ownerId: TEST_PLAYER_IDS[0],
            playedTurn: original.turn.turnNumber,
          },
        },
      },
    };
    renderGame(state);

    const tray = screen.getByRole('dialog', { name: 'Choose a good for Merchant Fleet' });
    expect(
      within(tray).getByRole('button', { name: 'Choose Wood for Merchant Fleet' }),
    ).toBeInTheDocument();
    await user.click(within(tray).getByRole('button', { name: 'Choose Coin for Merchant Fleet' }));
    await user.click(within(tray).getByRole('button', { name: 'Confirm' }));

    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.merchantFleetGoodId).toBe(
      COMMODITY_IDS.coin,
    );
  });

  it('keeps the turn clock running while Merchant placement is still cancellable', () => {
    vi.useFakeTimers();
    const original = knActionState();
    if (original.kn === null) throw new Error('Merchant timer fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === 'MERCHANT');
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    const hex = Object.values(original.board.hexes).find(
      (candidate) => candidate.resourceId !== null,
    );
    if (card === undefined || hex === undefined)
      throw new Error('Merchant timer fixture is incomplete.');
    renderGame(original);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText('00:55')).toBeInTheDocument();
    act(() =>
      useAppStore.setState({
        gameState: {
          ...original,
          turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
          pendingInteraction: {
            type: 'KN_SELECTION',
            playerId: TEST_PLAYER_IDS[0],
            purpose: 'MERCHANT_HEX',
            sourceCardId: card.instanceId,
            eligibleIds: [hex.id],
            minimumSelections: 1,
            maximumSelections: 1,
            queue: [TEST_PLAYER_IDS[0]],
            canCancel: true,
            context: {},
          },
        },
      }),
    );

    expect(screen.getByText('00:55')).toBeInTheDocument();
    expect(screen.getByText('Alex is taking actions')).toBeInTheDocument();
    expect(screen.getByTestId('merchant-placement')).toHaveTextContent('active');
  });

  it('shows city-loss indicators without the generic Progress Card banner', () => {
    const original = knActionState();
    const vertex = Object.values(original.board.vertices)[0];
    if (vertex === undefined) throw new Error('City-loss UI fixture has no board vertex.');
    const state: GameState = {
      ...original,
      board: {
        ...original.board,
        vertices: {
          ...original.board.vertices,
          [vertex.id]: {
            ...vertex,
            building: { ownerId: TEST_PLAYER_IDS[0], type: 'MANSION' },
          },
        },
      },
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[0],
        purpose: 'BARBARIAN_CITY_LOSS',
        eligibleIds: [vertex.id],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [TEST_PLAYER_IDS[0]],
        canCancel: false,
        context: {},
      },
    };

    const view = renderGame(state);
    expect(screen.getByRole('button', { name: `Select VERTEX ${vertex.id}` })).toBeInTheDocument();
    expect(screen.getByText('Alex is choosing a City to lose')).toBeInTheDocument();
    expect(view.container.querySelector('.kn-board-choice-banner')).toBeNull();
  });

  it('returns an excess Progress Card through the same hand-and-shelf flow', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Progress discard fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === 'CRANE');
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    if (definition === undefined || card === undefined) {
      throw new Error('Progress discard fixture card is missing.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          knProgressCardIds: [card.instanceId],
        },
      },
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[1],
        purpose: 'PROGRESS_DISCARD',
        eligibleIds: [card.instanceId],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [TEST_PLAYER_IDS[1]],
        canCancel: false,
        context: {},
      },
      kn: {
        ...original.kn,
        progressDecks: {
          ...original.kn.progressDecks,
          [definition.family]: original.kn.progressDecks[definition.family].filter(
            (id) => id !== card.instanceId,
          ),
        },
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: { ...card, ownerId: TEST_PLAYER_IDS[1] },
        },
      },
    };
    renderGame(state);

    const tray = screen.getByRole('dialog', { name: 'Return a Progress Card' });
    expect(document.querySelector('.progress-tray header small')).toBeNull();
    await user.click(
      screen.getByRole('button', { name: `Select ${definition.displayName} for return` }),
    );
    expect(
      within(tray).getByRole('button', {
        name: `Return ${definition.displayName} to your hand`,
      }),
    ).toBeInTheDocument();
    await user.click(within(tray).getByRole('button', { name: 'Confirm' }));

    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[1]]?.knProgressCardIds,
    ).not.toContain(card.instanceId);
  });

  it('lets a Wedding victim move duplicate hand cards into a confirmed gift shelf', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Wedding fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === 'WEDDING');
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    if (definition === undefined || card === undefined) {
      throw new Error('Wedding fixture card is missing.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([]),
          knProgressCardIds: [],
        },
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 2]]),
        },
      },
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[1],
        purpose: 'WEDDING_CARDS',
        sourceCardId: card.instanceId,
        eligibleIds: [RESOURCE_IDS.wood],
        minimumSelections: 2,
        maximumSelections: 2,
        queue: [TEST_PLAYER_IDS[1]],
        canCancel: false,
        context: { activePlayerId: TEST_PLAYER_IDS[0] },
      },
      kn: {
        ...original.kn,
        progressDecks: {
          ...original.kn.progressDecks,
          [definition.family]: original.kn.progressDecks[definition.family].filter(
            (id) => id !== card.instanceId,
          ),
        },
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: {
            ...card,
            ownerId: TEST_PLAYER_IDS[0],
            playedTurn: original.turn.turnNumber,
          },
        },
      },
    };
    renderGame(state);

    const tray = screen.getByRole('dialog', {
      name: 'Sam, choose Wedding cards to give',
    });
    await user.click(
      screen.getByRole('button', { name: 'Select Wood for Wedding. 2 cards available' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Select Wood for Wedding. 1 card available' }),
    );
    expect(within(tray).getByLabelText('Wedding selected cards').children).toHaveLength(2);
    await user.click(within(tray).getByRole('button', { name: 'Confirm' }));

    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.resources[RESOURCE_IDS.wood],
    ).toBe(2);
    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[1]]?.resources[RESOURCE_IDS.wood],
    ).toBe(0);
    expect(screen.getByTestId('resource-flyovers')).toHaveTextContent('PLAYER:wood|PLAYER:wood|');
    expect(screen.getByTestId('resource-flyover-targets')).toHaveTextContent(
      `${TEST_PLAYER_IDS[0]}|${TEST_PLAYER_IDS[0]}|`,
    );
  });

  it('lets a Saboteur victim discard directly from their hand into a confirmed shelf', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Saboteur fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === 'SABOTEUR');
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    if (definition === undefined || card === undefined) {
      throw new Error('Saboteur fixture card is missing.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([[RESOURCE_IDS.brick, 2]]),
        },
      },
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[1],
        purpose: 'SABOTEUR_DISCARD',
        sourceCardId: card.instanceId,
        eligibleIds: [RESOURCE_IDS.brick],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [TEST_PLAYER_IDS[1]],
        canCancel: false,
        context: { activePlayerId: TEST_PLAYER_IDS[0] },
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: {
            ...card,
            ownerId: TEST_PLAYER_IDS[0],
            playedTurn: original.turn.turnNumber,
          },
        },
      },
    };
    renderGame(state);

    const tray = screen.getByRole('dialog', { name: 'Sam, discard cards for Saboteur' });
    expect(within(tray).getByText('0/1 selected')).toBeInTheDocument();
    expect(within(tray).getByText('1 card left')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Select Brick for Saboteur. 2 cards available' }),
    );
    expect(within(tray).getByLabelText('Saboteur selected cards').children).toHaveLength(1);
    expect(within(tray).getByText('1/1 selected')).toBeInTheDocument();
    expect(within(tray).getByText('Ready to confirm')).toBeInTheDocument();
    await user.click(within(tray).getByRole('button', { name: 'Return Brick to the hand' }));
    expect(within(tray).getByText('0/1 selected')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Select Brick for Saboteur. 2 cards available' }),
    );
    await user.click(within(tray).getByRole('button', { name: 'Confirm' }));

    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[1]]?.resources[RESOURCE_IDS.brick],
    ).toBe(1);
    expect(screen.getByTestId('resource-flyovers')).toHaveTextContent(
      `PLAYER:${RESOURCE_IDS.brick}|`,
    );
    expect(screen.getByTestId('resource-flyover-targets')).toHaveTextContent('BANK|');
  });

  it('confirms Alchemist activation before showing two rows of dice and rolling', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Alchemist fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === 'ALCHEMIST');
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    const otherDefinition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === 'CRANE');
    const otherCard = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === otherDefinition?.id,
    );
    if (
      definition === undefined ||
      card === undefined ||
      otherDefinition === undefined ||
      otherCard === undefined
    ) {
      throw new Error('Alchemist fixture card is missing.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          knProgressCardIds: [card.instanceId, otherCard.instanceId],
        },
      },
      turn: { ...original.turn, phase: 'WAITING_FOR_ROLL', dice: null },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: { ...card, ownerId: TEST_PLAYER_IDS[0] },
          [otherCard.instanceId]: { ...otherCard, ownerId: TEST_PLAYER_IDS[0] },
        },
      },
    };
    renderGame(state);

    const alchemistCard = screen.getByRole('button', { name: 'Play Alchemist' });
    await user.click(alchemistCard);
    await user.unhover(alchemistCard);
    const confirmation = screen.getByRole('dialog', { name: 'Alchemist' });
    expect(confirmation).toHaveClass('progress-card-tooltip--confirming');
    expect(confirmation).toHaveTextContent(definition.description);
    expect(within(confirmation).queryByRole('combobox')).toBeNull();
    await user.hover(screen.getByRole('button', { name: `Play ${otherDefinition.displayName}` }));
    expect(screen.getByRole('dialog', { name: 'Alchemist' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip', { name: otherDefinition.displayName })).toBeNull();
    await user.unhover(screen.getByRole('button', { name: `Play ${otherDefinition.displayName}` }));
    expect(screen.getByRole('dialog', { name: 'Alchemist' })).toBeInTheDocument();
    await user.click(alchemistCard);
    const cancelledTooltip = screen.getByRole('tooltip', { name: 'Alchemist' });
    expect(within(cancelledTooltip).queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(within(cancelledTooltip).queryByRole('button', { name: 'Play Alchemist' })).toBeNull();

    await user.click(alchemistCard);
    await user.click(
      within(screen.getByRole('dialog', { name: 'Alchemist' })).getByRole('button', {
        name: 'Play Alchemist',
      }),
    );

    const tray = screen.getByRole('dialog', { name: 'Set the Alchemist dice' });
    expect(within(tray).getAllByRole('button', { name: /Choose white die/ })).toHaveLength(6);
    expect(within(tray).getAllByRole('button', { name: /Choose red die/ })).toHaveLength(6);
    const confirm = within(tray).getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    await user.click(within(tray).getByRole('button', { name: 'Choose white die 3' }));
    await user.click(within(tray).getByRole('button', { name: 'Choose red die 5' }));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(useAppStore.getState().gameState?.turn.dice).toEqual([5, 3]);
  });

  it('moves Deserter from its player shelf to glowing opponent Knights on the board', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Deserter fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === 'DESERTER');
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    const edge = Object.values(original.board.edges)[0];
    const vertex = edge === undefined ? undefined : original.board.vertices[edge.vertexBId];
    if (
      definition === undefined ||
      card === undefined ||
      edge === undefined ||
      vertex === undefined
    ) {
      throw new Error('Deserter fixture is incomplete.');
    }
    const knight = {
      id: knightId('deserter-target'),
      ownerId: TEST_PLAYER_IDS[1],
      vertexId: vertex.id,
      level: 1 as const,
      active: false,
      placedTurn: 1,
      activeSinceTurn: null,
      lastActionTurn: null,
      upgradedTurn: null,
    };
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          knProgressCardIds: [],
        },
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          knights: [knight],
        },
      },
      board: {
        ...original.board,
        edges: {
          ...original.board.edges,
          [edge.id]: { ...edge, roadOwnerId: TEST_PLAYER_IDS[0] },
        },
        vertices: {
          ...original.board.vertices,
          [vertex.id]: { ...vertex, knightId: knight.id },
        },
      },
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[0],
        purpose: 'DESERTER_PLAYER',
        sourceCardId: card.instanceId,
        eligibleIds: [TEST_PLAYER_IDS[1]],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [TEST_PLAYER_IDS[0]],
        canCancel: true,
        context: { activePlayerId: TEST_PLAYER_IDS[0] },
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: {
            ...card,
            ownerId: TEST_PLAYER_IDS[0],
            playedTurn: original.turn.turnNumber,
          },
        },
      },
    };
    renderGame(state);

    await user.click(screen.getByRole('button', { name: 'Choose Sam for Deserter' }));
    expect(screen.queryByRole('dialog', { name: 'Choose a player for Deserter' })).toBeNull();
    await user.click(screen.getByRole('button', { name: `Select VERTEX ${vertex.id}` }));

    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[1]]?.knights).toHaveLength(0);
    expect(useAppStore.getState().gameState?.pendingInteraction).toMatchObject({
      purpose: 'DESERTER_PLACE_KNIGHT',
      canCancel: false,
    });
    expect(screen.queryByRole('button', { name: 'Cancel card' })).toBeNull();
  });

  it('plays Inventor directly, keeps its first token highlighted, and reports the swap animation', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Inventor fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === 'INVENTOR');
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    const eligibleHexes = Object.values(original.board.hexes).filter(
      (hex) => hex.numberToken !== null && ![2, 6, 8, 12].includes(hex.numberToken),
    );
    const firstHex = eligibleHexes[0];
    const secondHex = eligibleHexes[1];
    const replacementFirstHex = eligibleHexes[2];
    if (
      definition === undefined ||
      card === undefined ||
      firstHex === undefined ||
      secondHex === undefined ||
      replacementFirstHex === undefined
    ) {
      throw new Error('Inventor fixture is incomplete.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          knProgressCardIds: [card.instanceId],
        },
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: { ...card, ownerId: TEST_PLAYER_IDS[0] },
        },
      },
    };
    renderGame(state);

    await user.click(screen.getByRole('button', { name: 'Play Inventor' }));
    expect(screen.queryByRole('dialog', { name: 'Inventor' })).toBeNull();
    expect(screen.getByTestId('inventor-selection')).toHaveTextContent('active:none');
    await user.click(screen.getByRole('button', { name: `Select HEX ${firstHex.id}` }));
    expect(screen.getByTestId('inventor-selection')).toHaveTextContent(`active:${firstHex.id}`);
    expect(screen.getByRole('button', { name: 'Cancel Inventor' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel Inventor' }));
    expect(useAppStore.getState().gameState?.pendingInteraction).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Play Inventor' }));
    await user.click(screen.getByRole('button', { name: `Select HEX ${firstHex.id}` }));
    await user.click(screen.getByRole('button', { name: `Select HEX ${secondHex.id}` }));

    expect(screen.getByTestId('inventor-pending')).toHaveTextContent(secondHex.id);
    expect(useAppStore.getState().gameState?.pendingInteraction).toMatchObject({
      purpose: 'INVENTOR_SECOND_TOKEN',
    });
    expect(screen.getByTestId('number-token-swap')).toHaveTextContent('');
    await user.click(screen.getByRole('button', { name: `Select HEX ${firstHex.id}` }));
    expect(screen.getByTestId('inventor-selection')).toHaveTextContent('active:none');
    expect(screen.getByRole('button', { name: 'Confirm number swap' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: `Select HEX ${replacementFirstHex.id}` }));
    expect(screen.getByTestId('inventor-selection')).toHaveTextContent(
      `active:${replacementFirstHex.id}`,
    );
    await user.click(screen.getByRole('button', { name: 'Confirm number swap' }));

    expect(screen.getByTestId('number-token-swap')).toHaveTextContent(
      `${replacementFirstHex.id}|${secondHex.id}`,
    );
    expect(useAppStore.getState().gameState?.pendingInteraction).toBeNull();

    const diceEvent: GameEvent = {
      type: 'DICE_ROLLED',
      playerId: TEST_PLAYER_IDS[0],
      dice: [3, 4],
    };
    act(() => {
      useAppStore.setState((current) => ({
        recentGameEvents: [diceEvent],
        gameEventHistory: [...current.gameEventHistory, diceEvent],
      }));
    });
    expect(screen.getByTestId('number-token-swap')).toHaveTextContent(
      `${replacementFirstHex.id}|${secondHex.id}`,
    );
  });

  it('does not replay a completed Inventor animation when bounded event history shifts', async () => {
    vi.useFakeTimers();
    const state = knActionState();
    if (state.kn === null) throw new Error('Inventor animation fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === 'INVENTOR');
    const card = Object.values(state.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    const eligibleHexes = Object.values(state.board.hexes).filter(
      (hex) => hex.numberToken !== null && ![2, 6, 8, 12].includes(hex.numberToken),
    );
    const firstHex = eligibleHexes[0];
    const secondHex = eligibleHexes[1];
    if (
      definition === undefined ||
      card === undefined ||
      firstHex === undefined ||
      secondHex === undefined
    ) {
      throw new Error('Inventor animation fixture is incomplete.');
    }
    const swapEvent: GameEvent = {
      type: 'KN_PROGRESS_CARD_RESOLVED',
      playerId: TEST_PLAYER_IDS[0],
      cardInstanceId: card.instanceId,
      cardDefinitionId: definition.id,
      targetIds: [firstHex.id, secondHex.id],
    };
    const fillerEvent: GameEvent = {
      type: 'DICE_ROLLED',
      playerId: TEST_PLAYER_IDS[0],
      dice: [3, 4],
    };
    const fullHistory = [swapEvent, ...Array<GameEvent>(99).fill(fillerEvent)];
    renderGame(state, fullHistory);

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByTestId('number-token-swap')).toHaveTextContent(
      `${firstHex.id}|${secondHex.id}`,
    );

    await act(() => vi.advanceTimersByTimeAsync(500));

    act(() => {
      useAppStore.setState((current) => ({
        recentGameEvents: [fillerEvent],
        gameEventHistory: [...current.gameEventHistory, fillerEvent].slice(-100),
      }));
    });
    await act(() => vi.advanceTimersByTimeAsync(1_850));

    expect(screen.getByTestId('number-token-swap')).toHaveTextContent('');

    act(() => {
      useAppStore.setState({
        recentGameEvents: [swapEvent],
        gameEventHistory: [swapEvent],
      });
    });
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByTestId('number-token-swap')).toHaveTextContent('');
  });

  it('lets Reclamation be cancelled from its hand card before or after choosing a tile', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Reclamation fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === 'RECLAMATION');
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    const targetHex = Object.values(original.board.hexes).find(
      (hex) =>
        hex.resourceId !== null &&
        hex.id !== original.board.robberHexId &&
        hex.numberToken !== 6 &&
        hex.numberToken !== 8,
    );
    if (definition === undefined || card === undefined || targetHex === undefined) {
      throw new Error('Reclamation fixture is incomplete.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          knProgressCardIds: [card.instanceId],
        },
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: { ...card, ownerId: TEST_PLAYER_IDS[0] },
        },
      },
    };
    renderGame(state);

    await user.click(screen.getByRole('button', { name: 'Play Reclamation' }));
    expect(screen.getByRole('button', { name: 'Cancel Reclamation' })).toBeInTheDocument();
    expect(document.querySelector('.turn-timer-prompt')).toHaveTextContent(
      'Alex is taking actions',
    );
    expect(
      within(screen.getByLabelText('Alex, player 1')).getByText('Taking actions'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: `Select HEX ${targetHex.id}` }));
    expect(useAppStore.getState().gameState?.pendingInteraction).toMatchObject({
      purpose: 'RECLAMATION_RESOURCE',
      canCancel: true,
    });
    expect(document.querySelector('.turn-timer-prompt')).toHaveTextContent(
      'Alex is taking actions',
    );
    expect(
      within(screen.getByLabelText('Alex, player 1')).getByText('Taking actions'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel Reclamation' }));

    expect(useAppStore.getState().gameState?.pendingInteraction).toBeNull();
    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.knProgressCardIds,
    ).toContain(card.instanceId);
    expect(screen.getByRole('button', { name: 'Play Reclamation' })).toBeInTheDocument();
  });

  it('keeps renderer highlight inputs stable while the map inspector follows hover', async () => {
    const user = userEvent.setup();
    renderGame(knActionState());
    const beforeHover = boardRenderProbe.emphasizedVertexRefs.at(-1);

    await user.hover(screen.getByRole('button', { name: 'Inspect map' }));

    expect(boardRenderProbe.emphasizedVertexRefs.at(-1)).toBe(beforeHover);
  });

  it('highlights and counts the legal road chain passing through a hovered road', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    const roadPath = findBoardEdgePath(original.board, 3);
    const roadIds = new Set(roadPath);
    const state: GameState = {
      ...original,
      board: {
        ...original.board,
        edges: Object.fromEntries(
          Object.values(original.board.edges).map((edge) => [
            edge.id,
            roadIds.has(edge.id) ? { ...edge, roadOwnerId: TEST_PLAYER_IDS[0] } : edge,
          ]),
        ),
      },
    };
    renderGame(state);
    const inspectRoad = screen.getByRole('button', { name: /Inspect road/ });

    await user.hover(inspectRoad);

    expect(
      screen.getByRole('status', { name: 'Alex’s road chain has 3 roads' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('emphasized-road-chain').textContent?.split('|')).toEqual(
      expect.arrayContaining([...roadPath]),
    );
    expect(document.querySelector('.board-inspector')).toHaveTextContent(
      'Alex’s road chain · 3 roads',
    );

    await user.unhover(inspectRoad);
    expect(screen.queryByRole('status', { name: /road chain has/i })).not.toBeInTheDocument();
  });

  it('exposes a developer button that grants one of every K+N Progress Card', async () => {
    const user = userEvent.setup();
    renderGame(knActionState());

    await user.click(
      screen.getByRole('button', {
        name: 'Give the active player one of every Progress Card',
      }),
    );

    const gameState = useAppStore.getState().gameState;
    const player = gameState?.players[TEST_PLAYER_IDS[0]];
    expect(
      (player?.knProgressCardIds.length ?? 0) + (player?.revealedKNProgressCardIds.length ?? 0),
    ).toBe(KN_PROGRESS_CARDS.length);
  });

  it('lets the party leader pause the table and is the only resume control shown', async () => {
    const user = userEvent.setup();
    renderGame(knActionState());

    await user.click(screen.getByRole('button', { name: 'Pause match' }));
    const paused = screen.getByRole('dialog', { name: 'The table is on hold' });
    expect(paused).toHaveTextContent('Only the party leader may continue');
    expect(useAppStore.getState().gamePaused).toBe(true);
    expect(within(paused).getAllByRole('button')).toHaveLength(1);
    await user.click(within(paused).getByRole('button', { name: 'Unpause match' }));

    expect(screen.queryByRole('dialog', { name: 'The table is on hold' })).toBeNull();
    expect(useAppStore.getState().gamePaused).toBe(false);
  });

  it('adds the robber attention cue while Bishop is choosing its destination', () => {
    const original = knActionState();
    const destination = Object.values(original.board.hexes).find(
      (hex) => hex.id !== original.board.robberHexId,
    );
    if (destination === undefined) throw new Error('Bishop fixture has no destination.');
    renderGame({
      ...original,
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[0],
        purpose: 'BISHOP_HEX',
        eligibleIds: [destination.id],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [TEST_PLAYER_IDS[0]],
        canCancel: true,
        context: {},
      },
    });

    expect(boardRenderProbe.robberAttention.at(-1)).toBe(true);
  });

  it('shows and dismisses a Longest Road HUD achievement', async () => {
    vi.useFakeTimers();
    const state = knActionState();
    renderGame(state, [{ type: 'LONGEST_ROAD_CHANGED', playerId: TEST_PLAYER_IDS[0] }]);

    const notice = screen.getByText('Longest Road').closest('.longest-road-notice');
    expect(notice).toHaveTextContent('Alex takes the route');
    await act(() => vi.advanceTimersByTime(3_400));
    expect(document.querySelector('.longest-road-notice')).toBeNull();
  });

  it('uses the two-step Spy tray and animates the chosen Progress Card into the hand', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Spy fixture has no K+N state.');
    const spyDefinition = KN_PROGRESS_CARDS.find((definition) => definition.effect === 'SPY');
    const victimDefinition = KN_PROGRESS_CARDS.find((definition) => definition.effect === 'CRANE');
    const spyCard = Object.values(original.kn.progressCards).find(
      (card) => card.definitionId === spyDefinition?.id,
    );
    const victimCard = Object.values(original.kn.progressCards).find(
      (card) => card.definitionId === victimDefinition?.id,
    );
    if (
      spyDefinition === undefined ||
      victimDefinition === undefined ||
      spyCard === undefined ||
      victimCard === undefined
    ) {
      throw new Error('Spy fixture cards are missing.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          knProgressCardIds: [victimCard.instanceId],
        },
      },
      turn: { ...original.turn, phase: 'CARD_RESOLUTION' },
      pendingInteraction: {
        type: 'KN_SELECTION',
        playerId: TEST_PLAYER_IDS[0],
        purpose: 'SPY_PLAYER',
        sourceCardId: spyCard.instanceId,
        eligibleIds: [TEST_PLAYER_IDS[1]],
        minimumSelections: 1,
        maximumSelections: 1,
        queue: [TEST_PLAYER_IDS[0]],
        canCancel: true,
        context: {},
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [spyCard.instanceId]: {
            ...spyCard,
            ownerId: TEST_PLAYER_IDS[0],
            playedTurn: original.turn.turnNumber,
          },
          [victimCard.instanceId]: { ...victimCard, ownerId: TEST_PLAYER_IDS[1] },
        },
      },
    };
    renderGame(state);

    const playerTray = screen.getByRole('dialog', { name: 'Choose a player to spy on' });
    await user.click(within(playerTray).getByRole('button', { name: /Spy on Sam/ }));
    const cardTray = screen.getByRole('dialog', {
      name: 'Choose one of Sam’s Progress Cards',
    });
    const cardChoice = within(cardTray).getByRole('button', {
      name: `Choose ${victimDefinition.displayName} to steal`,
    });
    await user.hover(cardChoice);
    const tooltip = screen.getByRole('tooltip', { name: victimDefinition.displayName });
    expect(tooltip).toHaveTextContent(victimDefinition.description);
    expect(cardChoice).toHaveAttribute('aria-describedby', tooltip.id);
    await user.unhover(cardChoice);
    expect(screen.queryByRole('tooltip', { name: victimDefinition.displayName })).toBeNull();
    await user.click(cardChoice);
    await user.click(within(cardTray).getByRole('button', { name: 'Confirm' }));

    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.knProgressCardIds,
    ).toContain(victimCard.instanceId);
    expect(screen.getByTestId('progress-card-flyovers')).toHaveTextContent(
      `${TEST_PLAYER_IDS[1]}:${victimDefinition.id}|`,
    );
  });

  it('shows the Spy card transfer animation to both the losing and gaining players', () => {
    const original = knActionState();
    if (original.kn === null) throw new Error('Spy animation fixture has no K+N state.');
    const spyDefinition = KN_PROGRESS_CARDS.find((definition) => definition.effect === 'SPY');
    const stolenCard = Object.values(original.kn.progressCards).find(
      (card) =>
        KN_PROGRESS_CARDS.find((definition) => definition.id === card.definitionId)?.effect ===
        'CRANE',
    );
    if (spyDefinition === undefined || stolenCard === undefined) {
      throw new Error('Spy animation fixture cards are missing.');
    }
    const actorId = TEST_PLAYER_IDS[0];
    const victimId = TEST_PLAYER_IDS[1];
    const postTransferState: GameState = {
      ...original,
      players: {
        ...original.players,
        [actorId]: {
          ...original.players[actorId]!,
          knProgressCardIds: [
            ...original.players[actorId]!.knProgressCardIds.filter(
              (cardId) => cardId !== stolenCard.instanceId,
            ),
            stolenCard.instanceId,
          ],
        },
        [victimId]: {
          ...original.players[victimId]!,
          knProgressCardIds: original.players[victimId]!.knProgressCardIds.filter(
            (cardId) => cardId !== stolenCard.instanceId,
          ),
        },
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [stolenCard.instanceId]: { ...stolenCard, ownerId: actorId },
        },
      },
    };
    const event: GameEvent = {
      type: 'KN_PROGRESS_CARD_RESOLVED',
      playerId: actorId,
      cardInstanceId: original.players[actorId]!.knProgressCardIds[0]!,
      cardDefinitionId: spyDefinition.id,
      targetIds: [victimId, stolenCard.instanceId],
    };

    const renderOnlineViewer = (viewerId: (typeof TEST_PLAYER_IDS)[number]) => {
      const game = createOnlineGameView(
        postTransferState,
        viewerId,
        2,
        [event],
        [event],
        false,
        false,
        null,
        null,
      );
      useOnlineStore.setState({
        connection: 'CONNECTED',
        credentials: { roomCode: 'SPY234', playerId: viewerId, resumeToken: 's'.repeat(32) },
        room: {
          protocolVersion: 1,
          code: 'SPY234',
          phase: 'PLAYING',
          viewerPlayerId: viewerId,
          hostPlayerId: actorId,
          players: postTransferState.config.players.map((player) => ({
            id: player.id,
            name: player.name,
            colorId: player.colorId,
            connected: true,
            ready: true,
            host: player.id === actorId,
          })),
          settings: {
            mapId: postTransferState.config.mapId,
            modeId: postTransferState.config.modeId,
            size: 2,
            seed: postTransferState.config.seed,
            turnTimeSeconds: postTransferState.config.turnTimeSeconds ?? 60,
            victoryTarget: postTransferState.config.victoryTarget,
            discardThreshold: postTransferState.config.rules.discardThreshold,
            hideBankCards: postTransferState.config.hideBankCards ?? false,
            friendlyRobber: postTransferState.config.friendlyRobber ?? false,
            balancedDice: postTransferState.config.balancedDice ?? false,
            inventorsMadness: postTransferState.config.inventorsMadness ?? false,
          },
          game,
        },
      });
      return renderGame(game.state, game.recentEvents);
    };

    renderOnlineViewer(actorId);
    expect(screen.getByTestId('progress-card-flyovers')).toHaveTextContent(
      `${victimId}:${stolenCard.definitionId}|`,
    );

    cleanup();
    resetOnlineStoreForTests();
    resetAppStoreForTests();
    renderOnlineViewer(victimId);
    expect(screen.getByTestId('progress-card-flyovers')).toHaveTextContent(
      `${victimId}:${stolenCard.definitionId}|`,
    );
  });

  it('plays Medicine directly as a board mode and cancels by clicking the card again', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Medicine fixture has no K+N state.');
    const medicineDefinition = KN_PROGRESS_CARDS.find(
      (definition) => definition.effect === 'MEDICINE',
    );
    const medicineCard = Object.values(original.kn.progressCards).find(
      (card) => card.definitionId === medicineDefinition?.id,
    );
    const houseVertex = Object.values(original.board.vertices)[0];
    if (medicineCard === undefined || houseVertex === undefined) {
      throw new Error('Medicine fixture is incomplete.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([
            [RESOURCE_IDS.ore, 2],
            [RESOURCE_IDS.grain, 1],
          ]),
          knProgressCardIds: [medicineCard.instanceId],
        },
      },
      board: {
        ...original.board,
        vertices: {
          ...original.board.vertices,
          [houseVertex.id]: {
            ...houseVertex,
            building: { ownerId: TEST_PLAYER_IDS[0], type: 'HOUSE' },
          },
        },
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [medicineCard.instanceId]: { ...medicineCard, ownerId: TEST_PLAYER_IDS[0] },
        },
      },
    };
    renderGame(state);

    await user.click(screen.getByRole('button', { name: 'Play Medicine' }));
    expect(screen.queryByRole('dialog', { name: 'Medicine' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel Medicine' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Select VERTEX ${houseVertex.id}` }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel Medicine' }));
    expect(useAppStore.getState().gameState?.pendingInteraction).toBeNull();
    expect(screen.getByRole('button', { name: 'Play Medicine' })).toBeInTheDocument();
  });

  it('plays Smith directly on glowing Knights and locks cancellation after the first upgrade', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Smith fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === 'SMITH');
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    const [firstVertex, secondVertex] = Object.values(original.board.vertices);
    if (card === undefined || firstVertex === undefined || secondVertex === undefined) {
      throw new Error('Smith fixture is incomplete.');
    }
    const firstKnight = {
      id: knightId('smith-first'),
      ownerId: TEST_PLAYER_IDS[0],
      vertexId: firstVertex.id,
      level: 1 as const,
      active: false,
      placedTurn: 1,
      activeSinceTurn: null,
      lastActionTurn: null,
      upgradedTurn: null,
    };
    const secondKnight = {
      ...firstKnight,
      id: knightId('smith-second'),
      vertexId: secondVertex.id,
    };
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          knights: [firstKnight, secondKnight],
          knProgressCardIds: [card.instanceId],
        },
      },
      board: {
        ...original.board,
        vertices: {
          ...original.board.vertices,
          [firstVertex.id]: { ...firstVertex, knightId: firstKnight.id },
          [secondVertex.id]: { ...secondVertex, knightId: secondKnight.id },
        },
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: { ...card, ownerId: TEST_PLAYER_IDS[0] },
        },
      },
    };
    renderGame(state);

    await user.click(screen.getByRole('button', { name: 'Play Smith' }));
    expect(screen.queryByRole('dialog', { name: 'Smith' })).toBeNull();
    await user.click(screen.getByRole('button', { name: `Select VERTEX ${firstVertex.id}` }));
    expect(useAppStore.getState().gameState?.pendingInteraction).toMatchObject({
      purpose: 'SMITH_KNIGHT',
      canCancel: false,
    });
    expect(screen.getByRole('button', { name: 'Resolving Smith' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: `Select VERTEX ${secondVertex.id}` }));

    expect(useAppStore.getState().gameState?.pendingInteraction).toBeNull();
    expect(
      useAppStore
        .getState()
        .gameState?.players[TEST_PLAYER_IDS[0]]?.knights.map((knight) => knight.level),
    ).toEqual([2, 2]);
  });

  it('warns when Medicine has no eligible House and opens City Wall buying from the City', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Wall fixture has no K+N state.');
    const medicineDefinition = KN_PROGRESS_CARDS.find(
      (definition) => definition.effect === 'MEDICINE',
    );
    const medicineCard = Object.values(original.kn.progressCards).find(
      (card) => card.definitionId === medicineDefinition?.id,
    );
    const cityVertex = Object.values(original.board.vertices)[0];
    if (medicineCard === undefined || cityVertex === undefined) {
      throw new Error('Wall fixture is incomplete.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([
            [RESOURCE_IDS.brick, 2],
            [RESOURCE_IDS.ore, 2],
            [RESOURCE_IDS.grain, 1],
          ]),
          knProgressCardIds: [medicineCard.instanceId],
        },
      },
      board: {
        ...original.board,
        vertices: {
          ...original.board.vertices,
          [cityVertex.id]: {
            ...cityVertex,
            building: { ownerId: TEST_PLAYER_IDS[0], type: 'MANSION', hasWall: false },
          },
        },
      },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [medicineCard.instanceId]: { ...medicineCard, ownerId: TEST_PLAYER_IDS[0] },
        },
      },
    };
    renderGame(state);

    await user.click(screen.getByRole('button', { name: 'Play Medicine' }));
    expect(screen.getByText(/Medicine needs one of your Houses/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Select VERTEX ${cityVertex.id}` }));
    const wallMenu = screen.getByRole('dialog', { name: 'Build City Wall' });
    await user.click(within(wallMenu).getByRole('button', { name: 'Build City Wall' }));
    expect(useAppStore.getState().gameState?.board.vertices[cityVertex.id]?.building?.hasWall).toBe(
      true,
    );
  });

  it('keeps dice and robber countdowns silent and honors the timer-sound setting', async () => {
    vi.useFakeTimers();
    const tick = vi.spyOn(audioManager, 'playTimerTick');
    const original = knActionState();

    renderGame({
      ...original,
      turn: { ...original.turn, phase: 'WAITING_FOR_ROLL', dice: null },
    });
    await act(() => vi.advanceTimersByTime(1_000));
    expect(tick).not.toHaveBeenCalled();

    cleanup();
    renderGame({
      ...original,
      turn: { ...original.turn, phase: 'MOVE_ROBBER' },
    });
    await act(() => vi.advanceTimersByTime(10_000));
    expect(tick).not.toHaveBeenCalled();

    cleanup();
    useAppStore.setState((store) => ({
      settings: { ...store.settings, timerSounds: false },
    }));
    renderGame({
      ...original,
      config: { ...original.config, turnTimeSeconds: 20 },
    });
    await act(() => vi.advanceTimersByTime(10_000));
    expect(tick).not.toHaveBeenCalled();

    cleanup();
    useAppStore.setState((store) => ({
      settings: { ...store.settings, timerSounds: true },
    }));
    renderGame({
      ...original,
      config: { ...original.config, turnTimeSeconds: 20 },
    });
    await act(() => vi.advanceTimersByTime(10_000));
    expect(tick).toHaveBeenCalled();
  });

  it('returns from a completed action with twenty seconds instead of a fresh full timer', () => {
    const original = knActionState();
    renderGame({ ...original, config: { ...original.config, turnTimeSeconds: 60 } }, [
      {
        type: 'ROAD_BUILT',
        playerId: TEST_PLAYER_IDS[0],
        edgeId: edgeId('completed-action-timer-floor'),
      },
    ]);

    expect(
      screen.getByLabelText('Alex is taking actions: 20 seconds remaining'),
    ).toBeInTheDocument();
  });

  it('plays urgent online timer beeps only for the player responsible for the timer', async () => {
    vi.useFakeTimers();
    const tick = vi.spyOn(audioManager, 'playTimerTick');
    const original = {
      ...knActionState(),
      config: { ...knActionState().config, turnTimeSeconds: 20 },
    };
    useOnlineStore.setState({
      connection: 'CONNECTED',
      credentials: {
        roomCode: 'ABC234',
        playerId: TEST_PLAYER_IDS[1],
        resumeToken: 'x'.repeat(32),
      },
      room: {
        protocolVersion: 1,
        code: 'ABC234',
        phase: 'PLAYING',
        viewerPlayerId: TEST_PLAYER_IDS[1],
        hostPlayerId: TEST_PLAYER_IDS[0],
        players: original.config.players.map((player) => ({
          id: player.id,
          name: player.name,
          colorId: player.colorId,
          connected: true,
          ready: true,
          host: player.id === TEST_PLAYER_IDS[0],
        })),
        settings: {
          mapId: original.config.mapId,
          modeId: original.config.modeId,
          size: 2,
          seed: original.config.seed,
          turnTimeSeconds: 20,
          victoryTarget: original.config.victoryTarget,
          discardThreshold: original.config.rules.discardThreshold,
          hideBankCards: original.config.hideBankCards ?? false,
          friendlyRobber: original.config.friendlyRobber ?? false,
          balancedDice: original.config.balancedDice ?? false,
          inventorsMadness: original.config.inventorsMadness ?? false,
        },
        game: {
          revision: 1,
          state: original,
          recentEvents: [],
          eventHistory: [],
          paused: false,
          debugMode: false,
          deadlineAt: Date.now() + 20_000,
          tradeDeadlineAt: null,
          playerCards: {},
        },
      },
    });
    renderGame(original);

    await act(() => vi.advanceTimersByTime(10_000));
    expect(tick).not.toHaveBeenCalled();
  });

  it('returns an online match to its existing lobby without leaving the room', async () => {
    const user = userEvent.setup();
    const state = knActionState();
    const settings = {
      mapId: state.config.mapId,
      modeId: state.config.modeId,
      size: 2 as const,
      seed: state.config.seed,
      turnTimeSeconds: state.config.turnTimeSeconds ?? 60,
      victoryTarget: state.config.victoryTarget,
      discardThreshold: state.config.rules.discardThreshold,
      hideBankCards: state.config.hideBankCards ?? false,
      friendlyRobber: state.config.friendlyRobber ?? false,
      balancedDice: state.config.balancedDice ?? false,
      inventorsMadness: state.config.inventorsMadness ?? false,
    };
    const players = state.config.players.map((player) => ({
      id: player.id,
      name: player.name,
      colorId: player.colorId,
      connected: true,
      ready: true,
      host: player.id === TEST_PLAYER_IDS[0],
    }));
    const originalLeaveRoom = useOnlineStore.getState().leaveRoom;
    const originalReturnToLobby = useOnlineStore.getState().returnToLobby;
    const playingRoom = {
      protocolVersion: 1 as const,
      code: 'BACK24',
      phase: 'PLAYING' as const,
      viewerPlayerId: TEST_PLAYER_IDS[0],
      hostPlayerId: TEST_PLAYER_IDS[0],
      players,
      settings,
      game: createOnlineGameView(state, TEST_PLAYER_IDS[0], 3, [], [], false, false, null, null),
    };
    const leaveRoom = vi.fn(() => Promise.resolve());
    const returnToLobby = vi.fn(() => {
      useOnlineStore.setState({
        room: { ...playingRoom, phase: 'LOBBY', game: null },
        commandPending: false,
      });
      useAppStore.setState({ gameState: null, recentGameEvents: [], gameEventHistory: [] });
      return Promise.resolve(true);
    });
    useOnlineStore.setState({
      connection: 'CONNECTED',
      credentials: {
        roomCode: playingRoom.code,
        playerId: TEST_PLAYER_IDS[0],
        resumeToken: 'b'.repeat(32),
      },
      room: playingRoom,
      leaveRoom,
      returnToLobby,
    });
    renderGame(state);

    await user.click(screen.getByRole('button', { name: 'Lobby' }));
    const confirmation = screen.getByRole('dialog', { name: 'Return to lobby?' });
    expect(confirmation).toHaveTextContent('every player seat will stay together');
    await user.click(within(confirmation).getByRole('button', { name: 'Return to lobby' }));

    expect(returnToLobby).toHaveBeenCalledOnce();
    expect(leaveRoom).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Territory Lobby' })).toBeInTheDocument();
    expect(useOnlineStore.getState().credentials?.roomCode).toBe(playingRoom.code);
    useOnlineStore.setState({
      leaveRoom: originalLeaveRoom,
      returnToLobby: originalReturnToLobby,
    });
  });

  it('shows only owned Progress Card families when the player-card icon is hovered', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Progress summary fixture has no K+N state.');
    const science = Object.values(original.kn.progressCards).find((card) =>
      KN_PROGRESS_CARDS.some(
        (definition) => definition.id === card.definitionId && definition.family === 'SCIENCE',
      ),
    );
    const trade = Object.values(original.kn.progressCards).find((card) =>
      KN_PROGRESS_CARDS.some(
        (definition) => definition.id === card.definitionId && definition.family === 'TRADE',
      ),
    );
    if (science === undefined || trade === undefined) {
      throw new Error('Progress summary fixture cards are missing.');
    }
    const player = {
      ...original.players[TEST_PLAYER_IDS[0]]!,
      knProgressCardIds: [science.instanceId, trade.instanceId],
    };
    render(
      <PlayerPanel
        player={player}
        position={1}
        active
        score={2}
        longestRoadLength={0}
        robberCount={0}
        holdsLongestRoad={false}
        holdsLargestForce={false}
        winner={false}
        kNMode
        knProgressCards={original.kn.progressCards}
      />,
    );

    await user.hover(screen.getByLabelText('2 Progress Cards'));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Science1');
    expect(tooltip).toHaveTextContent('Trade1');
    expect(tooltip).not.toHaveTextContent('Politics');
  });

  it('marks the classic longest-road and knight-force icons as award holders', () => {
    const state = knActionState();
    const player = state.players[TEST_PLAYER_IDS[0]]!;
    const view = render(
      <PlayerPanel
        player={player}
        position={1}
        active
        score={5}
        longestRoadLength={6}
        robberCount={3}
        holdsLongestRoad
        holdsLargestForce
        winner={false}
      />,
    );

    expect(view.container.querySelector('.game-player__stat--bridge')).toHaveClass(
      'is-award-holder',
    );
    expect(view.container.querySelector('.game-player__stat--robber')).toHaveClass(
      'is-award-holder',
    );
  });

  it('counts down an absent online seat beneath its profile picture', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));
    const state = knActionState();
    const player = state.players[TEST_PLAYER_IDS[0]]!;
    const view = render(
      <PlayerPanel
        player={player}
        position={1}
        active={false}
        score={2}
        longestRoadLength={0}
        robberCount={0}
        holdsLongestRoad={false}
        holdsLargestForce={false}
        winner={false}
        disconnectDeadlineAt={Date.now() + 180_000}
      />,
    );

    const timer = view.container.querySelector('.game-player__disconnect-timer');
    expect(timer).toHaveTextContent('3:00');
    expect(timer?.closest('.game-player__portrait')).toHaveClass(
      'game-player__portrait--disconnecting',
    );
    expect(view.container).toHaveTextContent('Connection lost');

    await act(() => vi.advanceTimersByTime(1_100));
    expect(timer).toHaveTextContent('2:59');

    view.rerender(
      <PlayerPanel
        player={player}
        position={1}
        active={false}
        score={2}
        longestRoadLength={0}
        robberCount={0}
        holdsLongestRoad={false}
        holdsLargestForce={false}
        winner={false}
        disconnectDeadlineAt={Date.now() + 179_000}
        disconnectCountdownPaused
      />,
    );
    await act(() => vi.advanceTimersByTime(60_000));
    expect(timer).toHaveTextContent('2:59');
  });

  it('uses compact player details without Defender points and treats equal defense as enough', () => {
    const original = knActionState();
    const player = {
      ...original.players[TEST_PLAYER_IDS[0]]!,
      cityImprovements: { SCIENCE: 3, TRADE: 2, POLITICS: 1 } as const,
    };
    const firstVertex = Object.values(original.board.vertices)[0];
    if (firstVertex === undefined) throw new Error('Player visual fixture has no board vertex.');
    const matchingKnight = {
      id: knightId('matching-defense-knight'),
      ownerId: player.id,
      vertexId: firstVertex.id,
      level: 1 as const,
      active: true,
      placedTurn: 1,
      activeSinceTurn: 1,
      lastActionTurn: null,
      upgradedTurn: null,
    };
    const trackerState: GameState = {
      ...original,
      players: {
        ...original.players,
        [player.id]: { ...player, knights: [matchingKnight] },
      },
      board: {
        ...original.board,
        vertices: {
          ...original.board.vertices,
          [firstVertex.id]: {
            ...firstVertex,
            building: { ownerId: player.id, type: 'MANSION' },
          },
        },
      },
    };

    const view = render(
      <PlayerPanel
        player={{ ...player, knights: [matchingKnight] }}
        position={1}
        active
        score={4}
        longestRoadLength={3}
        robberCount={0}
        holdsLongestRoad
        holdsLargestForce={false}
        winner={false}
        kNMode
        cityCount={1}
        wallCount={2}
        discardThreshold={10}
      />,
    );
    expect(view.container).not.toHaveTextContent('Defender points');
    expect(screen.getByTitle('2 City Walls')).toHaveTextContent('2 walls');
    expect(screen.getByTitle('Safe hand limit')).toHaveTextContent('Safe 14');
    expect(view.container.querySelector('.game-player-kn__improvement-grid')).not.toBeNull();
    expect(
      view.container.querySelector('.game-player-kn__plain-stat .game-player__bridge-art')
        ?.parentElement,
    ).toHaveClass('is-award-holder');
    expect(view.container.querySelector('.game-player-kn__plain-stat--knights')).toHaveClass(
      'is-award-holder',
    );

    view.rerender(<BarbarianTracker state={trackerState} />);
    expect(view.container.querySelector('.board-barbarian-tracker__stat--defense')).toHaveClass(
      'is-advantaged',
    );
  });
});
