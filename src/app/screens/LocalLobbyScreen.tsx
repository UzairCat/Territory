import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  AVAILABLE_MAPS,
  AVAILABLE_MODES,
  LOBBY_SIZES,
  validateLobby,
  type LocalLobbyPlayer,
} from '../lobby/lobby-model';
import { useAppStore } from '../stores/app-store';
import type { PlayerCount } from '../../engine/content/types';
import type { PlayerId } from '../../engine/core/ids';
import { Button } from '../../ui/components/Button';
import { Modal } from '../../ui/components/Modal';
import { Panel } from '../../ui/components/Panel';
import { PlayerEditorModal } from '../../ui/lobby/PlayerEditorModal';
import { PlayerSlot } from '../../ui/lobby/PlayerSlot';

export function LocalLobbyScreen() {
  const navigate = useNavigate();
  const lobby = useAppStore((state) => state.lobby);
  const setLobbyMap = useAppStore((state) => state.setLobbyMap);
  const setLobbyMode = useAppStore((state) => state.setLobbyMode);
  const setLobbySeed = useAppStore((state) => state.setLobbySeed);
  const randomizeLobbySeed = useAppStore((state) => state.randomizeLobbySeed);
  const confirmLobbyResize = useAppStore((state) => state.confirmLobbyResize);
  const addLobbyPlayer = useAppStore((state) => state.addLobbyPlayer);
  const editLobbyPlayer = useAppStore((state) => state.editLobbyPlayer);
  const removeLobbyPlayer = useAppStore((state) => state.removeLobbyPlayer);
  const beginGame = useAppStore((state) => state.beginGame);
  const clearGame = useAppStore((state) => state.clearGame);
  const openSettings = useAppStore((state) => state.openSettings);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState<PlayerId | null>(null);
  const [pendingSize, setPendingSize] = useState<PlayerCount | null>(null);
  const [startFailure, setStartFailure] = useState<readonly string[]>([]);
  const lobbyIssues = useMemo(() => validateLobby(lobby), [lobby]);
  const editingPlayer = lobby.players.find((player) => player.id === editingPlayerId) ?? null;

  const openAddPlayer = () => {
    setEditingPlayerId(null);
    setEditorOpen(true);
  };

  const openEditPlayer = (player: LocalLobbyPlayer) => {
    setEditingPlayerId(player.id);
    setEditorOpen(true);
  };

  const closePlayerEditor = () => {
    setEditorOpen(false);
    setEditingPlayerId(null);
  };

  return (
    <main className="lobby-screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Local game</p>
          <h1>Territory Lobby</h1>
        </div>
        <div className="screen-header__actions">
          <Button variant="ghost" onClick={openSettings}>
            Settings
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              clearGame();
              void navigate('/');
            }}
          >
            ← Main menu
          </Button>
        </div>
      </header>

      <div className="lobby-layout">
        <Panel className="lobby-settings" aria-labelledby="game-settings-title">
          <div className="panel__heading">
            <span className="panel__number">01</span>
            <div>
              <h2 id="game-settings-title">Game settings</h2>
              <p>Configure the match foundation.</p>
            </div>
          </div>

          <div className="settings-grid">
            <label className="field" htmlFor="map-select">
              <span>Map</span>
              <select
                id="map-select"
                value={lobby.mapId}
                onChange={(event) => {
                  const map = AVAILABLE_MAPS.find((entry) => entry.id === event.target.value);
                  if (map !== undefined) setLobbyMap(map.id);
                }}
              >
                {AVAILABLE_MAPS.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="field" htmlFor="mode-select">
              <span>Game mode</span>
              <select
                id="mode-select"
                value={lobby.modeId}
                onChange={(event) => {
                  const mode = AVAILABLE_MODES.find((entry) => entry.id === event.target.value);
                  if (mode !== undefined) setLobbyMode(mode.id);
                }}
              >
                {AVAILABLE_MODES.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.displayName}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="segmented-field">
              <legend>Lobby size</legend>
              <div className="segmented-control">
                {LOBBY_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={lobby.size === size}
                    onClick={() => {
                      if (size < lobby.players.length) setPendingSize(size);
                      else confirmLobbyResize(size);
                    }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="field">
              <label htmlFor="seed-input">Match seed</label>
              <div className="inline-field">
                <input
                  id="seed-input"
                  value={lobby.seed}
                  maxLength={100}
                  spellCheck="false"
                  onChange={(event) => setLobbySeed(event.target.value)}
                />
                <Button variant="ghost" onClick={randomizeLobbySeed}>
                  Randomize
                </Button>
              </div>
              <small>Keep this value to reproduce the same match.</small>
            </div>
          </div>
        </Panel>

        <Panel className="lobby-players" aria-labelledby="players-title">
          <div className="panel__heading">
            <span className="panel__number">02</span>
            <div>
              <h2 id="players-title">Players</h2>
              <p>
                {lobby.players.length} of {lobby.size} seats filled · Turn order randomizes at start
              </p>
            </div>
          </div>

          <ol className="player-list">
            {Array.from({ length: lobby.size }, (_, index) => {
              const player = lobby.players[index] ?? null;
              return (
                <PlayerSlot
                  key={player?.id ?? `empty-${index}`}
                  index={index}
                  player={player}
                  canAdd={player === null && index === lobby.players.length}
                  onAdd={openAddPlayer}
                  onEdit={openEditPlayer}
                  onRemove={(entry) => removeLobbyPlayer(entry.id)}
                />
              );
            })}
          </ol>

          <div className="lobby-start">
            <div className="lobby-validation" aria-live="polite">
              {lobbyIssues.length === 0 ? (
                <p className="validation-ready">Lobby ready</p>
              ) : (
                <ul>
                  {lobbyIssues.map((issue) => (
                    <li key={issue.code}>{issue.message}</li>
                  ))}
                </ul>
              )}
              {startFailure.length === 0 ? null : (
                <ul className="form-errors">
                  {startFailure.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              variant="primary"
              disabled={lobbyIssues.length > 0}
              onClick={() => {
                const result = beginGame();
                if (result.ok) void navigate('/game');
                else setStartFailure(result.issues.map((issue) => issue.message));
              }}
            >
              Start game
            </Button>
          </div>
        </Panel>
      </div>

      <PlayerEditorModal
        open={editorOpen}
        player={editingPlayer}
        players={lobby.players}
        onClose={closePlayerEditor}
        onSave={(name, colorId) => {
          if (editingPlayer === null) addLobbyPlayer(name, colorId);
          else editLobbyPlayer(editingPlayer.id, name, colorId);
          closePlayerEditor();
        }}
      />

      <Modal
        open={pendingSize !== null}
        title="Reduce lobby size?"
        description="Players outside the new lobby size will be removed."
        onClose={() => setPendingSize(null)}
      >
        <p>
          Changing to {pendingSize ?? lobby.size} players removes{' '}
          {Math.max(0, lobby.players.length - (pendingSize ?? lobby.size))} from the end of the
          order.
        </p>
        <footer className="modal__actions">
          <Button variant="ghost" data-modal-autofocus onClick={() => setPendingSize(null)}>
            Keep current size
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (pendingSize !== null) confirmLobbyResize(pendingSize);
              setPendingSize(null);
            }}
          >
            Remove players
          </Button>
        </footer>
      </Modal>
    </main>
  );
}
