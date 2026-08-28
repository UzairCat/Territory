import { useMemo, useState, type CSSProperties } from 'react';

import { RESOURCES } from '../../engine/content/resources';
import { resourceBundle } from '../../engine/content/types';
import type { ProgressCardDefinition, ResourceBundle } from '../../engine/content/types';
import type { GameState, PlayerState } from '../../engine/core/game-state';
import type { CardInstanceId, ResourceId } from '../../engine/core/ids';
import { getProgressCardDefinition } from '../../engine/rules/progress-card-rules';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ProgressCardArtwork } from './ProgressCardArtwork';
import { ResourceArtwork } from './ResourceArtwork';

interface ProgressCardChoiceModalProps {
  readonly state: GameState;
  readonly player: PlayerState;
  readonly cardInstanceId: CardInstanceId;
  readonly errorMessage: string | null;
  readonly canCancel: boolean;
  readonly onCancel: () => void;
  readonly onConfirmPlay: (cardInstanceId: CardInstanceId) => void;
  readonly onChooseResources: (cardInstanceId: CardInstanceId, resources: ResourceBundle) => void;
  readonly onChooseResourceType: (cardInstanceId: CardInstanceId, resourceId: ResourceId) => void;
}

function resourceLabel(resourceId: ResourceId): string {
  const resource = RESOURCES.find((candidate) => candidate.id === resourceId);
  if (resource?.id === 'livestock') return 'Sheep';
  return resource?.displayName ?? resourceId;
}

function ResourceChoiceCard({
  resourceId,
  bankCount,
  selectedCount,
  disabled,
  autofocus,
  cardName,
  detail,
  onSelect,
}: {
  readonly resourceId: ResourceId;
  readonly bankCount: number;
  readonly selectedCount: number;
  readonly disabled: boolean;
  readonly autofocus: boolean;
  readonly cardName: string;
  readonly detail?: string;
  readonly onSelect: () => void;
}) {
  const resource = RESOURCES.find((candidate) => candidate.id === resourceId);
  if (resource === undefined) return null;

  return (
    <button
      type="button"
      className={`progress-resource-option progress-resource-option--${resource.iconKey} ${selectedCount > 0 ? 'progress-resource-option--selected' : ''}`}
      style={{ '--choice-resource-color': resource.color } as CSSProperties}
      disabled={disabled}
      data-modal-autofocus={autofocus ? true : undefined}
      aria-label={`Choose ${resourceLabel(resource.id)} for ${cardName}`}
      aria-pressed={selectedCount > 0}
      onClick={onSelect}
    >
      <span className="progress-resource-option__art">
        <ResourceArtwork resourceId={resource.id} />
      </span>
      <strong>{resourceLabel(resource.id)}</strong>
      <small>{detail ?? `${bankCount} in bank`}</small>
      {selectedCount > 0 ? (
        <span className="progress-resource-option__selected-count">×{selectedCount}</span>
      ) : null}
    </button>
  );
}

function ChoiceError({ message }: { readonly message: string | null }) {
  return message === null ? null : (
    <p className="modal-error" role="alert">
      {message}
    </p>
  );
}

function ModalActions({
  definition,
  confirmDisabled = false,
  canCancel,
  onCancel,
  onConfirm,
}: {
  readonly definition: ProgressCardDefinition;
  readonly confirmDisabled?: boolean;
  readonly canCancel: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <footer className="modal__actions progress-card-choice__actions">
      {canCancel ? (
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
      <Button variant="primary" disabled={confirmDisabled} onClick={onConfirm}>
        {definition.effect === 'MOVE_ROBBER' || definition.effect === 'PLACE_TWO_ROADS'
          ? `Use ${definition.displayName}`
          : `Confirm ${definition.displayName}`}
      </Button>
    </footer>
  );
}

export function ProgressCardChoiceModal({
  state,
  player,
  cardInstanceId,
  errorMessage,
  canCancel,
  onCancel,
  onConfirmPlay,
  onChooseResources,
  onChooseResourceType,
}: ProgressCardChoiceModalProps) {
  const [selectedResources, setSelectedResources] = useState<readonly ResourceId[]>([]);
  const card = state.progressCards[cardInstanceId];
  const definition = getProgressCardDefinition(card);
  const selectedCounts = useMemo(
    () =>
      Object.fromEntries(
        RESOURCES.map((resource) => [
          resource.id,
          selectedResources.filter((selected) => selected === resource.id).length,
        ]),
      ) as Readonly<Record<string, number>>,
    [selectedResources],
  );

  if (definition === undefined) return null;

  const close = () => {
    if (canCancel) onCancel();
  };
  const commonModalProps = {
    open: true,
    title: definition.displayName,
    description: definition.description,
    dismissible: canCancel,
    onClose: close,
    className: 'progress-card-choice-modal',
  } as const;

  if (definition.effect === 'MONOPOLY') {
    const selectedResourceId = selectedResources[0];
    return (
      <Modal {...commonModalProps}>
        <div className="card-resource-choice">
          <p>
            <strong>{player.name}</strong>, choose one resource type to collect from every opponent.
            The card is not used until you confirm.
          </p>
          <div className="progress-resource-options" aria-label="Monopoly resource choices">
            {RESOURCES.map((resource, index) => (
              <ResourceChoiceCard
                key={resource.id}
                resourceId={resource.id}
                bankCount={state.bank[resource.id] ?? 0}
                selectedCount={selectedResourceId === resource.id ? 1 : 0}
                disabled={false}
                autofocus={index === 0}
                cardName={definition.displayName}
                detail="All opponents"
                onSelect={() => setSelectedResources([resource.id])}
              />
            ))}
          </div>
          <ChoiceError message={errorMessage} />
          <ModalActions
            definition={definition}
            confirmDisabled={selectedResourceId === undefined}
            canCancel={canCancel}
            onCancel={onCancel}
            onConfirm={() => {
              if (selectedResourceId !== undefined) {
                onChooseResourceType(cardInstanceId, selectedResourceId);
              }
            }}
          />
        </div>
      </Modal>
    );
  }

  if (definition.effect === 'TAKE_TWO_RESOURCES') {
    const requiredCount = 2;
    const addResource = (resourceId: ResourceId) => {
      const alreadySelected = selectedCounts[resourceId] ?? 0;
      const bankCount = state.bank[resourceId] ?? 0;
      if (selectedResources.length >= requiredCount || alreadySelected >= bankCount) return;
      setSelectedResources((current) => [...current, resourceId]);
    };
    const removeSelection = (index: number) => {
      setSelectedResources((current) =>
        current.filter((_, selectionIndex) => selectionIndex !== index),
      );
    };

    return (
      <Modal {...commonModalProps}>
        <div className="card-resource-choice">
          <p className="card-choice-progress">
            <strong>{player.name}, choose two cards from the bank.</strong>
            <span>
              {selectedResources.length}/{requiredCount} selected
            </span>
          </p>
          <div className="progress-resource-options" aria-label="Year of Plenty resource choices">
            {RESOURCES.map((resource, index) => {
              const selectedCount = selectedCounts[resource.id] ?? 0;
              const bankCount = state.bank[resource.id] ?? 0;
              return (
                <ResourceChoiceCard
                  key={resource.id}
                  resourceId={resource.id}
                  bankCount={bankCount}
                  selectedCount={selectedCount}
                  disabled={selectedResources.length >= requiredCount || selectedCount >= bankCount}
                  autofocus={index === 0}
                  cardName={definition.displayName}
                  onSelect={() => addResource(resource.id)}
                />
              );
            })}
          </div>
          <div className="progress-resource-selection" aria-label="Selected resource cards">
            {Array.from({ length: requiredCount }, (_, index) => {
              const resourceId = selectedResources[index];
              return resourceId === undefined ? (
                <span key={index} className="progress-resource-selection__empty">
                  Pick card {index + 1}
                </span>
              ) : (
                <button
                  key={`${resourceId}-${index}`}
                  type="button"
                  className="progress-resource-selection__card"
                  aria-label={`Remove ${resourceLabel(resourceId)} from selection ${index + 1}`}
                  onClick={() => removeSelection(index)}
                >
                  <ResourceArtwork resourceId={resourceId} />
                  <span>{resourceLabel(resourceId)}</span>
                  <i aria-hidden="true">×</i>
                </button>
              );
            })}
          </div>
          <p className="progress-card-choice__hint">
            Select the same card twice if you want two of one resource. Click a selected card to
            remove it.
          </p>
          <ChoiceError message={errorMessage} />
          <ModalActions
            definition={definition}
            confirmDisabled={selectedResources.length !== requiredCount}
            canCancel={canCancel}
            onCancel={onCancel}
            onConfirm={() =>
              onChooseResources(
                cardInstanceId,
                resourceBundle(
                  RESOURCES.flatMap((resource) => {
                    const amount = selectedCounts[resource.id] ?? 0;
                    return amount > 0 ? ([[resource.id, amount]] as const) : [];
                  }),
                ),
              )
            }
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal {...commonModalProps}>
      <div className="progress-card-play-confirmation">
        <span className="progress-card-play-confirmation__art">
          <ProgressCardArtwork definition={definition} />
        </span>
        <div>
          <strong>Use this card?</strong>
          <p>
            {definition.effect === 'MOVE_ROBBER'
              ? 'After confirming, choose the tile where the robber should move.'
              : 'After confirming, choose up to two legal connected road locations.'}
          </p>
          <p className="progress-card-choice__hint">Cancel keeps the card in your hand.</p>
        </div>
      </div>
      <ChoiceError message={errorMessage} />
      <ModalActions
        definition={definition}
        canCancel={canCancel}
        onCancel={onCancel}
        onConfirm={() => onConfirmPlay(cardInstanceId)}
      />
    </Modal>
  );
}
