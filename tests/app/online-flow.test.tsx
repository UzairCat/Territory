// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
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
    expect(await screen.findByRole('heading', { name: 'Territory Lobby' })).toBeInTheDocument();
    expect(screen.getAllByText('NEW234').length).toBeGreaterThan(0);
  });

  it('renders a host room with open seats, editable settings, and paged map previews', async () => {
    const user = userEvent.setup();
    const hostId = playerId('online-host');
    const settings = createDefaultLobby('online-ui-seed');
    const { players: _players, ...lobbySettings } = settings;
    expect(_players).toEqual([]);
    const updateSettings = vi.fn(() => Promise.resolve(true));
    const updateProfile = vi.fn(() => Promise.resolve(true));
    useOnlineStore.setState({
      connection: 'CONNECTED',
      credentials: { roomCode: 'ABC234', playerId: hostId, resumeToken: 'x'.repeat(32) },
      updateSettings,
      updateProfile,
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
    expect(screen.getByRole('main')).toHaveClass('lobby-screen--room', 'online-lobby-room');
    expect(screen.getByRole('heading', { name: 'Territory Lobby' })).toBeInTheDocument();
    expect(screen.getAllByText('ABC234').length).toBeGreaterThan(0);
    expect(screen.getByText('Alex (You)')).toBeInTheDocument();
    expect(screen.getByText('Open seat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start online match' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Map' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Select Classic mode' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Select Base - Small' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Open profile gallery for Alex' }));
    const gallery = screen.getByRole('dialog', { name: 'Alex’s profile' });
    expect(within(gallery).getAllByRole('button', { name: /profile picture$/ })).toHaveLength(8);
    expect(within(gallery).getByRole('button', { name: 'Choose Onyx' })).toBeEnabled();
    await user.click(
      within(gallery).getByRole('button', { name: 'Choose Navigator profile picture' }),
    );
    await user.click(within(gallery).getByRole('button', { name: 'Choose Onyx' }));
    await user.click(within(gallery).getByRole('button', { name: 'Use this profile' }));
    expect(updateProfile).toHaveBeenCalledWith({ avatarId: 'navigator', colorId: 'onyx' });

    await user.click(screen.getByRole('button', { name: 'Select K+N mode' }));
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ modeId: 'k-n', victoryTarget: 13 }),
    );

    await user.click(screen.getByRole('button', { name: 'Next maps' }));
    expect(screen.getByRole('button', { name: 'Select Earth' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Select Base - Small' })).not.toBeInTheDocument();
  });

  it('shows live room state while locking match controls for a guest', () => {
    const hostId = playerId('online-party-leader');
    const guestId = playerId('online-guest');
    const { players: _players, ...settings } = createDefaultLobby('online-guest-seed');
    expect(_players).toEqual([]);
    useOnlineStore.setState({
      connection: 'RECONNECTING',
      credentials: { roomCode: 'GUEST2', playerId: guestId, resumeToken: 'g'.repeat(32) },
      room: {
        protocolVersion: 1,
        code: 'GUEST2',
        phase: 'LOBBY',
        viewerPlayerId: guestId,
        hostPlayerId: hostId,
        players: [
          {
            id: hostId,
            name: 'Morgan',
            colorId: colorId('cobalt'),
            connected: false,
            host: true,
          },
          {
            id: guestId,
            name: 'Alex',
            colorId: colorId('crimson'),
            connected: true,
            host: false,
          },
        ],
        settings,
        game: null,
      },
    });

    renderApp('/online/GUEST2');
    expect(screen.getByRole('heading', { name: 'Room settings' })).toBeInTheDocument();
    expect(screen.getByText('Morgan is party leader')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Game mode' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Map' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select Classic mode' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hide Bank Cards' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Points to win' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Start online match' })).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for host…')).toBeInTheDocument();
  });
});
