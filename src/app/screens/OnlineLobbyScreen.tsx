import { useEffect, useState, type CSSProperties } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { PLAYER_COLORS } from '../../engine/content/colors';
import { TERRAINS } from '../../engine/content/resources';
import type { MapDefinition } from '../../engine/content/types';
import type { MapId } from '../../engine/core/ids';
import { getMapPortPlacements } from '../../engine/maps/map-utils';
import { Button } from '../../ui/components/Button';
import { Panel } from '../../ui/components/Panel';
import { PlayerAvatar } from '../../ui/components/PlayerAvatar';
import { CityActionIcon, HouseActionIcon, WallActionIcon } from '../../ui/game/ActionArtwork';
import { ProfileGalleryModal } from '../../ui/lobby/ProfileGalleryModal';
import {
  AVAILABLE_MAPS,
  AVAILABLE_MODES,
  LOBBY_SIZES,
  RANDOM_MAP_ID,
  type LobbyRuleKey,
} from '../lobby/lobby-model';
import { useAppStore } from '../stores/app-store';
import { useOnlineStore } from '../stores/online-store';

const TURN_TIMES = [30, 45, 60, 90, 120, 180, 300] as const;
const MAPS_PER_PAGE = 4;

type LobbyMapOption =
  | {
      readonly kind: 'RANDOM';
      readonly id: MapId;
      readonly displayName: 'Random';
    }
  | {
      readonly kind: 'MAP';
      readonly id: MapId;
      readonly displayName: string;
      readonly map: MapDefinition;
    };

const MAP_OPTIONS: readonly LobbyMapOption[] = [
  { kind: 'RANDOM', id: RANDOM_MAP_ID, displayName: 'Random' },
  ...AVAILABLE_MAPS.map((map): LobbyMapOption => ({
    kind: 'MAP',
    id: map.id,
    displayName: map.displayName,
    map,
  })),
];

const MAP_PREVIEW_PORT_OFFSETS = [
  { x: 9, y: -15, rotation: 30 },
  { x: 18, y: 0, rotation: 90 },
  { x: 9, y: 15, rotation: 150 },
  { x: -9, y: 15, rotation: 210 },
  { x: -18, y: 0, rotation: 270 },
  { x: -9, y: -15, rotation: 330 },
] as const;

interface MapPreviewLayout {
  readonly scale: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly tiles: readonly { readonly x: number; readonly y: number }[];
  readonly ports: readonly {
    readonly x: number;
    readonly y: number;
    readonly rotation: number;
  }[];
}

function createMapPreviewLayout(map: MapDefinition): MapPreviewLayout {
  const tiles = map.coordinates.map((coordinate) => ({
    x: (coordinate.q + coordinate.r / 2) * 17,
    y: coordinate.r * 14.5,
  }));
  const placements = getMapPortPlacements(map);
  const ports = placements.map((placement) => {
    const coordinateIndex = map.coordinates.findIndex(
      (coordinate) =>
        coordinate.q === placement.coordinate.q && coordinate.r === placement.coordinate.r,
    );
    const tile = tiles[coordinateIndex];
    const offset = MAP_PREVIEW_PORT_OFFSETS[placement.edgeIndex];
    if (tile === undefined || offset === undefined) {
      throw new Error(`Cannot preview a port on ${map.displayName}.`);
    }
    return {
      x: tile.x + offset.x,
      y: tile.y + offset.y,
      rotation: offset.rotation,
    };
  });
  const extentPoints = [...tiles, ...ports];
  const minimumX = Math.min(...extentPoints.map((point) => point.x));
  const maximumX = Math.max(...extentPoints.map((point) => point.x));
  const minimumY = Math.min(...extentPoints.map((point) => point.y));
  const maximumY = Math.max(...extentPoints.map((point) => point.y));
  const contentWidth = maximumX - minimumX + 27;
  const contentHeight = maximumY - minimumY + 31;
  return {
    scale: Math.min(1, 142 / contentWidth, 88 / contentHeight),
    centerX: (minimumX + maximumX) / 2,
    centerY: (minimumY + maximumY) / 2,
    tiles,
    ports,
  };
}

const MAP_PREVIEW_LAYOUTS = new Map(
  AVAILABLE_MAPS.map((map) => [map.id, createMapPreviewLayout(map)] as const),
);

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
  {
    key: 'inventorsMadness',
    label: "Inventor's Madness",
    description: 'Telegraph and swap two random number tokens after each full round.',
    icon: '⇄',
  },
];

interface LobbyStepperProps {
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}

function LobbyStepper({ label, value, minimum, maximum, disabled, onChange }: LobbyStepperProps) {
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
          disabled={disabled || value <= minimum}
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
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={disabled || value >= maximum}
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

function createOnlineSeed(): string {
  const suffix =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `online-${suffix}`;
}

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
  const updateProfile = useOnlineStore((state) => state.updateProfile);
  const startMatch = useOnlineStore((state) => state.startMatch);
  const leaveRoom = useOnlineStore((state) => state.leaveRoom);
  const openSettings = useAppStore((state) => state.openSettings);
  const [mapPageOverride, setMapPage] = useState<number | null>(null);
  const [profileGalleryOpen, setProfileGalleryOpen] = useState(false);

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
  const controlsDisabled = !viewerIsHost || commandPending;
  const full = room.players.length === settings.size;
  const connectedPlayers = room.players.filter((player) => player.connected).length;
  const allConnected = room.players.every((player) => player.connected);
  const hostPlayer = room.players.find((player) => player.id === room.hostPlayerId);
  const viewerPlayer = room.players.find((player) => player.id === room.viewerPlayerId);
  const selectedMode = AVAILABLE_MODES.find((mode) => mode.id === settings.modeId);
  const selectedMapOption = MAP_OPTIONS.find((option) => option.id === settings.mapId);
  const turnTimeIndex = Math.max(
    0,
    TURN_TIMES.findIndex((seconds) => seconds === settings.turnTimeSeconds),
  );
  const sizeIndex = Math.max(
    0,
    LOBBY_SIZES.findIndex((size) => size === settings.size),
  );
  const previousSize = LOBBY_SIZES[sizeIndex - 1];
  const nextSize = LOBBY_SIZES[sizeIndex + 1];
  const mapPageCount = Math.max(1, Math.ceil(MAP_OPTIONS.length / MAPS_PER_PAGE));
  const selectedMapIndex = Math.max(
    0,
    MAP_OPTIONS.findIndex((option) => option.id === settings.mapId),
  );
  const selectedMapPage = Math.floor(selectedMapIndex / MAPS_PER_PAGE);
  const mapPage = Math.min(mapPageCount - 1, mapPageOverride ?? selectedMapPage);
  const visibleMapOptions = MAP_OPTIONS.slice(
    mapPage * MAPS_PER_PAGE,
    mapPage * MAPS_PER_PAGE + MAPS_PER_PAGE,
  );
  const connectionLabel =
    connection === 'CONNECTED'
      ? 'Connected'
      : connection === 'RECONNECTING'
        ? 'Reconnecting'
        : 'Connecting';

  const changeSettings = (patch: Partial<typeof settings>) => {
    if (controlsDisabled) return;
    void updateSettings({ ...settings, ...patch });
  };

  const exitRoom = (destination: '/' | '/online') => {
    void leaveRoom().then(() => {
      void navigate(destination);
    });
  };

  const copyRoomCode = () => {
    void globalThis.navigator.clipboard?.writeText(room.code);
  };

  const commitSeed = (input: HTMLInputElement) => {
    const normalized = input.value.trim();
    if (normalized.length === 0) {
      input.value = settings.seed;
      return;
    }
    if (normalized !== settings.seed) changeSettings({ seed: normalized });
  };

  return (
    <main className="lobby-screen lobby-screen--room online-lobby-room">
      <header className="lobby-room-header">
        <button
          type="button"
          className="lobby-room-brand"
          aria-label="Leave room and return to main menu"
          onClick={() => exitRoom('/')}
        >
          <span aria-hidden="true">T</span>
          <b>Territory</b>
        </button>
        <div className="lobby-room-title">
          <small>Private online room</small>
          <h1>Territory Lobby</h1>
          <span>
            Room {room.code} · {selectedMode?.displayName ?? 'Game'} ·{' '}
            {selectedMapOption?.displayName ?? 'Map'}
          </span>
        </div>
        <div className="lobby-room-header__actions">
          <span
            className={`lobby-room-status ${connection === 'CONNECTED' ? '' : 'is-reconnecting'}`}
          >
            <i aria-hidden="true" /> {connectionLabel}
          </span>
          <Button
            className="online-lobby-room-code"
            variant="ghost"
            title="Copy room code"
            onClick={copyRoomCode}
          >
            <span>{room.code}</span> Copy
          </Button>
          <Button variant="ghost" onClick={openSettings}>
            ⚙ Settings
          </Button>
          <Button variant="ghost" onClick={() => exitRoom('/online')}>
            × Leave
          </Button>
        </div>
      </header>

      <div className="lobby-room-layout">
        <Panel as="aside" className="lobby-room-players" aria-labelledby="online-players-title">
          <header className="lobby-room-section-title">
            <div>
              <small>Seats</small>
              <h2 id="online-players-title">
                Players{' '}
                <span>
                  ({room.players.length}/{settings.size})
                </span>
              </h2>
            </div>
            <span
              className={`lobby-room-ready-dot ${allConnected ? '' : 'is-reconnecting'}`}
              title={`${connectedPlayers} players connected`}
              aria-label={`${connectedPlayers} players connected`}
            >
              ●
            </span>
          </header>
          <p className="lobby-room-player-summary">
            {connectedPlayers}/{settings.size} connected · Share room code {room.code}
          </p>
          <ol className="player-list">
            {Array.from({ length: settings.size }, (_, index) => {
              const player = room.players[index];
              if (player === undefined) {
                return (
                  <li key={`open-${index}`} className="player-slot player-slot--empty">
                    <span className="player-slot__number">{index + 1}</span>
                    <span className="player-slot__identity">
                      <strong>Open seat</strong>
                      <small>Waiting for a player to join…</small>
                    </span>
                  </li>
                );
              }
              const color = PLAYER_COLORS.find((candidate) => candidate.id === player.colorId);
              const isViewer = player.id === room.viewerPlayerId;
              return (
                <li
                  key={player.id}
                  className={`player-slot online-player-slot ${isViewer ? 'is-you' : ''} ${player.connected ? '' : 'is-disconnected'}`}
                  style={{ '--seat-color': color?.hex ?? '#ffffff' } as CSSProperties}
                >
                  <span className="player-slot__number">{index + 1}</span>
                  <PlayerAvatar
                    className="lobby-slot-avatar"
                    playerName={player.name}
                    avatarId={player.avatarId}
                    editable={isViewer}
                    {...(isViewer ? { onOpenGallery: () => setProfileGalleryOpen(true) } : {})}
                  />
                  <span className="player-slot__identity">
                    <strong>
                      {player.name} {isViewer ? '(You)' : ''}
                    </strong>
                    <small>
                      {color?.displayName ?? 'Player'} {player.host ? '· Party leader' : ''}
                    </small>
                  </span>
                  <span
                    className={`online-player-presence ${player.connected ? 'is-online' : 'is-reconnecting'}`}
                  >
                    <i aria-hidden="true" /> {player.connected ? 'Ready' : 'Reconnecting'}
                  </span>
                </li>
              );
            })}
          </ol>
          <aside className="lobby-room-host-card">
            <span aria-hidden="true">♛</span>
            <div>
              <strong>
                {viewerIsHost
                  ? 'Party leader controls'
                  : `${hostPlayer?.name ?? 'The host'} is party leader`}
              </strong>
              <small>
                {viewerIsHost
                  ? 'Configure the room, start the match, and pause play.'
                  : 'Room changes appear here live while the party leader configures the table.'}
              </small>
            </div>
          </aside>
        </Panel>

        <Panel className="lobby-room-config" aria-labelledby="online-room-config-title">
          <header className="lobby-room-config__heading">
            <div>
              <small>Match setup</small>
              <h2 id="online-room-config-title">
                {viewerIsHost ? 'Build your table' : 'Room settings'}
              </h2>
            </div>
            <button
              type="button"
              className="online-lobby-code-chip"
              title="Copy room code"
              onClick={copyRoomCode}
            >
              {commandPending ? 'SAVING…' : room.code}
            </button>
          </header>

          <section className="lobby-room-choice-section" aria-labelledby="online-game-mode-title">
            <div className="lobby-room-choice-heading">
              <h3 id="online-game-mode-title">Game mode</h3>
              <p>{selectedMode?.description}</p>
            </div>
            <select
              className="visually-hidden"
              aria-label="Game mode"
              value={settings.modeId}
              disabled={controlsDisabled}
              onChange={(event) => {
                const mode = AVAILABLE_MODES.find((entry) => entry.id === event.target.value);
                if (mode !== undefined) {
                  changeSettings({ modeId: mode.id, victoryTarget: mode.rules.victoryTarget });
                }
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
                const selected = settings.modeId === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    className={`lobby-room-mode-card lobby-room-mode-card--${mode.kind.toLocaleLowerCase()} ${selected ? 'is-selected' : ''}`}
                    aria-label={`Select ${mode.displayName} mode`}
                    aria-pressed={selected}
                    disabled={controlsDisabled}
                    onClick={() =>
                      changeSettings({
                        modeId: mode.id,
                        victoryTarget: mode.rules.victoryTarget,
                      })
                    }
                  >
                    <span
                      className={`lobby-room-mode-art lobby-room-mode-art--${mode.kind.toLocaleLowerCase()}`}
                      aria-hidden="true"
                    >
                      <span className="lobby-room-mode-art__halo" />
                      <span className="lobby-room-mode-art__surface" />
                      {mode.kind === 'K_N' ? (
                        <>
                          <span className="lobby-room-mode-banners">
                            <i />
                            <i />
                            <i />
                          </span>
                          <span className="lobby-room-mode-piece lobby-room-mode-piece--wall">
                            <WallActionIcon />
                          </span>
                          <span className="lobby-room-mode-piece lobby-room-mode-piece--city">
                            <CityActionIcon />
                          </span>
                          <span className="lobby-room-mode-knight lobby-room-mode-knight--rear">
                            <i />
                            <b />
                          </span>
                          <span className="lobby-room-mode-knight lobby-room-mode-knight--front">
                            <i />
                            <b />
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="lobby-room-mode-piece lobby-room-mode-piece--house-rear">
                            <HouseActionIcon />
                          </span>
                          <span className="lobby-room-mode-piece lobby-room-mode-piece--house-front">
                            <HouseActionIcon />
                          </span>
                          <span className="lobby-room-mode-robber">
                            <i />
                            <b />
                            <em />
                          </span>
                        </>
                      )}
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

          <section className="lobby-room-choice-section" aria-labelledby="online-map-title">
            <div className="lobby-room-choice-heading">
              <h3 id="online-map-title">Map</h3>
              <div className="lobby-map-pagination" aria-label="Map pages">
                <button
                  type="button"
                  aria-label="Previous maps"
                  disabled={mapPage === 0}
                  onClick={() => setMapPage(Math.max(0, mapPage - 1))}
                >
                  ‹
                </button>
                <span>
                  {mapPage + 1}/{mapPageCount}
                </span>
                <button
                  type="button"
                  aria-label="Next maps"
                  disabled={mapPage >= mapPageCount - 1}
                  onClick={() => setMapPage(Math.min(mapPageCount - 1, mapPage + 1))}
                >
                  ›
                </button>
              </div>
            </div>
            <select
              className="visually-hidden"
              aria-label="Map"
              value={settings.mapId}
              disabled={controlsDisabled}
              onChange={(event) => {
                const option = MAP_OPTIONS.find((entry) => entry.id === event.target.value);
                if (option !== undefined) {
                  setMapPage(
                    Math.floor(
                      Math.max(
                        0,
                        MAP_OPTIONS.findIndex((entry) => entry.id === option.id),
                      ) / MAPS_PER_PAGE,
                    ),
                  );
                  changeSettings({ mapId: option.id });
                }
              }}
            >
              {MAP_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.displayName}
                </option>
              ))}
            </select>
            <div className="lobby-room-map-grid" key={mapPage}>
              {visibleMapOptions.map((option) => {
                const selected = option.id === settings.mapId;
                if (option.kind === 'RANDOM') {
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`lobby-room-map-card lobby-room-map-card--random ${selected ? 'is-selected' : ''}`}
                      aria-label="Select Random map"
                      aria-pressed={selected}
                      disabled={controlsDisabled}
                      onClick={() => changeSettings({ mapId: option.id })}
                    >
                      <span
                        className="lobby-map-preview lobby-map-preview--random"
                        aria-hidden="true"
                      >
                        <strong>?</strong>
                      </span>
                      <span>
                        <strong>Random</strong>
                        <small>Picks one existing map when the match starts</small>
                      </span>
                      {selected ? <em>✓</em> : null}
                    </button>
                  );
                }
                const map = option.map;
                const preview = MAP_PREVIEW_LAYOUTS.get(map.id);
                if (preview === undefined) return null;
                return (
                  <button
                    key={map.id}
                    type="button"
                    className={`lobby-room-map-card ${selected ? 'is-selected' : ''}`}
                    aria-label={`Select ${map.displayName}`}
                    aria-pressed={selected}
                    disabled={controlsDisabled}
                    onClick={() => changeSettings({ mapId: map.id })}
                  >
                    <span className="lobby-map-preview" aria-hidden="true">
                      <span className="lobby-map-preview__wash" />
                      <span className="lobby-map-preview__ports">
                        {preview.ports.map((port, index) => (
                          <i
                            key={index}
                            style={
                              {
                                left: `calc(50% + ${(port.x - preview.centerX) * preview.scale}px)`,
                                top: `calc(50% + ${(port.y - preview.centerY) * preview.scale}px)`,
                                '--lobby-port-rotation': `${port.rotation}deg`,
                                '--lobby-map-scale': preview.scale,
                              } as CSSProperties
                            }
                          />
                        ))}
                      </span>
                      <span
                        className="lobby-map-preview__board"
                        data-compact={preview.scale < 0.72 ? 'true' : undefined}
                      >
                        {map.coordinates.map((coordinate, index) => {
                          const terrainId =
                            map.terrainPool[(index * 7 + 3) % map.terrainPool.length];
                          const terrain = TERRAINS.find((entry) => entry.id === terrainId);
                          const token =
                            terrain?.resourceId === null
                              ? null
                              : map.numberTokenPool[index % map.numberTokenPool.length];
                          return (
                            <i
                              key={`${coordinate.q}:${coordinate.r}`}
                              data-terrain={terrain?.id}
                              style={
                                {
                                  left: `calc(50% + ${(preview.tiles[index]!.x - preview.centerX) * preview.scale}px)`,
                                  top: `calc(50% + ${(preview.tiles[index]!.y - preview.centerY) * preview.scale}px)`,
                                  '--lobby-hex-color': terrain?.color ?? '#77715f',
                                  '--lobby-map-scale': preview.scale,
                                } as CSSProperties
                              }
                            >
                              {token === null ? <b>◆</b> : <b>{token}</b>}
                            </i>
                          );
                        })}
                      </span>
                    </span>
                    <span>
                      <strong>{map.displayName}</strong>
                      <small>
                        {map.coordinates.length} tiles · {map.portPool.length} ports
                        {map.landMassCount > 1 ? ` · ${map.landMassCount} islands` : ''}
                        {(map.lakeCount ?? 0) > 0
                          ? ` · ${map.lakeCount} lake${map.lakeCount === 1 ? '' : 's'}`
                          : ''}
                      </small>
                    </span>
                    {selected ? <em>✓</em> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="lobby-room-choice-section" aria-labelledby="online-rules-title">
            <div className="lobby-room-choice-heading">
              <h3 id="online-rules-title">Rules</h3>
              <p>
                {viewerIsHost
                  ? 'Click a tile to toggle it for this room.'
                  : 'Hover for details · Only the party leader can edit.'}
              </p>
            </div>
            <div className="lobby-room-rule-grid">
              {LOBBY_RULES.map((rule) => {
                const enabled = settings[rule.key];
                const tooltipId = `online-lobby-rule-tooltip-${rule.key}`;
                return (
                  <button
                    key={rule.key}
                    type="button"
                    className={enabled ? 'is-selected' : ''}
                    aria-label={rule.label}
                    aria-describedby={tooltipId}
                    aria-pressed={enabled}
                    disabled={controlsDisabled}
                    onClick={() => changeSettings({ [rule.key]: !enabled })}
                  >
                    <span className="lobby-rule-icon" aria-hidden="true">
                      {rule.icon}
                    </span>
                    <strong>{rule.label}</strong>
                    <small className="lobby-rule-state">{enabled ? 'On' : 'Off'}</small>
                    <span id={tooltipId} className="lobby-rule-tooltip" role="tooltip">
                      <span className="lobby-rule-tooltip__heading">
                        <b>{rule.label}</b>
                        <em>{enabled ? 'Enabled' : 'Disabled'}</em>
                      </span>
                      <span>{rule.description}</span>
                      <small>
                        {viewerIsHost
                          ? `Click to turn this room rule ${enabled ? 'off' : 'on'}.`
                          : 'The party leader controls this room rule.'}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="lobby-room-advanced" aria-labelledby="online-advanced-title">
            <div className="lobby-room-choice-heading">
              <h3 id="online-advanced-title">Advanced settings</h3>
              <p>Fine-tune the table before the first placement.</p>
            </div>
            <div className="lobby-room-advanced-grid">
              <div className="lobby-room-stepper">
                <div>
                  <strong>Turn timer</strong>
                  <output aria-label={`Turn timer: ${formatTurnTime(settings.turnTimeSeconds)}`}>
                    {formatTurnTime(settings.turnTimeSeconds)}
                  </output>
                </div>
                <div className="lobby-room-stepper__controls lobby-room-stepper__controls--compact">
                  <button
                    type="button"
                    aria-label="Decrease Turn timer"
                    disabled={controlsDisabled || turnTimeIndex === 0}
                    onClick={() =>
                      changeSettings({
                        turnTimeSeconds: TURN_TIMES[Math.max(0, turnTimeIndex - 1)]!,
                      })
                    }
                  >
                    ‹
                  </button>
                  <span aria-hidden="true">
                    {TURN_TIMES.map((_, index) => (
                      <i key={index} className={index === turnTimeIndex ? 'is-active' : ''} />
                    ))}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase Turn timer"
                    disabled={controlsDisabled || turnTimeIndex === TURN_TIMES.length - 1}
                    onClick={() =>
                      changeSettings({
                        turnTimeSeconds:
                          TURN_TIMES[Math.min(TURN_TIMES.length - 1, turnTimeIndex + 1)]!,
                      })
                    }
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="lobby-room-stepper">
                <div>
                  <strong>Players</strong>
                  <output aria-label={`Players: ${settings.size}`}>{settings.size}</output>
                </div>
                <div className="lobby-room-stepper__controls lobby-room-stepper__controls--compact">
                  <button
                    type="button"
                    aria-label="Decrease Players"
                    disabled={
                      controlsDisabled ||
                      previousSize === undefined ||
                      previousSize < room.players.length
                    }
                    onClick={() => {
                      if (previousSize !== undefined) changeSettings({ size: previousSize });
                    }}
                  >
                    ‹
                  </button>
                  <span className="lobby-room-seat-dots" aria-hidden="true">
                    {LOBBY_SIZES.map((size) => (
                      <i key={size} className={size === settings.size ? 'is-active' : ''} />
                    ))}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase Players"
                    disabled={controlsDisabled || nextSize === undefined}
                    onClick={() => {
                      if (nextSize !== undefined) changeSettings({ size: nextSize });
                    }}
                  >
                    ›
                  </button>
                </div>
              </div>

              <LobbyStepper
                label="Points to win"
                value={settings.victoryTarget}
                minimum={3}
                maximum={26}
                disabled={controlsDisabled}
                onChange={(victoryTarget) => changeSettings({ victoryTarget })}
              />
              <LobbyStepper
                label="Card discard limit"
                value={settings.discardThreshold}
                minimum={5}
                maximum={20}
                disabled={controlsDisabled}
                onChange={(discardThreshold) => changeSettings({ discardThreshold })}
              />
            </div>
          </section>

          <section className="lobby-room-seed" aria-labelledby="online-seed-label">
            <div>
              <strong id="online-seed-label">Match seed</strong>
              <small>Share this value to reproduce the same board.</small>
            </div>
            <input
              key={settings.seed}
              aria-labelledby="online-seed-label"
              defaultValue={settings.seed}
              maxLength={200}
              spellCheck="false"
              disabled={controlsDisabled}
              onBlur={(event) => commitSeed(event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  event.currentTarget.value = settings.seed;
                  event.currentTarget.blur();
                }
              }}
            />
            <Button
              variant="ghost"
              disabled={controlsDisabled}
              onClick={() => {
                const seed = createOnlineSeed();
                changeSettings({ seed });
              }}
            >
              Randomize
            </Button>
          </section>

          <footer className="lobby-room-start">
            <div className="lobby-validation" aria-live="polite">
              {error !== null ? (
                <p className="online-lobby-inline-error" role="alert">
                  {error.message}
                </p>
              ) : full && allConnected ? (
                <p className="validation-ready">Lobby ready</p>
              ) : (
                <p>
                  {!full
                    ? `Waiting for ${settings.size - room.players.length} more player${settings.size - room.players.length === 1 ? '' : 's'}`
                    : 'Waiting for every player to reconnect'}
                </p>
              )}
            </div>
            <div className="lobby-room-start__summary">
              <span>{selectedMode?.displayName}</span>
              <b>First to {settings.victoryTarget} VP</b>
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
        </Panel>
      </div>
      {viewerPlayer === undefined ? null : (
        <ProfileGalleryModal
          open={profileGalleryOpen}
          playerName={viewerPlayer.name}
          avatarId={viewerPlayer.avatarId}
          colorId={viewerPlayer.colorId}
          unavailableColorIds={room.players
            .filter((player) => player.id !== viewerPlayer.id)
            .map((player) => player.colorId)}
          saving={commandPending}
          errorMessage={error?.message ?? null}
          onClose={() => setProfileGalleryOpen(false)}
          onSave={(avatarId, colorId) => {
            void updateProfile({ avatarId, colorId }).then((saved) => {
              if (saved) setProfileGalleryOpen(false);
            });
          }}
        />
      )}
      {credentials === null ? null : <span className="visually-hidden">Online seat active</span>}
    </main>
  );
}
