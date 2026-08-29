// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../../src/app/App';
import { createDefaultLobby } from '../../src/app/lobby/lobby-model';
import { resetAppStoreForTests } from '../../src/app/stores/app-store';
import { resetOnlineStoreForTests, useOnlineStore } from '../../src/app/stores/online-store';
import { colorId, playerId } from '../../src/engine/core/ids';

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('online entry and lobby presentation', () => {
  beforeEach(() => {
    resetAppStoreForTests();
    resetOnlineStoreForTests();
  });

  afterEach(() => {
    cleanup();
    resetOnlineStoreForTests();
    resetAppStoreForTests();
  });

  it('opens the private-room entry flow and validates its join fields', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Online multiplayer' }));
    expect(screen.getByRole('heading', { name: 'Play Territory Online' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create private room' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join room' })).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Player name'), 'Alex');
    expect(screen.getByRole('button', { name: 'Create private room' })).toBeEnabled();
    await user.type(screen.getByLabelText('Room code'), 'abc234');
    expect(screen.getByLabelText('Room code')).toHaveValue('ABC234');
    expect(screen.getByRole('button', { name: 'Join room' })).toBeEnabled();
  });

  it('enters the private lobby as soon as room creation succeeds', async () => {
    const user = userEvent.setup();
    const hostId = playerId('created-online-host');
    const { players: _players, ...settings } = createDefaultLobby('created-online-room');
    expect(_players).toEqual([]);
    const credentials = {
      roomCode: 'NEW234',
      playerId: hostId,
      resumeToken: 'n'.repeat(32),
    };
    const room = {
      protocolVersion: 1 as const,
      code: 'NEW234',
      phase: 'LOBBY' as const,
      viewerPlayerId: hostId,
      hostPlayerId: hostId,
      players: [
        {
          id: hostId,
          name: 'Alex',
          colorId: colorId('cobalt'),
          connected: true,
          host: true,
        },
      ],
      settings,
      game: null,
    };
    const createRoom = vi.fn(() => {
      useOnlineStore.setState({ connection: 'CONNECTED', credentials, room });
      return Promise.resolve(true);
    });
    useOnlineStore.setState({
      createRoom,
      initialize: vi.fn(() => Promise.resolve(true)),
    });

    renderApp('/online');
    await user.type(screen.getByPlaceholderText('Player name'), 'Alex');
    await user.click(screen.getByRole('button', { name: 'Create private room' }));

    expect(createRoom).toHaveBeenCalledWith('Alex');
    expect(await screen.findByRole('heading', { name: 'Gather your party' })).toBeInTheDocument();
    expect(screen.getByText('NEW234')).toBeInTheDocument();
  });

  it('renders a host room with reconnect status, open seats, and editable settings', () => {
    const hostId = playerId('online-host');
    const settings = createDefaultLobby('online-ui-seed');
    const { players: _players, ...lobbySettings } = settings;
    expect(_players).toEqual([]);
    useOnlineStore.setState({
      connection: 'CONNECTED',
      credentials: { roomCode: 'ABC234', playerId: hostId, resumeToken: 'x'.repeat(32) },
      room: {
        protocolVersion: 1,
        code: 'ABC234',
        phase: 'LOBBY',
        viewerPlayerId: hostId,
        hostPlayerId: hostId,
        players: [
          {
            id: hostId,
            name: 'Alex',
            colorId: colorId('cobalt'),
            connected: true,
            host: true,
          },
        ],
        settings: lobbySettings,
        game: null,
      },
    });

    renderApp('/online/ABC234');
    expect(screen.getByRole('heading', { name: 'Gather your party' })).toBeInTheDocument();
    expect(screen.getByText('ABC234')).toBeInTheDocument();
    expect(screen.getByText('Alex (You)')).toBeInTheDocument();
    expect(screen.getByText('Open seat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start online match' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Map' })).toBeEnabled();
  });
});
