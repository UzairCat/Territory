import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { PLAYER_COLORS } from '../../engine/content/colors';
import { KN_MODE } from '../../engine/modes/kn';
import { Button } from '../../ui/components/Button';
import { AVAILABLE_MAPS, AVAILABLE_MODES, LOBBY_SIZES, RANDOM_MAP_ID } from '../lobby/lobby-model';
import { useOnlineStore } from '../stores/online-store';

const TURN_TIMES = [30, 45, 60, 90, 120, 180, 300] as const;

export function OnlineLobbyScreen() {
  const navigate = useNavigate();
  const { roomCode } = useParams();
  const room = useOnlineStore((state) => state.room);
  const credentials = useOnlineStore((state) => state.credentials);
  const connection = useOnlineStore((state) => state.connection);
  const error = useOnlineStore((state) => state.error);
  const commandPending = useOnlineStore((state) => state.commandPending);
  const initialize = useOnlineStore((state) => state.initialize);
  const updateSettings = useOnlineStore((state) => state.updateSettings);
  const startMatch = useOnlineStore((state) => state.startMatch);
  const leaveRoom = useOnlineStore((state) => state.leaveRoom);

  useEffect(() => {
    if (room === null) void initialize();
  }, [initialize, room]);

  if (room?.game !== null && room?.game !== undefined) return <Navigate to="/game" replace />;

  if (room === null) {
    return (
      <main className="online-lobby-screen online-lobby-screen--loading">
        <section>
          <span className="online-loader" aria-hidden="true" />
          <h1>Rejoining room {roomCode?.toUpperCase() ?? ''}</h1>
          <p>{error?.message ?? 'Restoring your private seat…'}</p>
          <Button variant="secondary" onClick={() => void navigate('/online')}>
            Back to online menu
          </Button>
        </section>
      </main>
    );
  }

  if (roomCode !== undefined && room.code !== roomCode.toUpperCase()) {
    return <Navigate to={`/online/${room.code}`} replace />;
  }

  const viewerIsHost = room.viewerPlayerId === room.hostPlayerId;
  const settings = room.settings;
  const full = room.players.length === settings.size;
  const allConnected = room.players.every((player) => player.connected);
  const selectedMode = AVAILABLE_MODES.find((mode) => mode.id === settings.modeId);

  const changeSettings = (patch: Partial<typeof settings>) => {
    if (!viewerIsHost || commandPending) return;
    void updateSettings({ ...settings, ...patch });
  };

  return (
    <main className="online-lobby-screen">
      <header className="online-lobby-header">
        <button type="button" className="online-lobby-brand" onClick={() => void navigate('/')}>
          <span aria-hidden="true">T</span>
          <b>Territory</b>
        </button>
        <div>
          <span className={`online-connection-dot is-${connection.toLocaleLowerCase()}`} />
          {connection === 'CONNECTED' ? 'Connected' : 'Reconnecting'}
        </div>
        <Button
          variant="ghost"
          onClick={() =>
            void leaveRoom().then(() => {
              void navigate('/online');
            })
          }
        >
          Leave room
        </Button>
      </header>

      <section className="online-room-hero">
        <div>
          <p className="eyebrow">Private online lobby</p>
          <h1>Gather your party</h1>
          <p>
            Share this room code. Your seat is protected for 90 seconds if your connection drops.
          </p>
        </div>
        <button
          type="button"
          className="online-room-code"
          title="Copy room code"
          onClick={() => void globalThis.navigator.clipboard?.writeText(room.code)}
        >
          <small>Room code</small>
          <strong>{room.code}</strong>
          <span>Copy</span>
        </button>
      </section>

      <div className="online-lobby-layout">
        <aside className="online-seat-panel" aria-labelledby="online-players-title">
          <header>
            <div>
              <p className="eyebrow">Players</p>
              <h2 id="online-players-title">
                Seats {room.players.length}/{settings.size}
              </h2>
            </div>
          </header>
          <ol>
            {Array.from({ length: settings.size }, (_, index) => {
              const player = room.players[index];
              if (player === undefined) {
                return (
                  <li key={`open-${index}`} className="online-seat online-seat--open">
                    <span>+</span>
                    <div>
                      <strong>Open seat</strong>
                      <small>Waiting for player…</small>
                    </div>
                  </li>
                );
              }
              const color = PLAYER_COLORS.find((candidate) => candidate.id === player.colorId);
              return (
                <li
                  key={player.id}
                  className={`online-seat ${player.id === room.viewerPlayerId ? 'is-you' : ''}`}
                  style={{ '--seat-color': color?.hex ?? '#ffffff' } as React.CSSProperties}
                >
                  <span className="online-seat__avatar" aria-hidden="true">
                    {player.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>
                      {player.name} {player.id === room.viewerPlayerId ? '(You)' : ''}
                    </strong>
                    <small>
                      {player.host ? 'Host · ' : ''}
                      {player.connected ? 'Ready' : 'Reconnecting'}
                    </small>
                  </div>
                  <i className={player.connected ? 'is-online' : ''} />
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="online-room-settings" aria-labelledby="online-settings-title">
          <header>
            <div>
              <p className="eyebrow">Match setup</p>
              <h2 id="online-settings-title">
                {viewerIsHost ? 'Build the room' : 'Host settings'}
              </h2>
            </div>
            {!viewerIsHost ? <span>Only the host can edit</span> : null}
          </header>

          <fieldset disabled={!viewerIsHost || commandPending}>
            <legend>Game mode</legend>
            <div className="online-mode-options">
              {AVAILABLE_MODES.map((mode) => (
                <button
                  type="button"
                  key={mode.id}
                  className={settings.modeId === mode.id ? 'is-selected' : ''}
                  onClick={() =>
                    changeSettings({
                      modeId: mode.id,
                      victoryTarget: mode.id === KN_MODE.id ? 13 : 10,
                    })
                  }
                >
                  <span aria-hidden="true">{mode.id === KN_MODE.id ? '♞' : '⌂'}</span>
                  <strong>{mode.displayName}</strong>
                  <small>
                    {mode.id === KN_MODE.id ? 'Cities, Knights & commodities' : 'Classic Territory'}
                  </small>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="online-setting-grid">
            <label>
              <span>Map</span>
              <select
                disabled={!viewerIsHost || commandPending}
                value={settings.mapId}
                onChange={(event) =>
                  changeSettings({ mapId: event.target.value as typeof settings.mapId })
                }
              >
                <option value={RANDOM_MAP_ID}>Random map</option>
                {AVAILABLE_MAPS.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.displayName} · {map.coordinates.length} tiles
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Seats</span>
              <select
                disabled={!viewerIsHost || commandPending}
                value={settings.size}
                onChange={(event) =>
                  changeSettings({ size: Number(event.target.value) as 2 | 3 | 4 })
                }
              >
                {LOBBY_SIZES.map((size) => (
                  <option key={size} value={size} disabled={size < room.players.length}>
                    {size} players
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Turn timer</span>
              <select
                disabled={!viewerIsHost || commandPending}
                value={settings.turnTimeSeconds}
                onChange={(event) =>
                  changeSettings({ turnTimeSeconds: Number(event.target.value) })
                }
              >
                {TURN_TIMES.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds < 60
                      ? `${seconds} seconds`
                      : `${seconds / 60} minute${seconds === 60 ? '' : 's'}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Points to win: {settings.victoryTarget}</span>
              <input
                disabled={!viewerIsHost || commandPending}
                type="range"
                min={3}
                max={26}
                value={settings.victoryTarget}
                onChange={(event) => changeSettings({ victoryTarget: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>Discard limit: {settings.discardThreshold}</span>
              <input
                disabled={!viewerIsHost || commandPending}
                type="range"
                min={5}
                max={20}
                value={settings.discardThreshold}
                onChange={(event) =>
                  changeSettings({ discardThreshold: Number(event.target.value) })
                }
              />
            </label>
          </div>

          <fieldset disabled={!viewerIsHost || commandPending}>
            <legend>Optional rules</legend>
            <div className="online-rule-options">
              {(
                [
                  ['hideBankCards', 'Hide Bank Cards', 'Keep exact bank quantities private.'],
                  ['friendlyRobber', 'Friendly Robber', 'Protect players below 3 VP.'],
                  ['balancedDice', 'Balanced Dice', 'Use the managed ideal-roll deck.'],
                  [
                    'inventorsMadness',
                    "Inventor's Madness",
                    'Swap two telegraphed number tokens each round.',
                  ],
                ] as const
              ).map(([key, label, description]) => (
                <label key={key} className={settings[key] ? 'is-selected' : ''}>
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(event) => changeSettings({ [key]: event.target.checked })}
                  />
                  <span aria-hidden="true">✓</span>
                  <div>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          <footer>
            <div>
              <strong>
                {selectedMode?.displayName ?? 'Territory'} · {settings.victoryTarget} VP
              </strong>
              <small>
                {!full
                  ? `Waiting for ${settings.size - room.players.length} more player${settings.size - room.players.length === 1 ? '' : 's'}`
                  : !allConnected
                    ? 'Waiting for every player to reconnect'
                    : 'All players are ready'}
              </small>
            </div>
            {viewerIsHost ? (
              <Button
                variant="primary"
                disabled={!full || !allConnected || commandPending}
                onClick={() => void startMatch()}
              >
                Start online match
              </Button>
            ) : (
              <span className="online-waiting-host">Waiting for host…</span>
            )}
          </footer>
          {error === null ? null : (
            <p className="online-error" role="alert">
              {error.message}
            </p>
          )}
        </section>
      </div>
      {credentials === null ? null : <span className="visually-hidden">Online seat active</span>}
    </main>
  );
}
