import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

import { TERRAINS } from '../../engine/content/resources';
import type { PlayerCount } from '../../engine/content/types';
import type { PlayerId } from '../../engine/core/ids';
import { Button } from '../../ui/components/Button';
import { Modal } from '../../ui/components/Modal';
import { Panel } from '../../ui/components/Panel';
import { PlayerEditorModal } from '../../ui/lobby/PlayerEditorModal';
import { PlayerSlot } from '../../ui/lobby/PlayerSlot';
import {
  AVAILABLE_MAPS,
  AVAILABLE_MODES,
  LOBBY_SIZES,
  validateLobby,
  type LobbyRuleKey,
  type LocalLobbyPlayer,
} from '../lobby/lobby-model';
import { useAppStore } from '../stores/app-store';

const TURN_TIMES = [30, 45, 60, 90, 120, 180, 300] as const;

const LOBBY_RULES: readonly {
  readonly key: LobbyRuleKey;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
}[] = [
  {
    key: 'hideBankCards',
    label: 'Hide Bank Cards',
    description: 'Keep the exact resource and commodity supply private.',
    icon: '▧',
  },
  {
    key: 'friendlyRobber',
    label: 'Friendly Robber',
    description: 'Protect opponents below 3 public victory points.',
    icon: '♟',
  },
  {
    key: 'balancedDice',
    label: 'Balanced Dice',
    description: 'Use a managed roll deck with fewer repeated totals.',
    icon: '⚄',
  },
];

interface LobbyStepperProps {
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly onChange: (value: number) => void;
}

function LobbyStepper({ label, value, minimum, maximum, onChange }: LobbyStepperProps) {
  return (
    <div className="lobby-room-stepper">
      <div>
        <strong>{label}</strong>
        <output aria-label={`${label}: ${value}`}>{value}</output>
      </div>
      <div className="lobby-room-stepper__controls">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= minimum}
          onClick={() => onChange(Math.max(minimum, value - 1))}
        >
          ‹
        </button>
        <input
          type="range"
          aria-label={label}
          min={minimum}
          max={maximum}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= maximum}
          onClick={() => onChange(Math.min(maximum, value + 1))}
        >
          ›
        </button>
      </div>
      <small>
        {minimum}–{maximum}
      </small>
    </div>
  );
}

function formatTurnTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

export function LocalLobbyScreen() {
  const navigate = useNavigate();
  const lobby = useAppStore((state) => state.lobby);
  const setLobbyMap = useAppStore((state) => state.setLobbyMap);
  const setLobbyMode = useAppStore((state) => state.setLobbyMode);
  const setLobbySeed = useAppStore((state) => state.setLobbySeed);
  const setLobbyTurnTime = useAppStore((state) => state.setLobbyTurnTime);
  const setLobbyVictoryTarget = useAppStore((state) => state.setLobbyVictoryTarget);
  const setLobbyDiscardThreshold = useAppStore((state) => state.setLobbyDiscardThreshold);
  const setLobbyRule = useAppStore((state) => state.setLobbyRule);
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
  const selectedMode = AVAILABLE_MODES.find((mode) => mode.id === lobby.modeId);
  const selectedMap = AVAILABLE_MAPS.find((map) => map.id === lobby.mapId);
  const turnTimeIndex = Math.max(
    0,
    TURN_TIMES.findIndex((seconds) => seconds === lobby.turnTimeSeconds),
  );

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

  const requestLobbySize = (size: PlayerCount) => {
    if (size < lobby.players.length) setPendingSize(size);
    else confirmLobbyResize(size);
  };

  return (
    <main className="lobby-screen lobby-screen--room">
      <header className="lobby-room-header">
        <button
          type="button"
          className="lobby-room-brand"
          aria-label="Return to main menu"
          onClick={() => {
            clearGame();
            void navigate('/');
          }}
        >
          <span aria-hidden="true">T</span>
          <b>Territory</b>
        </button>
        <div className="lobby-room-title">
          <small>Local match room</small>
          <h1>Territory Lobby</h1>
          <span>
            {selectedMode?.displayName ?? 'Game'} · {selectedMap?.displayName ?? 'Map'}
          </span>
        </div>
        <div className="lobby-room-header__actions">
          <span className="lobby-room-status">
            <i aria-hidden="true" /> {lobby.players.length}/{lobby.size} seated
          </span>
          <Button variant="ghost" onClick={openSettings}>
            ⚙ Settings
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              clearGame();
              void navigate('/');
            }}
          >
            × Exit
          </Button>
        </div>
      </header>

      <div className="lobby-room-layout">
        <Panel className="lobby-room-players" aria-labelledby="players-title">
          <header className="lobby-room-section-title">
            <div>
              <small>Seats</small>
              <h2 id="players-title">
                Players{' '}
                <span>
                  ({lobby.players.length}/{lobby.size})
                </span>
              </h2>
            </div>
            <span className="lobby-room-ready-dot" title="Local room" aria-label="Local room">
              ●
            </span>
          </header>
          <p className="lobby-room-player-summary">
            {lobby.players.length} of {lobby.size} seats filled · Turn order randomizes at start
          </p>
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
          <aside className="lobby-room-host-card">
            <span aria-hidden="true">♛</span>
            <div>
              <strong>Party leader controls</strong>
              <small>Configure the room, start the match, and pause play.</small>
            </div>
          </aside>
        </Panel>

        <Panel className="lobby-room-config" aria-labelledby="room-config-title">
          <header className="lobby-room-config__heading">
            <div>
              <small>Match setup</small>
              <h2 id="room-config-title">Build your table</h2>
            </div>
            <span>{lobby.seed.slice(-8).toLocaleUpperCase()}</span>
          </header>

          <section className="lobby-room-choice-section" aria-labelledby="game-mode-title">
            <div className="lobby-room-choice-heading">
              <h3 id="game-mode-title">Game mode</h3>
              <p>{selectedMode?.description}</p>
            </div>
            <select
              className="visually-hidden"
              aria-label="Game mode"
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
            <div className="lobby-room-mode-grid">
              {AVAILABLE_MODES.map((mode) => {
                const selected = lobby.modeId === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    className={`lobby-room-mode-card lobby-room-mode-card--${mode.kind.toLocaleLowerCase()} ${selected ? 'is-selected' : ''}`}
                    aria-label={`Select ${mode.displayName} mode`}
                    aria-pressed={selected}
                    onClick={() => setLobbyMode(mode.id)}
                  >
                    <span className="lobby-room-mode-art" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      {mode.kind === 'K_N' ? <b>♞</b> : null}
                    </span>
                    <strong>{mode.displayName}</strong>
                    <small>
                      {mode.kind === 'K_N'
                        ? 'Cities, Knights & commodities'
                        : 'The original Territory rules'}
                    </small>
                    {selected ? <em>Selected</em> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="lobby-room-choice-section" aria-labelledby="map-title">
            <div className="lobby-room-choice-heading">
              <h3 id="map-title">Map</h3>
              <p>Choose the board layout for this match.</p>
            </div>
            <select
              className="visually-hidden"
              aria-label="Map"
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
            <div className="lobby-room-map-grid">
              {AVAILABLE_MAPS.map((map) => {
                const selected = map.id === lobby.mapId;
                return (
                  <button
                    key={map.id}
                    type="button"
                    className={`lobby-room-map-card ${selected ? 'is-selected' : ''}`}
                    aria-label={`Select ${map.displayName}`}
                    aria-pressed={selected}
                    onClick={() => setLobbyMap(map.id)}
                  >
                    <span className="lobby-map-preview" aria-hidden="true">
                      {map.coordinates.map((coordinate, index) => {
                        const terrainId = map.terrainPool[index % map.terrainPool.length];
                        const terrain = TERRAINS.find((entry) => entry.id === terrainId);
                        return (
                          <i
                            key={`${coordinate.q}:${coordinate.r}`}
                            style={
                              {
                                left: `calc(50% + ${coordinate.q * 17 + coordinate.r * 8.5}px)`,
                                top: `calc(50% + ${coordinate.r * 14.5}px)`,
                                '--lobby-hex-color': terrain?.color ?? '#77715f',
                              } as CSSProperties
                            }
                          />
                        );
                      })}
                    </span>
                    <span>
                      <strong>{map.displayName}</strong>
                      <small>
                        {map.coordinates.length} tiles · {map.portPool.length} ports
                      </small>
                    </span>
                    {selected ? <em>✓</em> : null}
                  </button>
                );
              })}
              <div className="lobby-room-map-card lobby-room-map-card--coming" aria-hidden="true">
                <span className="lobby-map-preview lobby-map-preview--coming">＋</span>
                <span>
                  <strong>More maps</strong>
                  <small>New layouts can slot in here</small>
                </span>
              </div>
            </div>
          </section>

          <section className="lobby-room-choice-section" aria-labelledby="rules-title">
            <div className="lobby-room-choice-heading">
              <h3 id="rules-title">Rules</h3>
              <p>Click a tile to toggle it for this room.</p>
            </div>
            <div className="lobby-room-rule-grid">
              {LOBBY_RULES.map((rule) => {
                const enabled = lobby[rule.key];
                return (
                  <button
                    key={rule.key}
                    type="button"
                    className={enabled ? 'is-selected' : ''}
                    aria-label={rule.label}
                    aria-pressed={enabled}
                    title={rule.description}
                    onClick={() => setLobbyRule(rule.key, !enabled)}
                  >
                    <span aria-hidden="true">{rule.icon}</span>
                    <strong>{rule.label}</strong>
                    <small>{enabled ? 'On' : 'Off'}</small>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="lobby-room-advanced" aria-labelledby="advanced-title">
            <div className="lobby-room-choice-heading">
              <h3 id="advanced-title">Advanced settings</h3>
              <p>Fine-tune the table before the first placement.</p>
            </div>
            <div className="lobby-room-advanced-grid">
              <div className="lobby-room-stepper">
                <div>
                  <strong>Turn timer</strong>
                  <output aria-label={`Turn timer: ${formatTurnTime(lobby.turnTimeSeconds)}`}>
                    {formatTurnTime(lobby.turnTimeSeconds)}
                  </output>
                </div>
                <div className="lobby-room-stepper__controls lobby-room-stepper__controls--compact">
                  <button
                    type="button"
                    aria-label="Decrease Turn timer"
                    disabled={turnTimeIndex === 0}
                    onClick={() => setLobbyTurnTime(TURN_TIMES[Math.max(0, turnTimeIndex - 1)]!)}
                  >
                    ‹
                  </button>
                  <span>
                    {TURN_TIMES.map((_, index) => (
                      <i key={index} className={index === turnTimeIndex ? 'is-active' : ''} />
                    ))}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase Turn timer"
                    disabled={turnTimeIndex === TURN_TIMES.length - 1}
                    onClick={() =>
                      setLobbyTurnTime(
                        TURN_TIMES[Math.min(TURN_TIMES.length - 1, turnTimeIndex + 1)]!,
                      )
                    }
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="lobby-room-stepper">
                <div>
                  <strong>Players</strong>
                  <output aria-label={`Players: ${lobby.size}`}>{lobby.size}</output>
                </div>
                <div className="lobby-room-stepper__controls lobby-room-stepper__controls--compact">
                  <button
                    type="button"
                    aria-label="Decrease Players"
                    disabled={lobby.size === LOBBY_SIZES[0]}
                    onClick={() => requestLobbySize((lobby.size - 1) as PlayerCount)}
                  >
                    ‹
                  </button>
                  <span className="lobby-room-seat-dots" aria-hidden="true">
                    {LOBBY_SIZES.map((size) => (
                      <i key={size} className={size === lobby.size ? 'is-active' : ''} />
                    ))}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase Players"
                    disabled={lobby.size === LOBBY_SIZES.at(-1)}
                    onClick={() => requestLobbySize((lobby.size + 1) as PlayerCount)}
                  >
                    ›
                  </button>
                </div>
              </div>

              <LobbyStepper
                label="Points to win"
                value={lobby.victoryTarget}
                minimum={3}
                maximum={26}
                onChange={setLobbyVictoryTarget}
              />
              <LobbyStepper
                label="Card discard limit"
                value={lobby.discardThreshold}
                minimum={5}
                maximum={20}
                onChange={setLobbyDiscardThreshold}
              />
            </div>
          </section>

          <section className="lobby-room-seed" aria-labelledby="seed-label">
            <div>
              <strong id="seed-label">Match seed</strong>
              <small>Share this value to reproduce the same board.</small>
            </div>
            <input
              aria-labelledby="seed-label"
              value={lobby.seed}
              maxLength={100}
              spellCheck="false"
              onChange={(event) => setLobbySeed(event.target.value)}
            />
            <Button variant="ghost" onClick={randomizeLobbySeed}>
              Randomize
            </Button>
          </section>

          <footer className="lobby-room-start">
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
            <div className="lobby-room-start__summary">
              <span>{selectedMode?.displayName}</span>
              <b>First to {lobby.victoryTarget} VP</b>
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
          </footer>
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
