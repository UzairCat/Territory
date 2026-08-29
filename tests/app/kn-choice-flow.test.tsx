// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../../src/app/App';
import { audioManager } from '../../src/app/audio/audio-manager';
import { resetAppStoreForTests, useAppStore } from '../../src/app/stores/app-store';
import type { BoardViewportProps } from '../../src/board-renderer/BoardViewport';
import { COMMODITY_IDS } from '../../src/engine/content/commodities';
import { KN_PROGRESS_CARDS } from '../../src/engine/content/kn-progress-cards';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { createGame } from '../../src/engine/core/create-game';
import type { GameEvent } from '../../src/engine/core/events';
import type { GameState } from '../../src/engine/core/game-state';
import { knightId } from '../../src/engine/core/ids';
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
          {resourceFlyovers.map((flyover) => `${flyover.targetPlayerId ?? 'visible'}|`)}
        </output>
        <output data-testid="progress-card-flyovers">
          {progressCardFlyovers.map(
            (flyover) =>
              `${flyover.source.kind === 'PLAYER' ? flyover.source.playerId : `deck-${flyover.source.family ?? 'base'}`}:${flyover.cardDefinitionId}|`,
          )}
        </output>
        <output data-testid="emphasized-vertices">{emphasizedVertexIds.join('|')}</output>
        <output data-testid="inventor-selection">
          {inventorSelectionActive ? `active:${inventorSelectedHexId ?? 'none'}` : 'inactive'}
        </output>
        <output data-testid="inventor-pending">{inventorPendingHexId ?? 'none'}</output>
        <output data-testid="number-token-swap">{numberTokenSwap?.join('|') ?? ''}</output>
        <output data-testid="merchant-placement">
          {merchantPlacementActive ? 'active' : 'inactive'}
        </output>
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

describe('K+N compact choice flows', () => {
  beforeEach(() => {
    resetAppStoreForTests();
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
      screen.getByLabelText('Choose Defender Reward: 15 seconds remaining'),
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
    expect(screen.getByText('Take Actions')).toBeInTheDocument();
    expect(screen.getByTestId('merchant-placement')).toHaveTextContent('active');
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
  });

  it('confirms Alchemist activation before showing two rows of dice and rolling', async () => {
    const user = userEvent.setup();
    const original = knActionState();
    if (original.kn === null) throw new Error('Alchemist fixture has no K+N state.');
    const definition = KN_PROGRESS_CARDS.find((candidate) => candidate.effect === 'ALCHEMIST');
    const card = Object.values(original.kn.progressCards).find(
      (candidate) => candidate.definitionId === definition?.id,
    );
    if (definition === undefined || card === undefined) {
      throw new Error('Alchemist fixture card is missing.');
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
      turn: { ...original.turn, phase: 'WAITING_FOR_ROLL', dice: null },
      kn: {
        ...original.kn,
        progressCards: {
          ...original.kn.progressCards,
          [card.instanceId]: { ...card, ownerId: TEST_PLAYER_IDS[0] },
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
    await user.click(screen.getByRole('button', { name: `Select HEX ${targetHex.id}` }));
    expect(useAppStore.getState().gameState?.pendingInteraction).toMatchObject({
      purpose: 'RECLAMATION_RESOURCE',
      canCancel: true,
    });
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
      />,
    );
    expect(view.container).not.toHaveTextContent('Defender points');
    expect(screen.getByTitle('2 City Walls')).toHaveTextContent('2 walls');
    expect(screen.getByTitle('Safe hand limit')).toHaveTextContent('Safe 11');
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
