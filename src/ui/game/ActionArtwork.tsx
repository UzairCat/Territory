import type { CSSProperties } from 'react';

import { RESOURCES, RESOURCE_IDS } from '../../engine/content/resources';
import type { ResourceBundle } from '../../engine/content/types';
import { resourceGlyph } from './game-icons';
import { ResourceArtwork } from './ResourceArtwork';

interface ActionSupplyBadgeProps {
  readonly count: number;
  readonly label: string;
}

interface PurchaseCostPreviewProps {
  readonly resources: ResourceBundle;
  readonly availableResources?: ResourceBundle | undefined;
}

interface ResourceCostCardsProps {
  readonly resources: ResourceBundle;
  readonly availableResources?: ResourceBundle | undefined;
  readonly className?: string;
  readonly hiddenFromAssistiveTechnology?: boolean;
}

export function ActionSupplyBadge({ count, label }: ActionSupplyBadgeProps) {
  return (
    <span className="action-supply-badge" title={label} aria-hidden="true">
      {count}
    </span>
  );
}

export function ResourceCostCards({
  resources,
  availableResources,
  className = '',
  hiddenFromAssistiveTechnology = false,
}: ResourceCostCardsProps) {
  const cards = RESOURCES.flatMap((resource) =>
    Array.from({ length: resources[resource.id] ?? 0 }, (_, index) => ({ resource, index })),
  );

  return (
    <span
      className={`purchase-cost-preview__cards ${className}`.trim()}
      aria-hidden={hiddenFromAssistiveTechnology || undefined}
    >
      {cards.map(({ resource, index }) => {
        const missing =
          availableResources !== undefined && index >= (availableResources[resource.id] ?? 0);
        return (
          <span
            key={`${resource.id}-${index}`}
            className={`purchase-cost-card purchase-cost-card--${resource.iconKey} ${missing ? 'purchase-cost-card--missing' : ''}`}
            style={{ '--cost-color': resource.color } as CSSProperties}
            title={hiddenFromAssistiveTechnology ? undefined : resource.displayName}
          >
            <span className="purchase-cost-card__icon">
              <ResourceArtwork resourceId={resource.id} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function PurchaseCostPreview({ resources, availableResources }: PurchaseCostPreviewProps) {
  return (
    <span className="purchase-cost-preview" aria-hidden="true">
      <span className="purchase-cost-preview__label">Cost</span>
      <ResourceCostCards
        resources={resources}
        availableResources={availableResources}
        hiddenFromAssistiveTechnology
      />
    </span>
  );
}

export function TradeActionIcon() {
  return (
    <span className="action-art action-art--trade" aria-hidden="true">
      <span className="trade-art-card trade-art-card--wood">
        {resourceGlyph(RESOURCE_IDS.wood)}
      </span>
      <span className="trade-art-arrows">↔</span>
      <span className="trade-art-card trade-art-card--brick">
        {resourceGlyph(RESOURCE_IDS.brick)}
      </span>
    </span>
  );
}

export function ProgressActionIcon() {
  return (
    <span className="action-art action-art--progress" aria-hidden="true">
      <span className="progress-deck-art progress-deck-art--back" />
      <span className="progress-deck-art progress-deck-art--front">
        <span>✦</span>
      </span>
    </span>
  );
}

export function RoadActionIcon() {
  return (
    <span className="action-art action-art--road" aria-hidden="true">
      <span className="road-piece-art" />
    </span>
  );
}

export function HouseActionIcon() {
  return (
    <span className="action-art action-art--house" aria-hidden="true">
      <span className="house-piece-art">
        <span className="house-piece-art__chimney" />
        <span className="house-piece-art__roof" />
        <span className="house-piece-art__wall">
          <span className="house-piece-art__door" />
          <span className="house-piece-art__window" />
        </span>
      </span>
    </span>
  );
}

export function CityActionIcon() {
  return (
    <span className="action-art action-art--city" aria-hidden="true">
      <span className="city-piece-art">
        <span className="city-piece-art__building city-piece-art__building--left">
          <span />
        </span>
        <span className="city-piece-art__building city-piece-art__building--tower">
          <span />
          <span />
        </span>
        <span className="city-piece-art__building city-piece-art__building--right">
          <span />
        </span>
      </span>
    </span>
  );
}

export function WallActionIcon() {
  return (
    <span className="action-art action-art--wall" aria-hidden="true">
      <span className="wall-piece-art">
        <span className="wall-piece-art__body">
          <i />
          <i />
          <i />
        </span>
        <span className="wall-piece-art__merlon wall-piece-art__merlon--left" />
        <span className="wall-piece-art__merlon wall-piece-art__merlon--middle" />
        <span className="wall-piece-art__merlon wall-piece-art__merlon--right" />
      </span>
    </span>
  );
}

/** Reserved artwork for a future Mansion piece. */
export function MansionActionIcon() {
  return (
    <span className="action-art action-art--mansion" aria-hidden="true">
      <span className="mansion-piece-art">
        <span className="mansion-piece-art__roof" />
        <span className="mansion-piece-art__house" />
        <span className="mansion-piece-art__wing mansion-piece-art__wing--left" />
        <span className="mansion-piece-art__wing mansion-piece-art__wing--right" />
      </span>
    </span>
  );
}

export function EndTurnActionIcon() {
  return (
    <span className="action-art action-art--end" aria-hidden="true">
      <span>›</span>
      <span>›</span>
    </span>
  );
}
