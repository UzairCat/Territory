// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../../src/app/App';
import { resetAppStoreForTests, useAppStore } from '../../src/app/stores/app-store';
import { resetOnlineStoreForTests, useOnlineStore } from '../../src/app/stores/online-store';
import type { BoardViewportProps } from '../../src/board-renderer/BoardViewport';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { createGame } from '../../src/engine/core/create-game';
import type { GameEvent } from '../../src/engine/core/events';
import type { GameState } from '../../src/engine/core/game-state';
import { createRandomState, randomInteger } from '../../src/engine/core/random';
import { createOnlineGameView } from '../../src/multiplayer/projection';
import { createTestConfig, TEST_PLAYER_IDS } from '../helpers/game-state';

vi.mock('../../src/board-renderer/BoardViewport', () => ({
  BoardViewport: ({
    selectableTargets,
    showKeyboardTargetControls,
    showRobberAttention,
    robberMove,
    onSelect,
  }: BoardViewportProps) => (
    <section
      aria-label="Territory board"
      data-keyboard-target-controls={String(showKeyboardTargetControls)}
      data-robber-attention={String(showRobberAttention)}
      data-robber-move={robberMove === null ? '' : `${robberMove.fromHexId}->${robberMove.toHexId}`}
    >
      {selectableTargets[0] === undefined ? null : (
        <button type="button" onClick={() => onSelect(selectableTargets[0]!)}>
          Select first {selectableTargets[0].kind} target
        </button>
      )}
    </section>
  ),
}));

function randomForTotal(total: number) {
  for (let candidate = 0; candidate < 10_000; candidate += 1) {
    const state = createRandomState(`robber-ui-${total}-${candidate}`);
    const first = randomInteger(state, 1, 7);
    const second = randomInteger(first.state, 1, 7);
    if (first.value + second.value === total) return state;
  }
  throw new Error(`Could not find deterministic dice total ${total}.`);
}

function createdGame(): GameState {
  const result = createGame({ ...createTestConfig(3), seed: 'robber-ui-board' });
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join(', '));
  return result.state;
}

function renderGame(state: GameState, recentGameEvents: readonly GameEvent[] = []) {
  useAppStore.setState({ gameState: state, recentGameEvents });
  return render(
    <MemoryRouter initialEntries={['/game']}>
      <App />
    </MemoryRouter>,
  );
}

describe('robber application flow', () => {
  beforeEach(() => {
    resetAppStoreForTests();
    resetOnlineStoreForTests();
  });
  afterEach(() => {
    cleanup();
    resetOnlineStoreForTests();
  });

  it('rolls a seven, requires an exact discard, and moves the robber without deadlock', async () => {
    const user = userEvent.setup();
    const original = createdGame();
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 8]]),
        },
      },
      turn: {
        ...original.turn,
        activePlayerId: TEST_PLAYER_IDS[0],
        phase: 'WAITING_FOR_ROLL',
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      pendingInteraction: null,
      random: randomForTotal(7),
    };
    const originalRobberHexId = state.board.robberHexId;
    renderGame(state);

    expect(
      screen.getByLabelText('Alex is rolling the dice: 10 seconds remaining'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Roll dice' }));
    expect(screen.getByText('Discard resources')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Sam is discarding cards: 30 seconds remaining'),
    ).toBeInTheDocument();
    const discardDialog = screen.getByRole('dialog', { name: 'Discard Cards (0/4)' });
    expect(
      screen.getByRole('region', { name: 'Sam resource hand for discarding' }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Discard Cards (0/4)' })).toBeInTheDocument();

    const confirm = within(discardDialog).getByRole('button', { name: 'Confirm discard' });
    expect(confirm).toBeDisabled();
    for (let card = 0; card < 4; card += 1) {
      await user.click(screen.getByRole('button', { name: /Select Wood for discard/ }));
    }
    expect(screen.getByRole('dialog', { name: 'Discard Cards (4/4)' })).toBeInTheDocument();
    expect(
      within(discardDialog).getAllByRole('button', { name: 'Return Wood from discard' }),
    ).toHaveLength(4);
    expect(confirm).toBeEnabled();
    await user.click(
      within(discardDialog).getAllByRole('button', { name: 'Return Wood from discard' })[0]!,
    );
    expect(screen.getByRole('dialog', { name: 'Discard Cards (3/4)' })).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Select Wood for discard/ }));
    await user.click(confirm);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Alex is moving the robber: 20 seconds remaining'),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Territory board' })).toHaveAttribute(
      'data-keyboard-target-controls',
      'false',
    );
    expect(screen.getByRole('region', { name: 'Territory board' })).toHaveAttribute(
      'data-robber-attention',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Select first HEX target' }));
    expect(screen.getByText('Action phase')).toBeInTheDocument();
    const movedRobberHexId = useAppStore.getState().gameState?.board.robberHexId;
    expect(movedRobberHexId).not.toBe(originalRobberHexId);
    expect(screen.getByRole('region', { name: 'Territory board' })).toHaveAttribute(
      'data-robber-move',
      `${originalRobberHexId}->${movedRobberHexId}`,
    );
    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[1]]?.resources).toMatchObject({
      wood: 4,
    });
  });

  it('lets every affected online player choose their discard without waiting for queue order', async () => {
    const user = userEvent.setup();
    const original = createdGame();
    const viewerId = TEST_PLAYER_IDS[2];
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 8]]),
        },
        [viewerId]: {
          ...original.players[viewerId]!,
          resources: resourceBundle([[RESOURCE_IDS.grain, 8]]),
        },
      },
      turn: {
        ...original.turn,
        activePlayerId: TEST_PLAYER_IDS[0],
        phase: 'DISCARD_RESOURCES',
        dice: [3, 4],
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      pendingInteraction: {
        type: 'DISCARD_RESOURCES',
        queue: [TEST_PLAYER_IDS[1], viewerId],
        requiredCounts: { [TEST_PLAYER_IDS[1]]: 4, [viewerId]: 4 },
      },
    };
    const deadlineAt = Date.now() + 30_000;
    const game = createOnlineGameView(state, viewerId, 4, [], [], false, false, deadlineAt, null);
    useOnlineStore.setState({
      connection: 'CONNECTED',
      credentials: { roomCode: 'DISC34', playerId: viewerId, resumeToken: 'd'.repeat(32) },
      room: {
        protocolVersion: 1,
        code: 'DISC34',
        phase: 'PLAYING',
        viewerPlayerId: viewerId,
        hostPlayerId: TEST_PLAYER_IDS[0],
        players: state.config.players.map((player) => ({
          id: player.id,
          name: player.name,
          colorId: player.colorId,
          connected: true,
          ready: true,
          host: player.id === TEST_PLAYER_IDS[0],
        })),
        settings: {
          mapId: state.config.mapId,
          modeId: state.config.modeId,
          size: 3,
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
    renderGame(game.state);

    expect(screen.getByRole('dialog', { name: 'Discard Cards (0/4)' })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Jordan resource hand for discarding' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sam and Jordan are discarding cards')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Select Grain for discard/ }));
    expect(screen.getByRole('dialog', { name: 'Discard Cards (1/4)' })).toBeInTheDocument();
  });

  it('ignores the entire robber sequence while developer mode is enabled', async () => {
    const user = userEvent.setup();
    const original = createdGame();
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 8]]),
        },
      },
      turn: {
        ...original.turn,
        activePlayerId: TEST_PLAYER_IDS[0],
        phase: 'WAITING_FOR_ROLL',
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      pendingInteraction: null,
      random: randomForTotal(7),
    };
    renderGame(state);

    await user.click(
      screen.getByRole('button', {
        name: 'Enable developer mode with 99 goods, every Progress Card, and no robber',
      }),
    );
    expect(screen.getByRole('button', { name: 'Disable admin mode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Roll dice' }));

    expect(screen.queryByRole('dialog', { name: /discard resources/ })).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Alex is moving the robber: 20 seconds remaining'),
    ).not.toBeInTheDocument();
    const adminState = useAppStore.getState().gameState;
    expect(adminState?.turn.phase).toBe('ACTION_PHASE');
    expect(adminState?.pendingInteraction).toBeNull();
    expect(adminState?.players[TEST_PLAYER_IDS[0]]?.resources).toEqual({
      [RESOURCE_IDS.wood]: 99,
      [RESOURCE_IDS.brick]: 99,
      [RESOURCE_IDS.grain]: 99,
      [RESOURCE_IDS.livestock]: 99,
      [RESOURCE_IDS.ore]: 99,
    });
    expect(adminState?.players[TEST_PLAYER_IDS[1]]?.resources).toMatchObject({ wood: 8 });
    expect(
      useAppStore
        .getState()
        .recentGameEvents.some((event) => event.type === 'ROBBER_SEQUENCE_STARTED'),
    ).toBe(false);
  });

  it('requires the active player to choose among multiple adjacent victims', async () => {
    const user = userEvent.setup();
    const original = createdGame();
    const targetHex = Object.values(original.board.hexes).find(
      (hex) => hex.id !== original.board.robberHexId && hex.vertexIds.length >= 2,
    );
    const firstVertexId = targetHex?.vertexIds[0];
    const secondVertexId = targetHex?.vertexIds[1];
    if (targetHex === undefined || firstVertexId === undefined || secondVertexId === undefined) {
      throw new Error('Generated board has no robber target vertices.');
    }
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 1]]),
        },
        [TEST_PLAYER_IDS[2]]: {
          ...original.players[TEST_PLAYER_IDS[2]]!,
          resources: resourceBundle([[RESOURCE_IDS.brick, 1]]),
        },
      },
      board: {
        ...original.board,
        robberHexId: targetHex.id,
        vertices: {
          ...original.board.vertices,
          [firstVertexId]: {
            ...original.board.vertices[firstVertexId]!,
            building: { ownerId: TEST_PLAYER_IDS[1], type: 'HOUSE' },
          },
          [secondVertexId]: {
            ...original.board.vertices[secondVertexId]!,
            building: { ownerId: TEST_PLAYER_IDS[2], type: 'HOUSE' },
          },
        },
      },
      turn: {
        ...original.turn,
        activePlayerId: TEST_PLAYER_IDS[0],
        phase: 'CHOOSE_STEAL_TARGET',
        dice: [3, 4],
        setupPlacementIndex: null,
        setupPlacementVertexId: null,
      },
      pendingInteraction: {
        type: 'CHOOSE_STEAL_TARGET',
        playerId: TEST_PLAYER_IDS[0],
        eligibleTargets: [TEST_PLAYER_IDS[1], TEST_PLAYER_IDS[2]],
      },
    };
    renderGame(state, [
      {
        type: 'ROBBER_MOVED',
        playerId: TEST_PLAYER_IDS[0],
        fromHexId: original.board.robberHexId,
        hexId: targetHex.id,
      },
    ]);

    const dialog = screen.getByRole('dialog', { name: 'Choose a player to rob' });
    expect(screen.getByText(/moved the robber. Choose an eligible player/)).toBeInTheDocument();
    expect(screen.queryByText(/No eligible player could be robbed/)).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Choose a player to rob' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /^Sam/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Action phase')).toBeInTheDocument();
    expect(screen.getByText(/stole one random resource card from Sam/)).toBeInTheDocument();
  });
});
