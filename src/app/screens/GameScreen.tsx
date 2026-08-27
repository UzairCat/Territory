import { Navigate, useNavigate } from 'react-router-dom';

import { useAppStore } from '../stores/app-store';
import { PLAYER_COLORS } from '../../engine/content/colors';
import { Button } from '../../ui/components/Button';
import { Panel } from '../../ui/components/Panel';

export function GameScreen() {
  const navigate = useNavigate();
  const gameState = useAppStore((state) => state.gameState);
  const clearGame = useAppStore((state) => state.clearGame);

  if (gameState === null) {
    return <Navigate to="/" replace />;
  }

  const orderedPlayers = [...gameState.config.players].sort(
    (first, second) => first.order - second.order,
  );

  return (
    <main className="handoff-screen">
      <Panel className="handoff-card" aria-labelledby="match-ready-title">
        <p className="eyebrow">Match initialized</p>
        <h1 id="match-ready-title">The table is ready.</h1>
        <p>
          Lobby data has crossed the engine boundary successfully. Board generation and rendering
          arrive in Phase 3.
        </p>

        <dl className="match-summary">
          <div>
            <dt>Map</dt>
            <dd>Base Map</dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>Classic</dd>
          </div>
          <div>
            <dt>Seed</dt>
            <dd>{gameState.config.seed}</dd>
          </div>
        </dl>

        <ul className="handoff-players" aria-label="Turn order">
          {orderedPlayers.map((player, index) => {
            const color = PLAYER_COLORS.find((entry) => entry.id === player.colorId);
            return (
              <li key={player.id}>
                <span>{index + 1}</span>
                <span
                  className={`player-marker player-marker--${color?.marker.toLocaleLowerCase() ?? 'circle'}`}
                  style={{ backgroundColor: color?.hex ?? '#ffffff' }}
                />
                <strong>{player.name}</strong>
              </li>
            );
          })}
        </ul>

        <div className="handoff-actions">
          <Button
            variant="secondary"
            onClick={() => {
              clearGame();
              void navigate('/lobby');
            }}
          >
            Return to lobby
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              clearGame();
              void navigate('/');
            }}
          >
            Main menu
          </Button>
        </div>
      </Panel>
    </main>
  );
}
