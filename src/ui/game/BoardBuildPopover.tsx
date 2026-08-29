import type { ReactNode } from 'react';

import type { ResourceBundle } from '../../engine/content/types';
import type { BoardViewportPoint } from '../../board-renderer/render-model';
import type { ConstructionType } from '../../engine/rules/build-rules';
import {
  ActionSupplyBadge,
  CityActionIcon,
  HouseActionIcon,
  KnightActionIcon,
  ResourceCostCards,
  RoadActionIcon,
  WallActionIcon,
} from './ActionArtwork';

export type BoardPurchaseType = ConstructionType | 'KNIGHT' | 'WALL';

export interface BoardBuildChoice {
  readonly type: BoardPurchaseType;
  readonly cost: ResourceBundle;
  readonly availableResources: ResourceBundle;
  readonly canBuild: boolean;
  readonly remaining: number;
  readonly onBuild: () => void;
}

interface BoardBuildPopoverProps {
  readonly position: BoardViewportPoint;
  readonly choices: readonly BoardBuildChoice[];
  readonly onClose: () => void;
}

const COPY: Readonly<
  Record<
    BoardPurchaseType,
    { readonly name: string; readonly action: string; readonly icon: ReactNode }
  >
> = {
  ROAD: { name: 'Road', action: 'Build Road', icon: <RoadActionIcon /> },
  HOUSE: { name: 'House', action: 'Build House', icon: <HouseActionIcon /> },
  MANSION: { name: 'City', action: 'Build City', icon: <CityActionIcon /> },
  KNIGHT: {
    name: 'Knight',
    action: 'Build Basic Knight',
    icon: <KnightActionIcon />,
  },
  WALL: {
    name: 'City Wall',
    action: 'Build City Wall',
    icon: <WallActionIcon />,
  },
};

export function BoardBuildPopover({ position, choices, onClose }: BoardBuildPopoverProps) {
  const viewportWidth = globalThis.innerWidth || 1200;
  const viewportHeight = globalThis.innerHeight || 800;
  const placeAbove = position.y > 230;
  const left = Math.max(8.5 * 16, Math.min(viewportWidth - 8.5 * 16, position.x));
  const top = Math.max(7 * 16, Math.min(viewportHeight - 7 * 16, position.y));

  return (
    <>
      <button
        type="button"
        className="board-build-popover__scrim"
        aria-label="Close build menu"
        onClick={onClose}
      />
      <section
        className={`board-build-popover board-build-popover--${placeAbove ? 'above' : 'below'} ${choices.length > 1 ? 'board-build-popover--multiple' : ''}`}
        style={{ left, top }}
        role="dialog"
        aria-label={
          choices.length === 1 && choices[0] !== undefined
            ? `Build ${COPY[choices[0].type].name}`
            : 'Build on this board location'
        }
      >
        {choices.map((choice) => {
          const copy = COPY[choice.type];
          return (
            <div key={choice.type} className="board-build-popover__option">
              <ResourceCostCards
                resources={choice.cost}
                availableResources={choice.availableResources}
                className="board-build-popover__cost"
              />
              <button
                type="button"
                className="board-build-popover__choice"
                disabled={!choice.canBuild}
                title={choice.canBuild ? copy.action : undefined}
                onClick={choice.onBuild}
              >
                <ActionSupplyBadge
                  count={choice.remaining}
                  label={`${copy.name} pieces remaining`}
                />
                {copy.icon}
                <span className="visually-hidden">{copy.action}</span>
              </button>
            </div>
          );
        })}
      </section>
    </>
  );
}
