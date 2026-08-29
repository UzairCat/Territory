// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../../src/app/App';
import { resetAppStoreForTests, useAppStore } from '../../src/app/stores/app-store';
import type { BoardViewportProps } from '../../src/board-renderer/BoardViewport';
import { PLAYER_COLORS } from '../../src/engine/content/colors';
import { PROGRESS_CARD_IDS } from '../../src/engine/content/progress-cards';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import type { GameState } from '../../src/engine/core/game-state';
import { cardInstanceId, edgeId, vertexId } from '../../src/engine/core/ids';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

vi.mock('../../src/board-renderer/BoardViewport', () => ({
  BoardViewport: ({
    selectableTargets,
    resourceFlyovers = [],
    progressCardFlyovers = [],
    onSelect,
  }: BoardViewportProps) => (
    <section aria-label="Territory board">
      <output data-testid="resource-flyovers">
        {resourceFlyovers.map((flyover) => `${flyover.source.kind}:${flyover.resourceId}|`)}
      </output>
      <output data-testid="progress-card-flyovers">
        {progressCardFlyovers.map((flyover) => `${flyover.source.kind}:${flyover.targetPlayerId}|`)}
      </output>
      {selectableTargets[0] === undefined ? null : (
        <button type="button" onClick={() => onSelect(selectableTargets[0]!)}>
          Select first {selectableTargets[0].kind} target
        </button>
      )}
    </section>
  ),
}));

const CARD = cardInstanceId('ui-progress-card');
const VERTEX_A = vertexId('ui-card-a');
const VERTEX_B = vertexId('ui-card-b');
const VERTEX_C = vertexId('ui-card-c');
const EDGE_AB = edgeId('ui-card-ab');
const EDGE_BC = edgeId('ui-card-bc');

function renderGame(state: GameState) {
  useAppStore.setState({ gameState: state, recentGameEvents: [], gameEventHistory: [] });
  return render(
    <MemoryRouter initialEntries={['/game']}>
      <App />
    </MemoryRouter>,
  );
}

function progressState(definitionId: (typeof PROGRESS_CARD_IDS)[keyof typeof PROGRESS_CARD_IDS]) {
  const state = createTestGameState('ACTION_PHASE');
  return {
    ...state,
    turn: { ...state.turn, turnNumber: 2, dice: [2, 3] as const },
    players: {
      ...state.players,
      [TEST_PLAYER_IDS[0]]: {
        ...state.players[TEST_PLAYER_IDS[0]]!,
        progressCardIds: [CARD],
      },
    },
    progressCards: {
      [CARD]: {
        instanceId: CARD,
        definitionId,
        ownerId: TEST_PLAYER_IDS[0],
        purchasedTurn: 1,
        playedTurn: null,
      },
    },
  } satisfies GameState;
}

describe('progress cards, open hands, and victory UI', () => {
  beforeEach(() => resetAppStoreForTests());
  afterEach(cleanup);

  it('buys into the tray, delays, and later resolves Year of Plenty', async () => {
    const user = userEvent.setup();
    const original = createTestGameState('ACTION_PHASE');
    const state: GameState = {
      ...original,
      turn: { ...original.turn, turnNumber: 3, dice: [2, 3] },
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([
            [RESOURCE_IDS.grain, 1],
            [RESOURCE_IDS.livestock, 1],
            [RESOURCE_IDS.ore, 1],
          ]),
        },
      },
      progressDeck: [CARD],
      progressCards: {
        [CARD]: {
          instanceId: CARD,
          definitionId: PROGRESS_CARD_IDS.yearOfPlenty,
          ownerId: null,
          purchasedTurn: null,
          playedTurn: null,
        },
      },
    };
    renderGame(state);

    await user.click(screen.getByRole('button', { name: 'Buy Progress card' }));
    expect(screen.getByRole('button', { name: 'Play Year of Plenty' })).toBeDisabled();
    expect(screen.getByText('Next turn')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Progress cards' })).not.toBeInTheDocument();
    expect(screen.getByTestId('progress-card-flyovers')).toHaveTextContent(
      `DECK:${TEST_PLAYER_IDS[0]}|`,
    );

    const boughtState = useAppStore.getState().gameState;
    if (boughtState === null) throw new Error('Purchase did not retain game state.');
    act(() =>
      useAppStore.setState({
        gameState: {
          ...boughtState,
          turn: {
            ...boughtState.turn,
            turnNumber: boughtState.turn.turnNumber + 1,
            cardIdsBoughtThisTurn: [],
          },
        },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Play Year of Plenty' }));
    const choice = screen.getByRole('dialog', { name: 'Year of Plenty' });
    expect(within(choice).getByRole('button', { name: 'Confirm Year of Plenty' })).toBeDisabled();
    await user.click(within(choice).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Year of Plenty' })).not.toBeInTheDocument();
    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.progressCardIds,
    ).toContain(CARD);
    expect(useAppStore.getState().gameState?.progressDiscard).not.toContain(CARD);

    await user.click(screen.getByRole('button', { name: 'Play Year of Plenty' }));
    const reopenedChoice = screen.getByRole('dialog', { name: 'Year of Plenty' });
    await user.click(
      within(reopenedChoice).getByRole('button', {
        name: 'Choose Wood for Year of Plenty',
      }),
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Year of Plenty' })).toBeInTheDocument();
    await user.click(
      within(reopenedChoice).getByRole('button', {
        name: 'Choose Wood for Year of Plenty',
      }),
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Year of Plenty' })).toBeInTheDocument();
    await user.click(
      within(reopenedChoice).getByRole('button', { name: 'Confirm Year of Plenty' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      wood: 2,
    });
    expect(screen.getByTestId('resource-flyovers')).toHaveTextContent('BANK:wood|BANK:wood|');
    expect(screen.getAllByText(/chose 2 Wood with Year of Plenty/).length).toBeGreaterThan(0);
  });

  it('keeps Road Building in board placement mode until both free roads are placed', async () => {
    const user = userEvent.setup();
    const original = progressState(PROGRESS_CARD_IDS.roadBuilding);
    const state: GameState = {
      ...original,
      board: {
        ...original.board,
        vertices: {
          [VERTEX_A]: {
            id: VERTEX_A,
            adjacentHexIds: [],
            connectedEdgeIds: [EDGE_AB],
            adjacentVertexIds: [VERTEX_B],
            building: { ownerId: TEST_PLAYER_IDS[0], type: 'HOUSE' },
            portId: null,
          },
          [VERTEX_B]: {
            id: VERTEX_B,
            adjacentHexIds: [],
            connectedEdgeIds: [EDGE_AB, EDGE_BC],
            adjacentVertexIds: [VERTEX_A, VERTEX_C],
            building: null,
            portId: null,
          },
          [VERTEX_C]: {
            id: VERTEX_C,
            adjacentHexIds: [],
            connectedEdgeIds: [EDGE_BC],
            adjacentVertexIds: [VERTEX_B],
            building: null,
            portId: null,
          },
        },
        edges: {
          [EDGE_AB]: {
            id: EDGE_AB,
            vertexAId: VERTEX_A,
            vertexBId: VERTEX_B,
            adjacentHexIds: [],
            roadOwnerId: null,
            portId: null,
          },
          [EDGE_BC]: {
            id: EDGE_BC,
            vertexAId: VERTEX_B,
            vertexBId: VERTEX_C,
            adjacentHexIds: [],
            roadOwnerId: null,
            portId: null,
          },
        },
      },
    };
    renderGame(state);

    const roadBuildingCard = screen.getByRole('button', { name: 'Play Road Building' });
    await user.click(roadBuildingCard);
    await user.unhover(roadBuildingCard);
    const confirmation = screen.getByRole('dialog', { name: 'Road Building' });
    expect(confirmation).toHaveClass('progress-card-tooltip--confirming');
    expect(confirmation).toHaveTextContent('Place up to two legal connected Roads');
    expect(useAppStore.getState().gameState?.turn.phase).toBe('ACTION_PHASE');
    await user.click(roadBuildingCard);
    const cancelledTooltip = screen.getByRole('tooltip', { name: 'Road Building' });
    expect(within(cancelledTooltip).queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(
      within(cancelledTooltip).queryByRole('button', { name: 'Use Road Building' }),
    ).toBeNull();
    expect(
      useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.progressCardIds,
    ).toContain(CARD);

    await user.click(roadBuildingCard);
    await user.click(
      within(screen.getByRole('dialog', { name: 'Road Building' })).getByRole('button', {
        name: 'Use Road Building',
      }),
    );
    expect(screen.getByText('Resolve progress card')).toBeInTheDocument();
    expect(screen.getByText(/2 placements remaining/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select first EDGE target' }));
    expect(screen.getByText(/1 placement remaining/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select first EDGE target' }));

    expect(screen.getByText('Action phase')).toBeInTheDocument();
    expect(useAppStore.getState().gameState?.board.edges[EDGE_AB]?.roadOwnerId).toBe(
      TEST_PLAYER_IDS[0],
    );
    expect(useAppStore.getState().gameState?.board.edges[EDGE_BC]?.roadOwnerId).toBe(
      TEST_PLAYER_IDS[0],
    );
  });

  it('chooses and announces the resource used for Monopoly', async () => {
    const user = userEvent.setup();
    const original = progressState(PROGRESS_CARD_IDS.monopoly);
    const state: GameState = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([[RESOURCE_IDS.grain, 1]]),
        },
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([[RESOURCE_IDS.grain, 4]]),
        },
      },
    };
    renderGame(state);

    await user.click(screen.getByRole('button', { name: 'Play Monopoly' }));
    const choice = screen.getByRole('dialog', { name: 'Monopoly' });
    const confirm = within(choice).getByRole('button', { name: 'Confirm Monopoly' });
    expect(confirm).toBeDisabled();
    await user.click(within(choice).getByRole('button', { name: 'Choose Grain for Monopoly' }));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(useAppStore.getState().gameState?.players[TEST_PLAYER_IDS[0]]?.resources).toMatchObject({
      grain: 5,
    });
    expect(screen.getByTestId('resource-flyovers')).toHaveTextContent(
      'PLAYER:grain|PLAYER:grain|PLAYER:grain|PLAYER:grain|',
    );
    expect(
      screen.getAllByText(/chose Grain for Monopoly and collected 4 cards/).length,
    ).toBeGreaterThan(0);
  });

  it('keeps the active hand visible without pass-device confirmations', async () => {
    const user = userEvent.setup();
    const original = createTestGameState('ACTION_PHASE');
    const state: GameState = {
      ...original,
      turn: { ...original.turn, dice: [2, 3] },
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([[RESOURCE_IDS.ore, 4]]),
        },
      },
    };
    renderGame(state);

    const activeHand = screen.getByRole('contentinfo', { name: 'Active player resource hand' });
    expect(within(activeHand).getByText('Ore').parentElement).toHaveTextContent('4');
    expect(screen.queryByRole('dialog', { name: 'Pass the device' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'End Turn' }));
    expect(within(activeHand).getByText('Wood').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Sam’s turn')).toBeInTheDocument();
  });

  it('shows final score breakdown and creates a same-lobby rematch with a new seed', async () => {
    const user = userEvent.setup();
    const actions = useAppStore.getState();
    actions.addLobbyPlayer('Alex', PLAYER_COLORS[0]!.id);
    actions.addLobbyPlayer('Sam', PLAYER_COLORS[1]!.id);
    expect(actions.beginGame().ok).toBe(true);
    const created = useAppStore.getState().gameState;
    if (created === null) throw new Error('Could not create victory fixture.');
    const winnerId = created.config.players.find((player) => player.name === 'Alex')?.id;
    if (winnerId === undefined) throw new Error('Winner was not in the match.');
    const charter = cardInstanceId('ui-winning-charter');
    const won: GameState = {
      ...created,
      config: { ...created.config, victoryTarget: 1 },
      progressCards: {
        ...created.progressCards,
        [charter]: {
          instanceId: charter,
          definitionId: PROGRESS_CARD_IDS.chapel,
          ownerId: winnerId,
          purchasedTurn: 1,
          playedTurn: null,
        },
      },
      winnerId,
      turn: { ...created.turn, activePlayerId: winnerId, phase: 'GAME_OVER' },
    };
    const originalSeed = won.config.seed;
    renderGame(won);

    const victory = screen.getByRole('dialog', { name: 'Alex wins Territory!' });
    expect(within(victory).getByText('1 VP')).toBeInTheDocument();
    expect(within(victory).getByText(/Victory cards 1/)).toBeInTheDocument();
    await user.click(within(victory).getByRole('button', { name: /Rematch/ }));

    expect(screen.queryByRole('dialog', { name: /wins Territory/ })).not.toBeInTheDocument();
    expect(screen.getByText('Place a house')).toBeInTheDocument();
    expect(useAppStore.getState().gameState?.config.seed).not.toBe(originalSeed);
    expect(useAppStore.getState().lobby.players.map((player) => player.name)).toEqual([
      'Alex',
      'Sam',
    ]);
  });
});
