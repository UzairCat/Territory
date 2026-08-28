import { getKNProgressCardDefinition } from '../../engine/content/kn-progress-cards';
import type { GameState } from '../../engine/core/game-state';
import type { CardInstanceId } from '../../engine/core/ids';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { KNProgressCardArtwork } from './KNProgressCardArtwork';

interface KNProgressCardPlayModalProps {
  readonly state: GameState;
  readonly cardInstanceId: CardInstanceId;
  readonly errorMessage: string | null;
  readonly onCancel: () => void;
  readonly onPlay: (cardInstanceId: CardInstanceId) => void;
}

export function KNProgressCardPlayModal({
  state,
  cardInstanceId,
  errorMessage,
  onCancel,
  onPlay,
}: KNProgressCardPlayModalProps) {
  const card = state.kn?.progressCards[cardInstanceId];
  const definition =
    card === undefined ? undefined : getKNProgressCardDefinition(card.definitionId);
  if (definition === undefined) return null;

  return (
    <Modal
      open
      title={definition.displayName}
      description={definition.description}
      onClose={onCancel}
      className="kn-progress-play-modal"
    >
      <div className="kn-progress-play-card">
        <KNProgressCardArtwork definition={definition} />
        <div>
          <span>{definition.family.toLocaleLowerCase()} Progress Card</span>
          <strong>{definition.displayName}</strong>
          <p>{definition.description}</p>
        </div>
      </div>

      {errorMessage === null ? null : (
        <p className="modal-error" role="alert">
          {errorMessage}
        </p>
      )}
      <footer className="modal__actions">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button data-modal-autofocus variant="primary" onClick={() => onPlay(cardInstanceId)}>
          Play {definition.displayName}
        </Button>
      </footer>
    </Modal>
  );
}
