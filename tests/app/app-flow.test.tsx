// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../../src/app/App';
import { RANDOM_MAP_ID } from '../../src/app/lobby/lobby-model';
import { resetAppStoreForTests, useAppStore } from '../../src/app/stores/app-store';
import type { BoardViewportProps } from '../../src/board-renderer/BoardViewport';
import { COMMODITY_IDS } from '../../src/engine/content/commodities';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { getKNProgressCardDefinition } from '../../src/engine/content/kn-progress-cards';
import { resourceBundle } from '../../src/engine/content/types';
import { createRandomState, randomInteger } from '../../src/engine/core/random';
import { KN_MODE } from '../../src/engine/modes/kn';

vi.mock('../../src/board-renderer/BoardViewport', () => ({
  BoardViewport: ({
    selectableTargets,
    showKeyboardTargetControls,
    showRobberAttention,
    showTargetPulses,
    progressCardFlyovers = [],
    onSelect,
  }: BoardViewportProps) => {
    const firstVertex = selectableTargets.find((target) => target.kind === 'VERTEX');
    const distinctTargets = [
      ...new Map(
        selectableTargets.map((target) => [`${target.kind}:${target.id}`, target] as const),
      ).values(),
    ];
    return (
      <section
        aria-label="Territory board"
        data-keyboard-target-controls={String(showKeyboardTargetControls)}
        data-robber-attention={String(showRobberAttention)}
        data-target-pulses={String(showTargetPulses)}
      >
        <output data-testid="app-progress-card-flyovers">
          {progressCardFlyovers.map(
            (flyover) =>
              `${flyover.source.kind === 'DECK' ? flyover.source.family : 'PLAYER'}:${flyover.targetPlayerId}|`,
          )}
        </output>
        {selectableTargets[0] === undefined ? null : (
          <button type="button" onClick={() => onSelect(selectableTargets[0]!)}>
            Place first legal target
          </button>
        )}
        {firstVertex === undefined ? null : (
          <button type="button" onClick={() => onSelect(firstVertex)}>
            Place first legal vertex target
          </button>
        )}
        {distinctTargets.map((target) => (
          <button
            key={`${target.kind}:${target.id}`}
            type="button"
            onClick={() => onSelect(target, { x: 500, y: 300 })}
          >
            Select board target {target.kind} {target.id}
          </button>
        ))}
      </section>
    );
  },
}));

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

async function addPlayer(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /add local player/i }));
  const dialog = screen.getByRole('dialog', { name: /add local player/i });
  const nameInput = within(dialog).getByLabelText(/display name/i);
  await user.clear(nameInput);
  await user.type(nameInput, name);
  await user.click(within(dialog).getByRole('button', { name: 'Add player' }));
}

function randomForTotal(total: number) {
  for (let candidate = 0; candidate < 10_000; candidate += 1) {
    const state = createRandomState(`ui-dice-${total}-${candidate}`);
    const first = randomInteger(state, 1, 7);
    const second = randomInteger(first.state, 1, 7);
    if (first.value + second.value === total) return state;
  }
  throw new Error(`Could not find deterministic dice total ${total}.`);
}

describe('application flow', () => {
  beforeEach(() => {
    resetAppStoreForTests();
  });
  afterEach(cleanup);

  it('opens and dismisses settings from the main menu', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    const timerSounds = screen.getByRole('checkbox', { name: /Timer warning sounds/i });
    expect(timerSounds).toBeChecked();
    await user.click(timerSounds);
    expect(useAppStore.getState().settings.timerSounds).toBe(false);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('creates two players and initializes a match through the engine', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Local game' }));
    expect(screen.getByRole('heading', { name: 'Territory Lobby' })).toBeInTheDocument();
    expect(screen.getByText(/0 of 2 seats filled/)).toBeInTheDocument();

    await addPlayer('Alex');
    await addPlayer('Sam');

    expect(screen.getByText('Lobby ready')).toBeInTheDocument();
    const startButton = screen.getByRole('button', { name: 'Start game' });
    expect(startButton).toBeEnabled();
    await user.click(startButton);

    expect(screen.getByText('Place a house')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Territory board' })).toBeInTheDocument();
    const matchSidebar = screen.getByRole('complementary', { name: 'Players and match state' });
    expect(matchSidebar).toHaveTextContent('Alex');
    expect(matchSidebar).toHaveTextContent('Sam');
    expect(screen.getByRole('heading', { name: 'Game log' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bank' })).toBeInTheDocument();

    const actionBar = screen.getByRole('navigation', { name: 'Turn actions' });
    expect(
      within(actionBar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Trade', 'Buy Progress card', 'Buy Road', 'Buy House', 'Buy City', 'End Turn']);
    const cityButton = within(actionBar).getByRole('button', { name: 'Buy City' });
    expect(cityButton.querySelectorAll('.purchase-cost-card')).toHaveLength(5);
    expect(cityButton.querySelectorAll('.purchase-cost-card strong')).toHaveLength(0);

    const adminButton = screen.getByRole('button', {
      name: 'Enable developer mode with 99 goods, every Progress Card, and no robber',
    });
    expect(adminButton).toHaveAttribute('aria-pressed', 'false');
    await user.click(adminButton);
    expect(screen.getByRole('button', { name: 'Disable admin mode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const adminState = useAppStore.getState().gameState;
    const activePlayerId = adminState?.turn.activePlayerId;
    if (
      adminState === null ||
      adminState === undefined ||
      activePlayerId === null ||
      activePlayerId === undefined
    ) {
      throw new Error('Admin resource grant had no active player.');
    }
    expect(adminState.players[activePlayerId]?.resources).toEqual({
      [RESOURCE_IDS.wood]: 99,
      [RESOURCE_IDS.brick]: 99,
      [RESOURCE_IDS.grain]: 99,
      [RESOURCE_IDS.livestock]: 99,
      [RESOURCE_IDS.ore]: 99,
    });
    expect(screen.getByText(/Developer mode enabled/)).toHaveTextContent(
      'one of every Progress Card, and robber rolls are ignored',
    );
    await user.click(screen.getByRole('button', { name: 'Disable admin mode' }));
    expect(
      screen.getByRole('button', {
        name: 'Enable developer mode with 99 goods, every Progress Card, and no robber',
      }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/Developer mode disabled/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Debug IDs' }));
    expect(screen.getByText('19H · 54V · 72E')).toBeInTheDocument();
    expect(screen.getByText('25/25')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lobby' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Return to lobby?' })).getByRole('button', {
        name: 'Return to lobby',
      }),
    );
    expect(screen.getByRole('heading', { name: 'Territory Lobby' })).toBeInTheDocument();
    expect(
      screen.getByText('2 of 2 seats filled · Turn order randomizes at start'),
    ).toBeInTheDocument();
  });

  it('opens the avatar gallery from a local guest portrait and saves the profile', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Local game' }));
    await addPlayer('Alex');
    await addPlayer('Sam');

    await user.click(screen.getByRole('button', { name: 'Open profile gallery for Alex' }));
    const gallery = screen.getByRole('dialog', { name: 'Alex’s profile' });
    expect(
      within(gallery).getByRole('button', { name: 'Choose Cartographer profile picture' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(within(gallery).getAllByRole('button', { name: /profile picture$/ })).toHaveLength(8);
    expect(within(gallery).getAllByRole('button', { name: /^Choose / })).toHaveLength(22);

    await user.click(
      within(gallery).getByRole('button', { name: 'Choose Courier profile picture' }),
    );
    await user.click(within(gallery).getByRole('button', { name: 'Choose Emerald' }));
    await user.click(within(gallery).getByRole('button', { name: 'Use this profile' }));

    expect(useAppStore.getState().lobby.players[0]).toMatchObject({
      name: 'Alex',
      avatarId: 'courier',
      colorId: 'emerald',
    });
    expect(screen.queryByRole('dialog', { name: 'Alex’s profile' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Alex profile picture: Courier')).toBeInTheDocument();
  });

  it('configures functional room rules and advanced match limits from the lobby', async () => {
    const user = userEvent.setup();
    renderApp('/lobby');

    expect(screen.getAllByRole('button', { name: /^Select .+$/ })).toHaveLength(6);
    const randomMap = screen.getByRole('button', { name: 'Select Random map' });
    expect(within(randomMap).getByText('?')).toBeInTheDocument();
    expect(randomMap).toHaveTextContent('Picks one existing map when the match starts');
    await user.click(randomMap);
    expect(useAppStore.getState().lobby.mapId).toBe(RANDOM_MAP_ID);
    expect(screen.getByText('19 tiles · 9 ports')).toBeInTheDocument();
    expect(screen.getByText('30 tiles · 11 ports')).toBeInTheDocument();
    expect(screen.getByText('37 tiles · 12 ports')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next maps' }));
    expect(screen.getByText('81 tiles · 27 ports · 7 islands')).toBeInTheDocument();
    expect(screen.getByText('144 tiles · 25 ports')).toBeInTheDocument();
    expect(screen.getByText('63 tiles · 20 ports · 3 islands')).toBeInTheDocument();
    expect(screen.getByText('24 tiles · 9 ports · 1 lake')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next maps' }));
    expect(screen.getByText('43 tiles · 14 ports · 4 lakes')).toBeInTheDocument();
    expect(screen.getByText('39 tiles · 9 ports · 4 lakes')).toBeInTheDocument();
    expect(screen.getByText('24 tiles · 8 ports · 1 lake')).toBeInTheDocument();
    expect(screen.getByText('42 tiles · 12 ports · 1 lake')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous maps' }));
    await user.click(screen.getByRole('button', { name: 'Select USA' }));
    expect(useAppStore.getState().lobby.mapId).toBe('usa');

    expect(screen.getByRole('slider', { name: 'Points to win' })).toHaveValue('10');
    expect(screen.getByRole('slider', { name: 'Card discard limit' })).toHaveValue('7');
    for (const label of [
      'Hide Bank Cards',
      'Friendly Robber',
      'Balanced Dice',
      "Inventor's Madness",
    ]) {
      const toggle = screen.getByRole('button', { name: label });
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      const tooltip = within(toggle).getByRole('tooltip');
      expect(toggle).toHaveAttribute('aria-describedby', tooltip.id);
      expect(tooltip).toHaveTextContent('Click to turn this room rule on.');
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(within(toggle).getByRole('tooltip')).toHaveTextContent(
        'Click to turn this room rule off.',
      );
    }
    await user.click(screen.getByRole('button', { name: 'Increase Points to win' }));
    await user.click(screen.getByRole('button', { name: 'Increase Card discard limit' }));

    expect(useAppStore.getState().lobby).toMatchObject({
      victoryTarget: 11,
      discardThreshold: 8,
      hideBankCards: true,
      friendlyRobber: true,
      balancedDice: true,
      inventorsMadness: true,
    });
  });

  it('completes a two-player setup through board selections', async () => {
    const user = userEvent.setup();
    renderApp('/lobby');
    await addPlayer('Alex');
    await addPlayer('Sam');
    await user.click(screen.getByRole('button', { name: 'Start game' }));

    expect(screen.getByText(/Placement 1\/4/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Territory board' })).toHaveAttribute(
      'data-keyboard-target-controls',
      'false',
    );
    for (let action = 0; action < 8; action += 1) {
      await user.click(screen.getByRole('button', { name: 'Place first legal target' }));
    }

    expect(screen.getByText('Waiting for roll')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Territory board' })).toHaveAttribute(
      'data-keyboard-target-controls',
      'true',
    );
    expect(screen.queryByText(/Placement \d\/4/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roll dice' })).toBeInTheDocument();

    const setupState = useAppStore.getState().gameState;
    if (setupState === null) throw new Error('Setup did not retain a game state.');
    act(() => useAppStore.setState({ gameState: { ...setupState, random: randomForTotal(8) } }));
    await user.click(screen.getByRole('button', { name: 'Roll dice' }));

    expect(screen.getByText('Action phase')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dice result:/ })).toBeInTheDocument();
    expect(screen.getByText(/^Roll 8:/)).toBeInTheDocument();

    const actionState = useAppStore.getState().gameState;
    const actorId = actionState?.turn.activePlayerId;
    if (
      actionState === null ||
      actionState === undefined ||
      actorId === null ||
      actorId === undefined
    ) {
      throw new Error('Roll did not retain an active action-phase player.');
    }
    act(() =>
      useAppStore.setState({
        gameState: {
          ...actionState,
          players: {
            ...actionState.players,
            [actorId]: {
              ...actionState.players[actorId]!,
              resources: resourceBundle([
                [RESOURCE_IDS.wood, 2],
                [RESOURCE_IDS.brick, 2],
              ]),
            },
          },
        },
      }),
    );

    const resourceHand = screen.getByLabelText('Resource cards');
    expect(within(resourceHand).getByLabelText('Wood: 2 cards')).toBeInTheDocument();
    expect(within(resourceHand).getByLabelText('Brick: 2 cards')).toBeInTheDocument();
    expect(within(resourceHand).queryByLabelText(/^Grain:/)).not.toBeInTheDocument();
    expect(within(resourceHand).queryByLabelText(/^Livestock:/)).not.toBeInTheDocument();
    expect(within(resourceHand).queryByLabelText(/^Ore:/)).not.toBeInTheDocument();
    expect(resourceHand.querySelectorAll('.resource-card-stack__layer')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Place first legal vertex target' }));
    const directCityMenu = screen.getByRole('dialog', { name: 'Build City' });
    expect(within(directCityMenu).getByRole('button', { name: 'Build City' })).toBeDisabled();
    expect(directCityMenu.querySelectorAll('.purchase-cost-card')).toHaveLength(5);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Place first legal target' }));
    const directBuildMenu = screen.getByRole('dialog', { name: 'Build Road' });
    expect(within(directBuildMenu).getByRole('button', { name: 'Build Road' })).toBeEnabled();
    expect(directBuildMenu.querySelectorAll('.purchase-cost-card')).toHaveLength(2);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Build Road' })).not.toBeInTheDocument();

    const roadButton = screen.getByRole('button', { name: 'Buy Road' });
    await user.click(roadButton);
    expect(screen.getByText(/Choose a glowing edge for the new road/)).toBeInTheDocument();
    expect(roadButton).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Escape}');
    expect(roadButton).toHaveAttribute('aria-pressed', 'false');

    await user.click(roadButton);
    await user.click(screen.getByRole('button', { name: 'Place first legal target' }));
    expect(screen.getAllByText(/built a road/).length).toBeGreaterThan(0);
    expect(useAppStore.getState().recentGameEvents.map((event) => event.type)).toEqual([
      'RESOURCES_SPENT',
      'ROAD_BUILT',
    ]);
    expect(roadButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Place first legal target' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Place first legal target' }));
    const secondDirectBuildMenu = screen.getByRole('dialog', { name: 'Build Road' });
    await user.click(within(secondDirectBuildMenu).getByRole('button', { name: 'Build Road' }));
    expect(roadButton).toHaveAttribute('aria-pressed', 'false');
    expect(roadButton).toBeDisabled();
    expect(useAppStore.getState().gameState?.players[actorId]?.resources).toMatchObject({
      wood: 0,
      brick: 0,
    });
    await user.click(screen.getByRole('button', { name: 'End Turn' }));
    expect(screen.getByText('Waiting for roll')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roll dice' })).toBeInTheDocument();
  });

  it('prevents a duplicate player name in the editor', async () => {
    const user = userEvent.setup();
    renderApp('/lobby');
    await addPlayer('Alex');

    await user.click(screen.getByRole('button', { name: /add local player/i }));
    const dialog = screen.getByRole('dialog', { name: /add local player/i });
    const input = within(dialog).getByLabelText(/display name/i);
    await user.clear(input);
    await user.type(input, 'aLeX');

    expect(within(dialog).getByText('That name is already in the lobby.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add player' })).toBeDisabled();
  });

  it('uses simple game-piece scenes for the mode choices', () => {
    renderApp('/lobby');

    const classic = screen.getByRole('button', { name: 'Select Classic mode' });
    expect(classic.querySelectorAll('.lobby-room-mode-piece--house-rear')).toHaveLength(1);
    expect(classic.querySelectorAll('.lobby-room-mode-piece--house-front')).toHaveLength(1);
    expect(classic.querySelector('.lobby-room-mode-robber')).not.toBeNull();

    const kn = screen.getByRole('button', { name: 'Select K+N mode' });
    expect(kn.querySelector('.lobby-room-mode-piece--city')).not.toBeNull();
    expect(kn.querySelector('.lobby-room-mode-piece--wall')).not.toBeNull();
    expect(kn.querySelectorAll('.lobby-room-mode-knight')).toHaveLength(2);
    expect(kn.querySelector('.lobby-room-mode-art__board')).toBeNull();
  });

  it('keeps K+N turns moving without device handoffs or automatic card explanations', async () => {
    const user = userEvent.setup();
    renderApp('/lobby');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Game mode' }), KN_MODE.id);
    await addPlayer('Alex');
    await addPlayer('Sam');
    await user.click(screen.getByRole('button', { name: 'Start game' }));

    const initial = useAppStore.getState().gameState;
    const activePlayerId = initial?.turn.activePlayerId;
    if (
      initial === null ||
      initial.kn === null ||
      activePlayerId === null ||
      activePlayerId === undefined
    ) {
      throw new Error('K+N privacy fixture did not initialize.');
    }
    const kn = initial.kn;
    const actionBar = screen.getByRole('navigation', { name: 'Turn actions' });
    expect(
      within(actionBar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Trade', 'Buy City Wall', 'Buy Road', 'Buy House', 'Buy City', 'End Turn']);
    const knControls = screen.getByRole('region', { name: 'K+N actions' });
    expect(within(knControls).getByRole('button', { name: 'Knight actions' })).toBeInTheDocument();
    expect(
      within(knControls).getByRole('button', { name: 'City improvements' }),
    ).toBeInTheDocument();
    expect(document.querySelector('.dice-panel--kn')).toBeInTheDocument();
    expect(screen.getByLabelText(/spaces until the barbarian attack/)).toBeInTheDocument();
    expect(document.querySelector('.game-player-list--kn')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Pass to / })).not.toBeInTheDocument();
    act(() =>
      useAppStore.setState({
        gameState: {
          ...initial,
          kn: {
            ...kn,
            attackSummary: {
              barbarianStrength: 2,
              defenderStrength: 1,
              contributions: { [activePlayerId]: 1 },
              defended: false,
              defenderAwardPlayerId: null,
              affectedPlayerIds: [activePlayerId],
            },
          },
        },
      }),
    );
    expect(screen.queryByText('The barbarians broke through')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue resolution' })).not.toBeInTheDocument();

    const connectedEdge = Object.values(initial.board.edges)[0];
    if (connectedEdge === undefined) throw new Error('K+N Knight placement fixture has no edge.');
    act(() =>
      useAppStore.setState({
        gameState: {
          ...initial,
          players: {
            ...initial.players,
            [activePlayerId]: {
              ...initial.players[activePlayerId]!,
              resources: resourceBundle([
                [RESOURCE_IDS.livestock, 1],
                [RESOURCE_IDS.ore, 1],
              ]),
            },
          },
          board: {
            ...initial.board,
            edges: {
              ...initial.board.edges,
              [connectedEdge.id]: { ...connectedEdge, roadOwnerId: activePlayerId },
            },
          },
          turn: {
            ...initial.turn,
            phase: 'ACTION_PHASE',
            dice: [2, 3],
            setupPlacementIndex: null,
            setupPlacementVertexId: null,
          },
          pendingInteraction: null,
        },
      }),
    );

    const knightActions = screen.getByRole('button', { name: 'Knight actions' });
    await user.click(knightActions);
    expect(within(knControls).getByRole('button', { name: /Build Knight/ })).toBeInTheDocument();
    expect(within(knControls).getByRole('button', { name: /Activate Knight/ })).toBeInTheDocument();
    expect(within(knControls).getByRole('button', { name: /Upgrade Knight/ })).toBeInTheDocument();
    expect(within(knControls).getByRole('button', { name: /Move Knight/ })).toBeInTheDocument();
    await user.click(knightActions);
    const improvements = screen.getByRole('button', { name: 'City improvements' });
    await user.click(improvements);
    expect(within(knControls).getByRole('button', { name: /Science/ })).toBeInTheDocument();
    expect(within(knControls).getByRole('button', { name: /Trade/ })).toBeInTheDocument();
    expect(within(knControls).getByRole('button', { name: /Politics/ })).toBeInTheDocument();
    await user.click(improvements);

    await user.click(screen.getByRole('button', { name: 'Place first legal vertex target' }));
    const knightBuildMenu = screen.getByRole('dialog', {
      name: 'Build on this board location',
    });
    await user.click(within(knightBuildMenu).getByRole('button', { name: 'Build Basic Knight' }));
    expect(useAppStore.getState().gameState?.players[activePlayerId]?.knights).toHaveLength(1);
    expect(
      screen.queryByRole('dialog', { name: 'Build on this board location' }),
    ).not.toBeInTheDocument();

    const builtKnight = useAppStore.getState().gameState?.players[activePlayerId]?.knights[0];
    if (builtKnight === undefined) throw new Error('The board purchase did not create a Knight.');
    act(() => {
      const current = useAppStore.getState().gameState;
      if (current === null) return;
      useAppStore.setState({
        gameState: {
          ...current,
          players: {
            ...current.players,
            [activePlayerId]: {
              ...current.players[activePlayerId]!,
              resources: resourceBundle([
                [RESOURCE_IDS.grain, 1],
                [RESOURCE_IDS.livestock, 1],
                [RESOURCE_IDS.ore, 1],
              ]),
            },
          },
        },
      });
    });

    await user.click(screen.getByRole('button', { name: 'Knight actions' }));
    const quickBuildKnight = within(knControls).getByRole('button', { name: 'Build Knight' });
    await user.click(quickBuildKnight);
    expect(quickBuildKnight).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Place Basic Knight')).not.toBeInTheDocument();
    await user.click(quickBuildKnight);
    expect(quickBuildKnight).toHaveAttribute('aria-pressed', 'false');

    const quickActivateKnight = within(knControls).getByRole('button', {
      name: 'Activate Knight',
    });
    await user.click(quickActivateKnight);
    expect(quickActivateKnight).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.kn-piece-picker')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Territory board' })).toHaveAttribute(
      'data-target-pulses',
      'true',
    );
    await user.click(
      screen.getByRole('button', {
        name: `Select board target VERTEX ${builtKnight.vertexId}`,
      }),
    );
    expect(useAppStore.getState().gameState?.players[activePlayerId]?.knights[0]?.active).toBe(
      true,
    );
    expect(document.querySelector('.board-barbarian-tracker__stat--defense')).toHaveClass(
      'is-advantaged',
    );

    await user.click(
      screen.getByRole('button', {
        name: `Select board target VERTEX ${builtKnight.vertexId}`,
      }),
    );
    const activeKnightMenu = screen.getByRole('dialog', {
      name: 'Level 1 active Knight actions',
    });
    expect(within(activeKnightMenu).getByRole('button', { name: 'Upgrade' })).toBeInTheDocument();
    expect(within(activeKnightMenu).queryByRole('button', { name: 'Move' })).toBeNull();
    expect(within(activeKnightMenu).queryByRole('button', { name: 'Activate' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Close Knight menu' }));

    act(() => {
      const current = useAppStore.getState().gameState;
      const robberHexId = current?.board.vertices[builtKnight.vertexId]?.adjacentHexIds[0];
      if (current?.kn === null || current?.kn === undefined || robberHexId === undefined) return;
      useAppStore.setState({
        gameState: {
          ...current,
          players: {
            ...current.players,
            [activePlayerId]: {
              ...current.players[activePlayerId]!,
              knights: current.players[activePlayerId]!.knights.map((knight) =>
                knight.id === builtKnight.id
                  ? {
                      ...knight,
                      active: true,
                      activeSinceTurn: current.turn.turnNumber - 1,
                      lastActionTurn: null,
                    }
                  : knight,
              ),
            },
          },
          board: { ...current.board, robberHexId },
          kn: { ...current.kn, firstBarbarianAttackResolved: true },
        },
      });
    });
    await user.click(
      screen.getByRole('button', {
        name: `Select board target VERTEX ${builtKnight.vertexId}`,
      }),
    );
    const robberKnightMenu = screen.getByRole('dialog', {
      name: 'Level 1 active Knight actions',
    });
    const moveKnight = within(robberKnightMenu).getByRole('button', { name: 'Move' });
    expect(moveKnight).toBeEnabled();
    await user.click(moveKnight);
    await user.click(
      screen.getByRole('button', {
        name: `Select board target VERTEX ${builtKnight.vertexId}`,
      }),
    );
    expect(useAppStore.getState().gameState?.turn.phase).toBe('MOVE_ROBBER');
    expect(useAppStore.getState().gameState?.pendingInteraction).toMatchObject({
      type: 'MOVE_ROBBER',
      sourceKnightId: builtKnight.id,
    });

    const improvementVertex = Object.values(initial.board.vertices).find(
      (vertex) => vertex.id !== builtKnight.vertexId,
    );
    if (improvementVertex === undefined) throw new Error('No City improvement fixture vertex.');
    act(() => {
      const current = useAppStore.getState().gameState;
      if (current === null) return;
      useAppStore.setState({
        gameState: {
          ...current,
          turn: { ...current.turn, phase: 'ACTION_PHASE' },
          pendingInteraction: null,
          players: {
            ...current.players,
            [activePlayerId]: {
              ...current.players[activePlayerId]!,
              commodities: resourceBundle([[COMMODITY_IDS.paper, 1]]),
            },
          },
          board: {
            ...current.board,
            vertices: {
              ...current.board.vertices,
              [improvementVertex.id]: {
                ...current.board.vertices[improvementVertex.id]!,
                building: { ownerId: activePlayerId, type: 'MANSION' },
              },
            },
          },
        },
      });
    });
    await user.click(screen.getByRole('button', { name: 'City improvements' }));
    await user.click(within(knControls).getByRole('button', { name: 'Buy Science improvement' }));
    expect(
      within(knControls).getByRole('button', { name: 'Buy Science improvement' }),
    ).toHaveTextContent('Level 1');

    act(() => {
      const current = useAppStore.getState().gameState;
      if (current?.kn === null || current?.kn === undefined) return;
      useAppStore.setState({
        gameState: {
          ...current,
          players: {
            ...current.players,
            [activePlayerId]: {
              ...current.players[activePlayerId]!,
              cityImprovements: { SCIENCE: 3, TRADE: 4, POLITICS: 0 },
              commodities: resourceBundle([[COMMODITY_IDS.paper, 4]]),
            },
          },
          board: {
            ...current.board,
            vertices: {
              ...current.board.vertices,
              [improvementVertex.id]: {
                ...current.board.vertices[improvementVertex.id]!,
                building: {
                  ownerId: activePlayerId,
                  type: 'MANSION',
                  metropolis: 'TRADE',
                },
              },
            },
          },
          kn: {
            ...current.kn,
            metropolisOwners: { ...current.kn.metropolisOwners, TRADE: activePlayerId },
          },
        },
      });
    });
    await user.click(within(knControls).getByRole('button', { name: 'Buy Science improvement' }));
    expect(within(knControls).getByRole('alert')).toHaveTextContent(
      'An eligible City is required to claim this Metropolis.',
    );
    expect(
      within(knControls).getByRole('button', { name: 'Buy Science improvement' }),
    ).toBeInTheDocument();

    const metropolisVertexId = Object.values(initial.board.vertices)[0]?.id;
    const merchantHexId = Object.values(initial.board.hexes).find(
      (hex) => hex.resourceId !== null,
    )?.id;
    if (metropolisVertexId === undefined || merchantHexId === undefined) {
      throw new Error('K+N board-choice fixture is incomplete.');
    }
    act(() =>
      useAppStore.setState({
        gameState: {
          ...initial,
          turn: {
            ...initial.turn,
            phase: 'CARD_RESOLUTION',
            setupPlacementIndex: null,
            setupPlacementVertexId: null,
          },
          pendingInteraction: {
            type: 'KN_SELECTION',
            playerId: activePlayerId,
            purpose: 'METROPOLIS_CITY',
            eligibleIds: [metropolisVertexId],
            minimumSelections: 1,
            maximumSelections: 1,
            queue: [activePlayerId],
            canCancel: false,
            context: { track: 'SCIENCE' },
          },
        },
      }),
    );
    expect(
      screen
        .getByText(
          `${initial.players[activePlayerId]?.name ?? 'A player'} is choosing a Metropolis City`,
        )
        .closest('.turn-timer-wrap'),
    ).toBeInTheDocument();

    act(() =>
      useAppStore.setState({
        gameState: {
          ...initial,
          turn: {
            ...initial.turn,
            phase: 'CARD_RESOLUTION',
            setupPlacementIndex: null,
            setupPlacementVertexId: null,
          },
          pendingInteraction: {
            type: 'KN_SELECTION',
            playerId: activePlayerId,
            purpose: 'MERCHANT_HEX',
            eligibleIds: [merchantHexId],
            minimumSelections: 1,
            maximumSelections: 1,
            queue: [activePlayerId],
            canCancel: true,
            context: {},
          },
        },
      }),
    );
    expect(screen.getByRole('region', { name: 'Territory board' })).toHaveAttribute(
      'data-robber-attention',
      'false',
    );

    const opponent = Object.values(initial.players).find((player) => player.id !== activePlayerId);
    const card = Object.values(kn.progressCards).find((candidate) => {
      const definition = getKNProgressCardDefinition(candidate.definitionId);
      return definition !== undefined && definition.revealedVictoryPoints === 0;
    });
    const definition =
      card === undefined ? undefined : getKNProgressCardDefinition(card.definitionId);
    if (opponent === undefined || card === undefined || definition === undefined) {
      throw new Error('K+N private draw fixture is incomplete.');
    }

    act(() =>
      useAppStore.setState({
        gameState: {
          ...initial,
          players: {
            ...initial.players,
            [opponent.id]: {
              ...opponent,
              knProgressCardIds: [...opponent.knProgressCardIds, card.instanceId],
            },
          },
          kn: {
            ...kn,
            progressCards: {
              ...kn.progressCards,
              [card.instanceId]: {
                ...card,
                ownerId: opponent.id,
                drawnTurn: initial.turn.turnNumber,
              },
            },
          },
        },
        recentGameEvents: [
          {
            type: 'KN_PROGRESS_CARD_DRAWN',
            playerId: opponent.id,
            family: definition.family,
            cardInstanceId: card.instanceId,
            revealed: false,
          },
        ],
      }),
    );

    expect(screen.queryByRole('dialog', { name: /Pass to / })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Your Progress Card' })).not.toBeInTheDocument();
    expect(screen.getByTestId('app-progress-card-flyovers')).toBeEmptyDOMElement();
  });

  it('opens a fresh lobby each time Local game is selected from the menu', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Local game' }));
    await addPlayer('Alex');
    await user.click(screen.getByRole('button', { name: /main menu/i }));
    await user.click(screen.getByRole('button', { name: 'Local game' }));

    expect(screen.getByText(/0 of 2 seats filled/)).toBeInTheDocument();
    expect(screen.queryByText('Alex')).not.toBeInTheDocument();
  });
});
