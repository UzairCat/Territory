// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../../src/app/App';
import { resetAppStoreForTests } from '../../src/app/stores/app-store';

vi.mock('../../src/board-renderer/BoardViewport', () => ({
  BoardViewport: () => <section aria-label="Territory board" />,
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

    expect(screen.getByText('Board ready')).toBeInTheDocument();
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
