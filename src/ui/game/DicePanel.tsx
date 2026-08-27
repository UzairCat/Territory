import type { GamePhase } from '../../engine/core/game-state';
import { Button } from '../components/Button';

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;

interface DicePanelProps {
  readonly phase: GamePhase;
  readonly dice: readonly [number, number] | null;
  readonly onRoll: () => void;
  readonly onEndTurn: () => void;
}

export function DicePanel({ phase, dice, onRoll, onEndTurn }: DicePanelProps) {
  const total = dice === null ? null : dice[0] + dice[1];

  return (
    <section className="dice-panel" aria-label="Dice controls">
      <div className="dice-result" key={dice?.join('-') ?? 'unrolled'}>
        <div
          className="dice-faces"
          aria-label={dice === null ? 'Dice not rolled' : `Rolled ${dice[0]} and ${dice[1]}`}
        >
          <span aria-hidden="true">{dice === null ? '?' : DICE_FACES[dice[0]]}</span>
          <span aria-hidden="true">{dice === null ? '?' : DICE_FACES[dice[1]]}</span>
        </div>
        <output aria-label="Dice total">{total === null ? '—' : `Total ${total}`}</output>
      </div>

      {phase === 'WAITING_FOR_ROLL' ? (
        <Button variant="primary" onClick={onRoll}>
          Roll dice
        </Button>
      ) : phase === 'ACTION_PHASE' ? (
        <Button variant="secondary" onClick={onEndTurn}>
          End turn
        </Button>
      ) : phase === 'DISCARD_RESOURCES' || phase === 'MOVE_ROBBER' ? (
        <span className="dice-panel__status">Robber resolution required</span>
      ) : null}
    </section>
  );
}
