import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useAppStore } from '../stores/app-store';
import { BoardViewport } from '../../board-renderer/BoardViewport';
import type { BoardTarget } from '../../board-renderer/render-model';
import { PLAYER_COLORS } from '../../engine/content/colors';
import { PROGRESS_CARDS } from '../../engine/content/progress-cards';
import { RESOURCES, TERRAINS } from '../../engine/content/resources';
import type { GameState, PlayerState } from '../../engine/core/game-state';
import { actionId } from '../../engine/core/ids';
import type { PlayerId } from '../../engine/core/ids';
import {
  getLegalSetupHouseVertexIds,
  getLegalSetupRoadEdgeIds,
  getSetupProgress,
} from '../../engine/rules/setup-rules';
import { Button } from '../../ui/components/Button';
import { PlayerPanel } from '../../ui/game/PlayerPanel';

function phaseLabel(phase: GameState['turn']['phase']): string {
  const labels: Record<GameState['turn']['phase'], string> = {
    INITIALIZING: 'Board ready',
    SETUP_PLACE_HOUSE: 'Place a house',
    SETUP_PLACE_ROAD: 'Place a road',
    WAITING_FOR_ROLL: 'Waiting for roll',
    RESOLVING_PRODUCTION: 'Producing resources',
    DISCARD_RESOURCES: 'Discard resources',
    MOVE_ROBBER: 'Move robber',
    CHOOSE_STEAL_TARGET: 'Choose target',
    ACTION_PHASE: 'Action phase',
    CARD_RESOLUTION: 'Resolve progress card',
    GAME_OVER: 'Game over',
  };
  return labels[phase];
}

function publicScore(state: GameState, playerId: PlayerId): number {
  const buildingScore = Object.values(state.board.vertices).reduce((total, vertex) => {
    if (vertex.building?.ownerId !== playerId) return total;
    return total + (vertex.building.type === 'MANSION' ? 2 : 1);
  }, 0);
  const bonusScore =
    (state.bonuses.longestRoadHolderId === playerId
      ? state.config.rules.longestRoad.victoryPoints
      : 0) +
    (state.bonuses.largestForceHolderId === playerId
      ? state.config.rules.largestForce.victoryPoints
      : 0);
  return buildingScore + bonusScore;
}

function describeTarget(state: GameState, target: BoardTarget | null): string {
  if (target === null) return 'Hover a tile, road edge, corner, or port to inspect its stable ID.';

  if (target.kind === 'HEX') {
    const hex = state.board.hexes[target.id];
    const terrain = TERRAINS.find((definition) => definition.id === hex?.terrainId);
    if (hex === undefined) return target.id;
    return `${terrain?.displayName ?? 'Unknown terrain'} · ${hex.numberToken ?? 'no token'} · ${target.id}`;
  }

  if (target.kind === 'PORT') {
    const port = state.board.ports[target.id];
    if (port === undefined) return target.id;
    return `${port.resourceId ?? 'Any resource'} ${port.tradeRatio}:1 port · ${target.id}`;
  }

  return `${target.kind === 'EDGE' ? 'Road edge' : 'Building corner'} · ${target.id}`;
}

function activeHand(player: PlayerState | undefined) {
  return RESOURCES.map((resource) => ({
    ...resource,
    amount: player?.resources[resource.id] ?? 0,
  }));
}

export function GameScreen() {
  const navigate = useNavigate();
  const gameState = useAppStore((state) => state.gameState);
  const clearGame = useAppStore((state) => state.clearGame);
  const dispatchGameAction = useAppStore((state) => state.dispatchGameAction);
  const openSettings = useAppStore((state) => state.openSettings);
  const [showDebug, setShowDebug] = useState(false);
  const [inspectedTarget, setInspectedTarget] = useState<BoardTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const orderedPlayerConfigs = useMemo(
    () =>
      gameState === null
        ? []
        : [...gameState.config.players].sort((first, second) => first.order - second.order),
    [gameState],
  );
  const selectableTargets = useMemo<readonly BoardTarget[]>(() => {
    if (gameState === null) return [];
    if (gameState.turn.phase === 'SETUP_PLACE_HOUSE') {
      return getLegalSetupHouseVertexIds(gameState).map((id) => ({ kind: 'VERTEX', id }));
    }
    if (gameState.turn.phase === 'SETUP_PLACE_ROAD') {
      return getLegalSetupRoadEdgeIds(gameState).map((id) => ({ kind: 'EDGE', id }));
    }
    return [];
  }, [gameState]);
  const playerColors = useMemo<Readonly<Record<string, string>>>(() => {
    if (gameState === null) return {};
    return Object.fromEntries(
      gameState.config.players.map((player) => [
        player.id,
        PLAYER_COLORS.find((color) => color.id === player.colorId)?.hex ?? '#f6f0dc',
      ]),
    );
  }, [gameState]);

  if (gameState === null) {
    return <Navigate to="/lobby" replace />;
  }

  const activePlayer =
    gameState.turn.activePlayerId === null
      ? undefined
      : gameState.players[gameState.turn.activePlayerId];
  const inspection = describeTarget(gameState, inspectedTarget);
  const setupProgress = getSetupProgress(gameState);
  const setupInstruction =
    gameState.turn.phase === 'SETUP_PLACE_HOUSE'
      ? 'Choose a glowing corner for your house.'
      : gameState.turn.phase === 'SETUP_PLACE_ROAD'
        ? 'Choose a glowing edge attached to that house.'
        : null;

  const leaveGame = (destination: '/' | '/lobby') => {
    void navigate(destination, { flushSync: true });
    clearGame();
  };

  const selectBoardTarget = (target: BoardTarget) => {
    const actorId = gameState.turn.activePlayerId;
    if (actorId === null) {
      setActionError('No active player is available for this action.');
      return;
    }

    const id = actionId(`local-${globalThis.crypto.randomUUID()}`);
    const result =
      gameState.turn.phase === 'SETUP_PLACE_HOUSE' && target.kind === 'VERTEX'
        ? dispatchGameAction({ id, type: 'PLACE_SETUP_HOUSE', actorId, vertexId: target.id })
        : gameState.turn.phase === 'SETUP_PLACE_ROAD' && target.kind === 'EDGE'
          ? dispatchGameAction({ id, type: 'PLACE_SETUP_ROAD', actorId, edgeId: target.id })
          : null;

    if (result === null) {
      setActionError('That board target is not available during the current phase.');
    } else if (!result.ok) {
      setActionError(result.error.message);
    } else {
      setActionError(null);
      setInspectedTarget(null);
    }
  };

  return (
    <main className="game-screen">
      <header className="game-topbar">
        <div className="game-brand">
          <span className="eyebrow">Territory</span>
          <strong>{phaseLabel(gameState.turn.phase)}</strong>
        </div>

        <dl className="turn-summary">
          <div>
            <dt>Turn</dt>
            <dd>{gameState.turn.turnNumber + 1}</dd>
          </div>
          <div>
            <dt>Active</dt>
            <dd>{activePlayer?.name ?? 'Preparing'}</dd>
          </div>
          <div>
            <dt>Dice</dt>
            <dd>{gameState.turn.dice?.join(' + ') ?? '—'}</dd>
          </div>
        </dl>

        <div className="game-topbar__actions">
          <label className="debug-toggle">
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(event) => setShowDebug(event.target.checked)}
            />
            Debug IDs
          </label>
          <Button variant="ghost" onClick={openSettings}>
            Settings
          </Button>
          <Button variant="ghost" onClick={() => leaveGame('/lobby')}>
            Lobby
          </Button>
        </div>
      </header>

      <div className="game-layout">
        <div className="game-board-column">
          <BoardViewport
            board={gameState.board}
            showDebugIds={showDebug}
            selectableTargets={selectableTargets}
            playerColors={playerColors}
            onInspect={setInspectedTarget}
            onSelect={selectBoardTarget}
          />
          <p
            className={`board-inspector ${actionError === null ? '' : 'board-inspector--error'}`}
            aria-live="polite"
          >
            {actionError ?? inspection}
          </p>
        </div>

        <aside className="player-sidebar" aria-label="Players and match state">
          <header className="sidebar-heading">
            <div>
              <span className="eyebrow">Turn order</span>
              <h2>Players</h2>
            </div>
            <span>{orderedPlayerConfigs.length}</span>
          </header>

          <div className="game-player-list">
            {orderedPlayerConfigs.map((config, index) => {
              const player = gameState.players[config.id];
              return player === undefined ? null : (
                <PlayerPanel
                  key={player.id}
                  player={player}
                  position={index + 1}
                  active={gameState.turn.activePlayerId === player.id}
                  publicScore={publicScore(gameState, player.id)}
                />
              );
            })}
          </div>

          <section className="developer-panel" hidden={!showDebug}>
            <h3>Developer state</h3>
            <dl>
              <div>
                <dt>Seed</dt>
                <dd>{gameState.config.seed}</dd>
              </div>
              <div>
                <dt>Topology</dt>
                <dd>
                  {Object.keys(gameState.board.hexes).length}H ·{' '}
                  {Object.keys(gameState.board.vertices).length}V ·{' '}
                  {Object.keys(gameState.board.edges).length}E
                </dd>
              </div>
              <div>
                <dt>RNG draws</dt>
                <dd>{gameState.random.draws}</dd>
              </div>
              <div>
                <dt>Deck</dt>
                <dd>
                  {gameState.progressDeck.length}/
                  {PROGRESS_CARDS.reduce((total, card) => total + card.count, 0)}
                </dd>
              </div>
              <div>
                <dt>Actions</dt>
                <dd>
                  {gameState.actionHistory.length} ·{' '}
                  {gameState.actionHistory.at(-1)?.actionType ?? 'none'}
                </dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{inspectedTarget?.id ?? 'none'}</dd>
              </div>
            </dl>
          </section>

          <Button variant="danger" fullWidth onClick={() => leaveGame('/')}>
            Leave match
          </Button>
        </aside>
      </div>

      <footer className="active-hand" aria-label="Active player resource hand">
        <div className="active-hand__identity">
          <span className="eyebrow">Active hand</span>
          <strong>{activePlayer?.name ?? 'Preparing match'}</strong>
        </div>
        <div className="resource-hand">
          {activeHand(activePlayer).map((resource) => (
            <div key={resource.id} className="resource-card">
              <span style={{ backgroundColor: resource.color }} aria-hidden="true" />
              <small>{resource.displayName}</small>
              <strong>{resource.amount}</strong>
            </div>
          ))}
        </div>
        {setupProgress === null ? (
          <span className="phase-placeholder">Dice and production arrive in Phase 5</span>
        ) : (
          <div className="setup-progress" aria-live="polite">
            <strong>
              Placement {setupProgress.placementNumber}/{setupProgress.totalPlacements} ·{' '}
              {setupProgress.round === 'FORWARD' ? 'Forward' : 'Reverse'} round
            </strong>
            <span>{setupInstruction}</span>
          </div>
        )}
      </footer>
    </main>
  );
}
