import type { GameState } from '../../engine/core/game-state';

interface BarbarianTrackerProps {
  readonly state: GameState;
}

export function BarbarianTracker({ state }: BarbarianTrackerProps) {
  const kn = state.kn;
  if (kn === null) return null;

  const barbarianStrength = Object.values(state.board.vertices).filter(
    (vertex) => vertex.building?.type === 'MANSION',
  ).length;
  const defenderStrength = Object.values(state.players).reduce(
    (total, player) =>
      total +
      player.knights.reduce(
        (playerTotal, knight) => playerTotal + (knight.active ? knight.level : 0),
        0,
      ),
    0,
  );
  const remaining = kn.barbarianTrackLength - kn.barbarianPosition;
  const hasDefenseAdvantage = defenderStrength >= barbarianStrength;

  return (
    <aside
      className="board-barbarian-tracker"
      aria-label={`${remaining} spaces until the barbarian attack. Barbarian strength ${barbarianStrength}; defender strength ${defenderStrength}.`}
    >
      <header>
        <span className="board-barbarian-tracker__ship" aria-hidden="true">
          ⛵
        </span>
        <span
          className="board-barbarian-tracker__stat board-barbarian-tracker__stat--cities"
          title="Island Cities"
          aria-label={`${barbarianStrength} island Cities`}
        >
          <i className="board-barbarian-tracker__city" aria-hidden="true" />
          <strong>×{barbarianStrength}</strong>
        </span>
        <span
          className={`board-barbarian-tracker__stat board-barbarian-tracker__stat--defense ${hasDefenseAdvantage ? 'is-advantaged' : ''}`}
          title={
            hasDefenseAdvantage
              ? 'Active Knight strength meets or exceeds the island’s Cities'
              : 'Active Knight strength'
          }
          aria-label={`${defenderStrength} defender strength${hasDefenseAdvantage ? ', defense advantage' : ''}`}
        >
          <i aria-hidden="true">♞</i>
          <strong>×{defenderStrength}</strong>
        </span>
      </header>
      <div className="board-barbarian-tracker__route" aria-hidden="true">
        {Array.from({ length: kn.barbarianTrackLength }, (_, index) => {
          const space = kn.barbarianTrackLength - index - 1;
          return (
            <i
              key={space}
              className={`${space < kn.barbarianPosition ? 'is-crossed' : ''} ${space === kn.barbarianPosition ? 'is-current' : ''}`}
            />
          );
        })}
      </div>
      <strong>{remaining} to attack</strong>
      <small>{kn.firstBarbarianAttackResolved ? 'Robber unlocked' : 'Robber locked'}</small>
    </aside>
  );
}
