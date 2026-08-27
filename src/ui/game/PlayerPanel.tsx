import { PLAYER_COLORS } from '../../engine/content/colors';
import type { PlayerState } from '../../engine/core/game-state';

interface PlayerPanelProps {
  readonly player: PlayerState;
  readonly position: number;
  readonly active: boolean;
  readonly publicScore: number;
}

export function PlayerPanel({ player, position, active, publicScore }: PlayerPanelProps) {
  const color = PLAYER_COLORS.find((definition) => definition.id === player.colorId);
  const resourceCount = Object.values(player.resources).reduce<number>(
    (total, amount) => total + (amount ?? 0),
    0,
  );

  return (
    <article className={`game-player ${active ? 'game-player--active' : ''}`}>
      <header className="game-player__heading">
        <span className="game-player__position">{position}</span>
        <span
          className={`player-marker player-marker--${color?.marker.toLocaleLowerCase() ?? 'circle'}`}
          style={{ backgroundColor: color?.hex ?? '#ffffff' }}
          aria-hidden="true"
        />
        <div>
          <strong>{player.name}</strong>
          <small>{active ? 'Active player' : color?.displayName}</small>
        </div>
        <span className="game-player__score" title="Public victory points">
          {publicScore} VP
        </span>
      </header>

      <dl className="game-player__stats">
        <div>
          <dt>Cards</dt>
          <dd>{resourceCount}</dd>
        </div>
        <div>
          <dt>Roads</dt>
          <dd>{player.roadsRemaining}</dd>
        </div>
        <div>
          <dt>Houses</dt>
          <dd>{player.housesRemaining}</dd>
        </div>
        <div>
          <dt>Mansions</dt>
          <dd>{player.mansionsRemaining}</dd>
        </div>
      </dl>
    </article>
  );
}
