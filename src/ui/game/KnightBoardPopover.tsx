import type { CSSProperties } from 'react';

import type { BoardViewportPoint } from '../../board-renderer/render-model';
import { RESOURCE_IDS } from '../../engine/content/resources';
import { resourceBundle } from '../../engine/content/types';
import type { ResourceBundle } from '../../engine/content/types';
import type { KnightState } from '../../engine/core/game-state';
import { KNIGHT_COST } from '../../engine/rules/kn-construction-rules';
import { ResourceCostCards } from './ActionArtwork';

interface KnightBoardPopoverProps {
  readonly position: BoardViewportPoint;
  readonly knight: KnightState;
  readonly playerColor: string;
  readonly availableResources: ResourceBundle;
  readonly canActivate: boolean;
  readonly activateReason: string;
  readonly canUpgrade: boolean;
  readonly upgradeReason: string;
  readonly canMove: boolean;
  readonly moveReason: string;
  readonly onActivate: () => void;
  readonly onUpgrade: () => void;
  readonly onMove: () => void;
  readonly onClose: () => void;
}

const ACTIVATE_COST = resourceBundle([[RESOURCE_IDS.grain, 1]]);

function KnightMenuButton({
  action,
  icon,
  cost,
  availableResources,
  disabled,
  reason,
  onClick,
}: {
  readonly action: string;
  readonly icon: string;
  readonly cost?: ResourceBundle;
  readonly availableResources: ResourceBundle;
  readonly disabled: boolean;
  readonly reason: string;
  readonly onClick: () => void;
}) {
  return (
    <div className="knight-board-popover__option">
      {cost === undefined ? (
        <span className="knight-board-popover__free">No cost</span>
      ) : (
        <ResourceCostCards
          resources={cost}
          availableResources={availableResources}
          className="board-build-popover__cost knight-board-popover__cost"
        />
      )}
      <button
        type="button"
        className="knight-board-popover__action"
        disabled={disabled}
        title={reason}
        onClick={onClick}
      >
        <span aria-hidden="true">{icon}</span>
        <strong>{action}</strong>
      </button>
    </div>
  );
}

export function KnightBoardPopover({
  position,
  knight,
  playerColor,
  availableResources,
  canActivate,
  activateReason,
  canUpgrade,
  upgradeReason,
  canMove,
  moveReason,
  onActivate,
  onUpgrade,
  onMove,
  onClose,
}: KnightBoardPopoverProps) {
  const viewportWidth = globalThis.innerWidth || 1200;
  const viewportHeight = globalThis.innerHeight || 800;
  const placeAbove = position.y > 250;
  const left = Math.max(9 * 16, Math.min(viewportWidth - 9 * 16, position.x));
  const top = Math.max(8 * 16, Math.min(viewportHeight - 8 * 16, position.y));

  return (
    <>
      <button
        type="button"
        className="board-build-popover__scrim"
        aria-label="Close Knight menu"
        onClick={onClose}
      />
      <section
        className={`board-build-popover knight-board-popover board-build-popover--${placeAbove ? 'above' : 'below'}`}
        style={{ left, top, '--knight-color': playerColor } as CSSProperties}
        role="dialog"
        aria-label={`Level ${knight.level} ${knight.active ? 'active' : 'inactive'} Knight actions`}
      >
        <header className="knight-board-popover__heading">
          <span
            className={`knight-menu-piece knight-menu-piece--level-${knight.level} ${knight.active ? 'is-active' : ''}`}
            aria-hidden="true"
          >
            <i />
            <b>{knight.level}</b>
          </span>
          <div>
            <strong>
              {knight.level === 1 ? 'Basic' : knight.level === 2 ? 'Strong' : 'Mighty'} Knight
            </strong>
            <small>{knight.active ? 'Active and ready' : 'Inactive'}</small>
          </div>
        </header>
        <div className="knight-board-popover__actions">
          {knight.active ? null : (
            <KnightMenuButton
              action="Activate"
              icon="◉"
              cost={ACTIVATE_COST}
              availableResources={availableResources}
              disabled={!canActivate}
              reason={activateReason}
              onClick={onActivate}
            />
          )}
          {knight.level >= 3 ? null : (
            <KnightMenuButton
              action="Upgrade"
              icon="⇧"
              cost={KNIGHT_COST}
              availableResources={availableResources}
              disabled={!canUpgrade}
              reason={upgradeReason}
              onClick={onUpgrade}
            />
          )}
          {!knight.active || !canMove ? null : (
            <KnightMenuButton
              action="Move"
              icon="↪"
              availableResources={availableResources}
              disabled={false}
              reason={moveReason}
              onClick={onMove}
            />
          )}
        </div>
      </section>
    </>
  );
}
