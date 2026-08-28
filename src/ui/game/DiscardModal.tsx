import type { CSSProperties } from 'react';

import { HAND_GOODS } from '../../engine/content/commodities';
import { RESOURCES } from '../../engine/content/resources';
import type { ResourceBundle } from '../../engine/content/types';
import type { PlayerState } from '../../engine/core/game-state';
import type { ResourceId } from '../../engine/core/ids';
import { Button } from '../components/Button';
import { ResourceArtwork } from './ResourceArtwork';

interface DiscardModalProps {
  readonly player: PlayerState;
  readonly requiredCount: number;
  readonly selectedResources: ResourceBundle;
  readonly errorMessage: string | null;
  readonly onRemoveResource: (resourceId: ResourceId) => void;
  readonly onConfirm: (resources: ResourceBundle) => void;
  readonly includeCommodities?: boolean;
}

export function DiscardModal({
  player,
  requiredCount,
  selectedResources,
  errorMessage,
  onRemoveResource,
  onConfirm,
  includeCommodities = false,
}: DiscardModalProps) {
  const goods = includeCommodities ? HAND_GOODS : RESOURCES;
  const selectedCards = goods.flatMap((resource) =>
    Array.from({ length: selectedResources[resource.id] ?? 0 }, (_, index) => ({
      resource,
      index,
    })),
  );
  const selectedCount = selectedCards.length;

  return (
    <aside
      className="discard-tray"
      role="dialog"
      aria-modal="false"
      aria-labelledby="discard-tray-title"
      aria-describedby="discard-tray-description"
    >
      <header className="discard-tray__heading">
        <span className="discard-tray__card-cue" aria-hidden="true">
          <b>↑</b>
          <i>?</i>
        </span>
        <div>
          <strong id="discard-tray-title">
            Discard Cards ({selectedCount}/{requiredCount})
          </strong>
          <small id="discard-tray-description">
            {player.name}, select cards from your inventory below. Select a card here to return it.
          </small>
        </div>
      </header>

      <div className="discard-tray__selection" aria-label="Cards selected for discard">
        {selectedCards.length === 0 ? (
          <span className="discard-tray__empty">Selected cards move here</span>
        ) : (
          selectedCards.map(({ resource, index }) => (
            <button
              key={`${resource.id}-${index}`}
              type="button"
              className="discard-tray-card"
              style={{ '--resource-color': resource.color } as CSSProperties}
              aria-label={`Return ${resource.displayName} from discard`}
              onClick={() => onRemoveResource(resource.id)}
            >
              <span className="discard-tray-card__art">
                <ResourceArtwork resourceId={resource.id} />
              </span>
              <strong>{resource.displayName}</strong>
            </button>
          ))
        )}
      </div>

      {errorMessage === null ? null : (
        <p className="discard-tray__error" role="alert">
          {errorMessage}
        </p>
      )}

      <Button
        className="discard-tray__confirm"
        variant="primary"
        aria-label="Confirm discard"
        title={
          selectedCount === requiredCount
            ? `Discard ${requiredCount} selected cards`
            : `Select ${requiredCount - selectedCount} more cards`
        }
        disabled={selectedCount !== requiredCount}
        onClick={() => onConfirm(selectedResources)}
      >
        <span aria-hidden="true">✓</span>
        <span className="visually-hidden">Confirm discard</span>
      </Button>
    </aside>
  );
}
