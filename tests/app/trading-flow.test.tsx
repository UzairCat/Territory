// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../../src/app/App';
import { resetAppStoreForTests, useAppStore } from '../../src/app/stores/app-store';
import type { BoardViewportProps } from '../../src/board-renderer/BoardViewport';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import type { GameState } from '../../src/engine/core/game-state';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

vi.mock('../../src/board-renderer/BoardViewport', () => ({
  BoardViewport: (_props: BoardViewportProps) => <section aria-label="Territory board" />,
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
  afterEach(cleanup);

  it('completes a bank trade and keeps the composer open for another exchange', async () => {
    const user = userEvent.setup();
    renderGame(tradingState());

    await user.click(screen.getByRole('button', { name: 'Trade' }));
    const dialog = screen.getByRole('dialog', { name: 'Trade resources' });
    const complete = within(dialog).getByRole('button', { name: 'Complete bank trade' });
    expect(complete).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: /Give Wood:/ }));
    await user.click(within(dialog).getByRole('button', { name: /Receive Grain:/ }));
    expect(within(dialog).getByText('Exchange 4 for 1.')).toBeInTheDocument();
    await user.click(complete);

    expect(screen.getByRole('dialog', { name: 'Trade resources' })).toBeInTheDocument();
    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 2,
      grain: 1,
    });
    expect(useAppStore.getState().gameState?.bank).toMatchObject({ wood: 23, grain: 18 });
    expect(screen.getAllByText(/traded 4 Wood with the bank for 1 Grain/).length).toBeGreaterThan(
      0,
    );

    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an exact player offer immediately and accepts it', async () => {
    const user = userEvent.setup();
    renderGame(tradingState());

    await user.click(screen.getByRole('button', { name: 'Trade' }));
    const composer = screen.getByRole('dialog', { name: 'Trade resources' });
    await user.click(within(composer).getByRole('tab', { name: 'Player offer' }));
    await user.click(within(composer).getByRole('button', { name: 'Add Wood to offer' }));
    await user.click(within(composer).getByRole('button', { name: 'Add Brick to request' }));
    await user.click(within(composer).getByRole('button', { name: 'Send offer' }));

    const response = screen.getByRole('dialog', { name: 'Sam: trade offer' });
    expect(within(response).getByText(/Alex/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Sam: trade offer' })).toBeInTheDocument();

    expect(within(response).getByText('1 Wood')).toBeInTheDocument();
    expect(within(response).getByText('1 Brick')).toBeInTheDocument();
    await user.click(within(response).getByRole('button', { name: 'Accept trade' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 5,
      brick: 1,
    });
    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[1]]?.resources).toMatchObject({
      wood: 1,
      brick: 1,
    });
    expect(screen.getByText(/Alex and Sam completed a player trade/)).toBeInTheDocument();
  });

  it('explains an unaffordable offer and always permits rejection', async () => {
    const user = userEvent.setup();
    renderGame(tradingState(0));

    await user.click(screen.getByRole('button', { name: 'Trade' }));
    const composer = screen.getByRole('dialog', { name: 'Trade resources' });
    await user.click(within(composer).getByRole('tab', { name: 'Player offer' }));
    await user.click(within(composer).getByRole('button', { name: 'Add Wood to offer' }));
    await user.click(within(composer).getByRole('button', { name: 'Add Brick to request' }));
    await user.click(within(composer).getByRole('button', { name: 'Send offer' }));
    const response = screen.getByRole('dialog', { name: 'Sam: trade offer' });
    expect(
      within(response).getByText(/do not have all of the requested cards/),
    ).toBeInTheDocument();
    expect(within(response).getByRole('button', { name: 'Accept trade' })).toBeDisabled();
    await user.click(within(response).getByRole('button', { name: 'Reject trade' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Sam rejected the trade offer/)).toBeInTheDocument();
  });
});
