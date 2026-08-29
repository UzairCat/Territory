import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import type { ProgressCardDefinition } from '../../engine/content/types';
import { Button } from '../components/Button';
import { ProgressCardArtwork } from './ProgressCardArtwork';

export type ProgressCardTooltipTone = 'READY' | 'WAITING' | 'PASSIVE' | 'UNAVAILABLE';

export interface ProgressCardTooltipAnchor {
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

export interface ProgressCardTooltipConfirmation {
  readonly confirmLabel: string;
  readonly errorMessage: string | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

interface ProgressCardTooltipProps {
  readonly id: string;
  readonly definition: ProgressCardDefinition;
  readonly status: string;
  readonly statusDetail: string;
  readonly tone: ProgressCardTooltipTone;
  readonly anchor: ProgressCardTooltipAnchor;
  readonly confirmation?: ProgressCardTooltipConfirmation;
}

function rulesSummary(definition: ProgressCardDefinition): string {
  if (definition.effect === 'MOVE_ROBBER') {
    return 'Move the robber to a different tile, then steal one random resource from an eligible opponent. Each played Knight also counts toward Largest Force.';
  }
  if (definition.effect === 'PLACE_TWO_ROADS') {
    return 'Place up to two legal connected Roads without paying any resource cards. You still need Road pieces available.';
  }
  if (definition.effect === 'TAKE_TWO_RESOURCES') {
    return 'Choose exactly two resource cards that are available in the bank. You may choose the same resource twice.';
  }
  if (definition.effect === 'MONOPOLY') {
    return 'Choose one resource type and collect every card of that type held by all other players.';
  }
  return 'Keep this card in your hand. It adds one victory point automatically and is included in your final score.';
}

export function ProgressCardTooltip({
  id,
  definition,
  status,
  statusDetail,
  tone,
  anchor,
  confirmation,
}: ProgressCardTooltipProps) {
  if (typeof document === 'undefined') return null;

  const viewportWidth = globalThis.innerWidth || 1024;
  const margin = 10;
  const width = Math.min(confirmation === undefined ? 260 : 410, viewportWidth - margin * 2);
  const anchorCenter = anchor.left + anchor.width / 2;
  const center = Math.min(
    Math.max(anchorCenter, margin + width / 2),
    viewportWidth - margin - width / 2,
  );
  const arrowLeft = Math.min(Math.max(anchorCenter - (center - width / 2), 18), width - 18);
  const style = {
    '--progress-tooltip-left': `${center}px`,
    '--progress-tooltip-top': `${anchor.top - 10}px`,
    '--progress-tooltip-width': `${width}px`,
    '--progress-tooltip-arrow-left': `${arrowLeft}px`,
  } as CSSProperties;
  const headingId = `${id}-heading`;

  return createPortal(
    <aside
      id={id}
      className={`progress-card-tooltip ${confirmation === undefined ? '' : 'progress-card-tooltip--confirming'}`}
      data-tone={tone.toLowerCase()}
      role={confirmation === undefined ? 'tooltip' : 'dialog'}
      aria-labelledby={headingId}
      style={style}
    >
      <header className="progress-card-tooltip__header">
        <ProgressCardArtwork definition={definition} />
        <div>
          <small>{definition.effect === 'VICTORY_POINT' ? 'Victory card' : 'Progress card'}</small>
          <strong id={headingId}>{definition.displayName}</strong>
          <span className="progress-card-tooltip__status">{status}</span>
        </div>
      </header>
      <p>{rulesSummary(definition)}</p>
      <footer>
        <span aria-hidden="true">i</span>
        <span>{statusDetail}</span>
      </footer>
      {confirmation === undefined ? null : (
        <div className="progress-card-tooltip__confirmation">
          <strong>Use this card?</strong>
          {confirmation.errorMessage === null ? null : (
            <small role="alert">{confirmation.errorMessage}</small>
          )}
          <Button
            data-progress-confirm-autofocus
            className="progress-card-tooltip__confirm"
            variant="primary"
            onClick={confirmation.onConfirm}
          >
            {confirmation.confirmLabel}
          </Button>
          <Button variant="danger" onClick={confirmation.onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </aside>,
    document.body,
  );
}
