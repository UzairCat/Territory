// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../../src/app/App';
import { resetAppStoreForTests, useAppStore } from '../../src/app/stores/app-store';
import type { BoardViewportProps } from '../../src/board-renderer/BoardViewport';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { dispatch } from '../../src/engine/core/game-engine';
import type { GameState } from '../../src/engine/core/game-state';
import { actionId, edgeId, portId, tradeId, vertexId } from '../../src/engine/core/ids';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

vi.mock('../../src/board-renderer/BoardViewport', () => ({
  BoardViewport: ({ resourceFlyovers = [], progressCardFlyovers = [] }: BoardViewportProps) => (
    <section aria-label="Territory board">
      <output data-testid="trade-flyovers">
        {resourceFlyovers.map((flyover) => {
          const source =
            flyover.source.kind === 'PLAYER'
              ? `PLAYER:${flyover.source.playerId}`
              : flyover.source.kind;
          const target =
            flyover.target?.kind === 'PLAYER'
              ? `PLAYER:${flyover.target.playerId}`
              : (flyover.target?.kind ?? flyover.targetPlayerId ?? 'visible');
          return `${source}->${target}:${flyover.resourceId}|`;
        })}
      </output>
      <output data-testid="progress-draw-flyovers">
        {progressCardFlyovers.map(
          (flyover) => `${flyover.source.kind}->${flyover.targetPlayerId}|`,
        )}
      </output>
    </section>
  ),
}));

function tradingState(recipientBrick = 2): GameState {
  const original = createTestGameState('ACTION_PHASE');
  return {
    ...original,
    players: {
      ...original.players,
      [TEST_PLAYER_IDS[0]]: {
        ...original.players[TEST_PLAYER_IDS[0]]!,
        resources: resourceBundle([[RESOURCE_IDS.wood, 6]]),
      },
      [TEST_PLAYER_IDS[1]]: {
        ...original.players[TEST_PLAYER_IDS[1]]!,
        resources: resourceBundle(recipientBrick > 0 ? [[RESOURCE_IDS.brick, recipientBrick]] : []),
      },
    },
    turn: { ...original.turn, dice: [2, 3] },
  };
}

function multiBankTradingState(): GameState {
  const state = tradingState();
  return {
    ...state,
    players: {
      ...state.players,
      [TEST_PLAYER_IDS[0]]: {
        ...state.players[TEST_PLAYER_IDS[0]]!,
        resources: resourceBundle([[RESOURCE_IDS.wood, 10]]),
      },
    },
  };
}

function discountedBankTradingState(): GameState {
  const state = tradingState();
  const discountPortId = portId('app-trade-wood-port');
  const ownedVertexId = vertexId('app-trade-owned-port-vertex');
  const openVertexId = vertexId('app-trade-open-port-vertex');
  return {
    ...state,
    players: {
      ...state.players,
      [TEST_PLAYER_IDS[0]]: {
        ...state.players[TEST_PLAYER_IDS[0]]!,
        resources: resourceBundle([[RESOURCE_IDS.wood, 4]]),
      },
    },
    board: {
      ...state.board,
      vertices: {
        ...state.board.vertices,
        [ownedVertexId]: {
          id: ownedVertexId,
          adjacentHexIds: [],
          connectedEdgeIds: [],
          adjacentVertexIds: [],
          building: { ownerId: TEST_PLAYER_IDS[0], type: 'HOUSE' },
          portId: discountPortId,
        },
        [openVertexId]: {
          id: openVertexId,
          adjacentHexIds: [],
          connectedEdgeIds: [],
          adjacentVertexIds: [],
          building: null,
          portId: discountPortId,
        },
      },
      ports: {
        ...state.board.ports,
        [discountPortId]: {
          id: discountPortId,
          edgeId: edgeId('app-trade-wood-port-edge'),
          vertexIds: [ownedVertexId, openVertexId],
          tradeRatio: 2,
          resourceId: RESOURCE_IDS.wood,
        },
      },
    },
  };
}

function renderGame(state: GameState) {
  useAppStore.setState({ gameState: state, recentGameEvents: [] });
  return render(
    <MemoryRouter initialEntries={['/game']}>
      <App />
    </MemoryRouter>,
  );
}

describe('trading application flow', () => {
  beforeEach(() => resetAppStoreForTests());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('completes a bank trade and keeps the composer open for another exchange', async () => {
    const user = userEvent.setup();
    renderGame(tradingState());

    await user.click(screen.getByRole('button', { name: 'Trade' }));
    const dialog = screen.getByRole('dialog', { name: 'Trade' });
    const complete = within(dialog).getByRole('button', { name: 'Complete bank trade' });
    expect(complete).toBeDisabled();

    for (let index = 0; index < 4; index += 1) {
      await user.click(screen.getByRole('button', { name: /Select Wood for your trade offer/ }));
    }
    await user.click(
      within(dialog).getByRole('button', { name: 'Add Grain to trade request, 19 in bank' }),
    );
    expect(within(dialog).getAllByRole('button', { name: 'Return offered Wood' })).toHaveLength(4);
    expect(
      within(dialog).getByRole('button', { name: 'Remove requested Grain' }),
    ).toBeInTheDocument();
    expect(complete).toBeEnabled();
    await user.click(complete);

    expect(screen.getByRole('dialog', { name: 'Trade' })).toBeInTheDocument();
    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 2,
      grain: 1,
    });
    expect(useAppStore.getState().gameState?.bank).toMatchObject({ wood: 23, grain: 18 });
    expect(screen.getAllByText(/traded 4 Wood with the bank for 1 Grain/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByTestId('trade-flyovers')).toHaveTextContent(
      `PLAYER:${TEST_PLAYER_IDS[0]}->BANK:wood`,
    );
    expect(screen.getByTestId('trade-flyovers')).toHaveTextContent(
      `BANK->PLAYER:${TEST_PLAYER_IDS[0]}:grain`,
    );

    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('completes an 8:2 bank trade as one transaction', async () => {
    const user = userEvent.setup();
    renderGame(multiBankTradingState());

    await user.click(screen.getByRole('button', { name: 'Trade' }));
    const dialog = screen.getByRole('dialog', { name: 'Trade' });
    for (let index = 0; index < 8; index += 1) {
      await user.click(screen.getByRole('button', { name: /Select Wood for your trade offer/ }));
    }
    const addGrain = within(dialog).getByRole('button', {
      name: 'Add Grain to trade request, 19 in bank',
    });
    await user.click(addGrain);
    await user.click(addGrain);

    expect(within(dialog).getByText('Wood 4:1 · buys 2 bank cards')).toBeInTheDocument();
    const complete = within(dialog).getByRole('button', { name: 'Complete bank trade' });
    expect(complete).toBeEnabled();
    await user.click(complete);

    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 2,
      grain: 2,
    });
    expect(useAppStore.getState().gameState?.bank).toMatchObject({ wood: 27, grain: 17 });
    expect(screen.getAllByText(/traded 8 Wood with the bank for 2 Grain/).length).toBeGreaterThan(
      0,
    );
  });

  it('applies a 2:1 port rate to every group in a multi-card bank trade', async () => {
    const user = userEvent.setup();
    renderGame(discountedBankTradingState());

    await user.click(screen.getByRole('button', { name: 'Trade' }));
    const dialog = screen.getByRole('dialog', { name: 'Trade' });
    for (let index = 0; index < 4; index += 1) {
      await user.click(screen.getByRole('button', { name: /Select Wood for your trade offer/ }));
    }
    const addGrain = within(dialog).getByRole('button', {
      name: 'Add Grain to trade request, 19 in bank',
    });
    await user.click(addGrain);
    await user.click(addGrain);

    expect(within(dialog).getByText('Wood 2:1 · buys 2 bank cards')).toBeInTheDocument();
    const complete = within(dialog).getByRole('button', { name: 'Complete bank trade' });
    expect(complete).toBeEnabled();
    await user.click(complete);

    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 0,
      grain: 2,
    });
    expect(useAppStore.getState().gameState?.bank).toMatchObject({ wood: 23, grain: 17 });
  });

  it('keeps an invalid bank-trade selection gray and non-interactive', async () => {
    const user = userEvent.setup();
    renderGame(tradingState());

    await user.click(screen.getByRole('button', { name: 'Trade' }));
    const dialog = screen.getByRole('dialog', { name: 'Trade' });
    await user.click(screen.getByRole('button', { name: /Select Wood for your trade offer/ }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Add Grain to trade request, 19 in bank' }),
    );
    const complete = within(dialog).getByRole('button', { name: 'Complete bank trade' });

    expect(complete).toBeDisabled();
    expect(complete).toHaveClass('trade-tray__mode--bank');
    await user.click(complete);
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    const resources = useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.resources;
    expect(resources?.[RESOURCE_IDS.wood]).toBe(6);
    expect(resources?.[RESOURCE_IDS.grain] ?? 0).toBe(0);
  });

  it('starts an empty player-trade draft by clicking a card in the active hand', async () => {
    const user = userEvent.setup();
    renderGame(tradingState());

    const woodCard = screen.getByRole('button', { name: 'Wood: 6 cards' });
    expect(woodCard).toHaveAttribute('title', 'Select Wood to start a trade');
    await user.click(woodCard);

    const composer = screen.getByRole('dialog', { name: 'Trade' });
    expect(within(composer).getByRole('button', { name: 'Send trade request' })).toHaveClass(
      'trade-tray__mode--players',
    );
    expect(within(composer).getByRole('button', { name: 'Send trade request' })).toBeDisabled();
    expect(
      within(composer).getByRole('region', { name: 'Available cards to request' }),
    ).toBeInTheDocument();
    expect(
      within(composer).getByRole('button', { name: 'Return offered Wood' }),
    ).toBeInTheDocument();
    expect(within(composer).getByText('Choose requested cards')).toBeInTheDocument();

    await user.click(
      within(composer).getByRole('button', { name: 'Add Brick to trade request, 19 in bank' }),
    );
    expect(
      within(composer).getByRole('button', { name: 'Remove requested Brick' }),
    ).toBeInTheDocument();
    expect(within(composer).getByRole('button', { name: 'Send trade request' })).toBeEnabled();
  });

  it('records an opponent acceptance and waits for the proposer to confirm it', async () => {
    const user = userEvent.setup();
    renderGame(tradingState());

    await user.click(screen.getByRole('button', { name: 'Trade' }));
    const composer = screen.getByRole('dialog', { name: 'Trade' });
    await user.click(screen.getByRole('button', { name: /Select Wood for your trade offer/ }));
    await user.click(
      within(composer).getByRole('button', { name: 'Add Brick to trade request, 19 in bank' }),
    );
    await user.click(within(composer).getByRole('button', { name: 'Send trade request' }));

    const response = screen.getByRole('dialog', { name: 'Trade offer from Alex' });
    expect(within(response).getByText(/Alex/)).toBeInTheDocument();
    expect(within(response).getByTitle('Wood')).toBeInTheDocument();
    expect(within(response).getByTitle('Brick')).toBeInTheDocument();
    await user.click(within(response).getByRole('button', { name: 'Sam accept trade' }));

    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 6,
    });
    expect(within(response).getByText('Accepted · proposer may confirm')).toBeInTheDocument();
    await user.click(within(response).getByRole('button', { name: 'Complete trade with Sam' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 5,
      brick: 1,
    });
    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[1]]?.resources).toMatchObject({
      wood: 1,
      brick: 1,
    });
    expect(screen.getByTestId('trade-flyovers')).toHaveTextContent(
      `PLAYER:${TEST_PLAYER_IDS[0]}->PLAYER:${TEST_PLAYER_IDS[1]}:wood`,
    );
    expect(screen.getByTestId('trade-flyovers')).toHaveTextContent(
      `PLAYER:${TEST_PLAYER_IDS[1]}->PLAYER:${TEST_PLAYER_IDS[0]}:brick`,
    );
    expect(screen.getByText(/Alex and Sam completed a player trade/)).toBeInTheDocument();
  });

  it('explains an unaffordable offer and closes when its only opponent rejects it', async () => {
    const user = userEvent.setup();
    renderGame(tradingState(0));

    await user.click(screen.getByRole('button', { name: 'Trade' }));
    const composer = screen.getByRole('dialog', { name: 'Trade' });
    await user.click(screen.getByRole('button', { name: /Select Wood for your trade offer/ }));
    await user.click(
      within(composer).getByRole('button', { name: 'Add Brick to trade request, 19 in bank' }),
    );
    await user.click(within(composer).getByRole('button', { name: 'Send trade request' }));
    const response = screen.getByRole('dialog', { name: 'Trade offer from Alex' });
    expect(
      within(response).getByText(/do not have all of the requested cards/),
    ).toBeInTheDocument();
    expect(within(response).getByRole('button', { name: 'Sam accept trade' })).toBeDisabled();
    await user.click(within(response).getByRole('button', { name: 'Sam decline trade' }));

    expect(screen.queryByRole('dialog', { name: 'Trade offer from Alex' })).not.toBeInTheDocument();
    expect(Object.values(useAppStore.getState().gameState?.tradeOffers ?? {})[0]).toMatchObject({
      status: 'CANCELLED',
    });
    expect(screen.getByText(/Sam rejected the trade offer/)).toBeInTheDocument();
  });

  it('closes and clears the shared trade tray when Trade is clicked again', async () => {
    const user = userEvent.setup();
    renderGame(tradingState());

    const tradeButton = screen.getByRole('button', { name: 'Trade' });
    await user.click(tradeButton);
    const composer = screen.getByRole('dialog', { name: 'Trade' });
    await user.click(screen.getByRole('button', { name: /Select Wood for your trade offer/ }));
    expect(
      within(composer).getByRole('button', { name: 'Return offered Wood' }),
    ).toBeInTheDocument();

    await user.click(tradeButton);
    expect(screen.queryByRole('dialog', { name: 'Trade' })).not.toBeInTheDocument();

    await user.click(tradeButton);
    expect(screen.getByRole('dialog', { name: 'Trade' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Return offered Wood' })).not.toBeInTheDocument();
  });

  it('clears an unfinished trade draft when the active turn changes', async () => {
    const user = userEvent.setup();
    renderGame(tradingState());

    await user.click(screen.getByRole('button', { name: 'Trade' }));
    expect(screen.getByRole('dialog', { name: 'Trade' })).toBeInTheDocument();
    act(() => {
      useAppStore.setState((store) => {
        const state = store.gameState!;
        return {
          gameState: {
            ...state,
            turn: {
              ...state.turn,
              activePlayerId: TEST_PLAYER_IDS[1],
              turnNumber: state.turn.turnNumber + 1,
              phase: 'ACTION_PHASE',
            },
          },
        };
      });
    });

    expect(screen.queryByRole('dialog', { name: 'Trade' })).not.toBeInTheDocument();
  });

  it('expires an unanswered player offer after fifteen seconds', async () => {
    const state = tradingState();
    const created = dispatch(state, {
      id: actionId('create-expiring-offer'),
      type: 'CREATE_TRADE',
      actorId: TEST_PLAYER_IDS[0],
      tradeId: tradeId('expiring-offer'),
      recipientIds: [TEST_PLAYER_IDS[1]],
      offered: resourceBundle([[RESOURCE_IDS.wood, 1]]),
      requested: resourceBundle([[RESOURCE_IDS.brick, 1]]),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    vi.useFakeTimers();
    renderGame(created.state);

    expect(screen.getByLabelText('15 seconds remaining')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTime(15_000));

    expect(screen.queryByRole('dialog', { name: 'Trade offer from Alex' })).not.toBeInTheDocument();
    expect(useAppStore.getState().gameState?.tradeOffers[tradeId('expiring-offer')]?.status).toBe(
      'CANCELLED',
    );
  });
});
