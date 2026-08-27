// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../../src/app/App';
import { resetAppStoreForTests, useAppStore } from '../../src/app/stores/app-store';
import type { BoardViewportProps } from '../../src/board-renderer/BoardViewport';
import { createRandomState, randomInteger } from '../../src/engine/core/random';

vi.mock('../../src/board-renderer/BoardViewport', () => ({
  BoardViewport: ({ selectableTargets, onSelect }: BoardViewportProps) => (
    <section aria-label="Territory board">
      {selectableTargets[0] === undefined ? null : (
        <button type="button" onClick={() => onSelect(selectableTargets[0]!)}>
          Place first legal target
        </button>
      )}
    </section>
  ),
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
  beforeEach(() => resetAppStoreForTests());
  afterEach(cleanup);

  it('opens and dismisses settings from the main menu', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();

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

    await user.click(screen.getByRole('checkbox', { name: 'Debug IDs' }));
    expect(matchSidebar).toHaveTextContent('19H · 54V · 72E');
    expect(matchSidebar).toHaveTextContent('25/25');

    await user.click(screen.getByRole('button', { name: 'Lobby' }));
    expect(screen.getByRole('heading', { name: 'Territory Lobby' })).toBeInTheDocument();
    expect(
      screen.getByText('2 of 2 seats filled · Turn order randomizes at start'),
    ).toBeInTheDocument();
  });

  it('completes a two-player setup through board selections', async () => {
    const user = userEvent.setup();
    renderApp('/lobby');
    await addPlayer('Alex');
    await addPlayer('Sam');
    await user.click(screen.getByRole('button', { name: 'Start game' }));

    expect(screen.getByText(/Placement 1\/4/)).toBeInTheDocument();
    for (let action = 0; action < 8; action += 1) {
      await user.click(screen.getByRole('button', { name: 'Place first legal target' }));
    }

    expect(screen.getByText('Waiting for roll')).toBeInTheDocument();
    expect(screen.queryByText(/Placement \d\/4/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roll dice' })).toBeInTheDocument();

    const setupState = useAppStore.getState().gameState;
    if (setupState === null) throw new Error('Setup did not retain a game state.');
    act(() => useAppStore.setState({ gameState: { ...setupState, random: randomForTotal(8) } }));
    await user.click(screen.getByRole('button', { name: 'Roll dice' }));

    expect(screen.getByText('Action phase')).toBeInTheDocument();
    expect(screen.getByLabelText('Dice total')).toHaveTextContent('Total 8');
    expect(screen.getByText(/^Roll 8:/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'End turn' }));
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
