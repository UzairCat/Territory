import type { PlayerState } from '../../engine/core/game-state';
import type { PlayerId } from '../../engine/core/ids';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

interface StealTargetModalProps {
  readonly playerName: string;
  readonly targets: readonly PlayerState[];
  readonly errorMessage: string | null;
  readonly onChoose: (playerId: PlayerId) => void;
}

const preventDismiss = () => undefined;

function cardCount(player: PlayerState): number {
  return Object.values(player.resources).reduce<number>(
    (total, amount) => total + (amount ?? 0),
    0,
  );
}

export function StealTargetModal({
  playerName,
  targets,
  errorMessage,
  onChoose,
}: StealTargetModalProps) {
  return (
    <Modal
      open
      title="Choose a player to rob"
      description={`${playerName} will steal one random resource card.`}
      dismissible={false}
      onClose={preventDismiss}
    >
      <div className="steal-targets">
        {targets.map((target, index) => (
          <Button
            key={target.id}
            data-modal-autofocus={index === 0 ? true : undefined}
            variant="secondary"
            fullWidth
            onClick={() => onChoose(target.id)}
          >
            <span>{target.name}</span>
            <small>{cardCount(target)} resource cards</small>
          </Button>
        ))}
      </div>
      {errorMessage === null ? null : (
        <p className="modal-error" role="alert">
          {errorMessage}
        </p>
      )}
    </Modal>
  );
}
