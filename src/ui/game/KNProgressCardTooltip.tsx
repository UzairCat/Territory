import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import type { KNProgressCardDefinition } from '../../engine/content/kn-progress-cards';
import { Button } from '../components/Button';
import type {
  ProgressCardTooltipAnchor,
  ProgressCardTooltipConfirmation,
} from './ProgressCardTooltip';
import { KNProgressCardArtwork } from './KNProgressCardArtwork';

interface KNProgressCardTooltipProps {
  readonly id: string;
  readonly definition: KNProgressCardDefinition;
  readonly status: string;
  readonly statusDetail: string;
  readonly anchor: ProgressCardTooltipAnchor;
  readonly confirmation?: ProgressCardTooltipConfirmation;
}

export function KNProgressCardTooltip({
  id,
  definition,
  status,
  statusDetail,
  anchor,
  confirmation,
}: KNProgressCardTooltipProps) {
  if (typeof document === 'undefined') return null;
  const viewportWidth = globalThis.innerWidth || 1024;
  const margin = 10;
  const width = Math.min(confirmation === undefined ? 284 : 434, viewportWidth - margin * 2);
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
      className={`progress-card-tooltip kn-progress-card-tooltip kn-progress-card-tooltip--${definition.family.toLocaleLowerCase()} ${confirmation === undefined ? '' : 'progress-card-tooltip--confirming'}`}
      data-tone="ready"
      role={confirmation === undefined ? 'tooltip' : 'dialog'}
      aria-labelledby={headingId}
      style={style}
    >
      <header className="progress-card-tooltip__header">
        <KNProgressCardArtwork definition={definition} />
        <div>
          <small>{definition.family.toLocaleLowerCase()} Progress Card</small>
          <strong id={headingId}>{definition.displayName}</strong>
          <span className="progress-card-tooltip__status">{status}</span>
        </div>
      </header>
      <p>{definition.description}</p>
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
