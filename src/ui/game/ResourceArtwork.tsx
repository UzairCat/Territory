import { RESOURCE_IDS } from '../../engine/content/resources';
import { COMMODITY_IDS } from '../../engine/content/commodities';
import type { ResourceId } from '../../engine/core/ids';
import { resourceGlyph } from './game-icons';

interface ResourceArtworkProps {
  readonly resourceId: ResourceId;
}

export function ResourceArtwork({ resourceId }: ResourceArtworkProps) {
  if (resourceId === RESOURCE_IDS.wood) {
    return (
      <span className="resource-illustration resource-illustration--wood" aria-hidden="true">
        <span className="resource-tree__ground" />
        <span className="resource-tree__trunk" />
        <span className="resource-tree__crown resource-tree__crown--top" />
        <span className="resource-tree__crown resource-tree__crown--middle" />
        <span className="resource-tree__crown resource-tree__crown--bottom" />
        <span className="resource-tree__highlight" />
      </span>
    );
  }

  if (resourceId === RESOURCE_IDS.brick) {
    return (
      <span className="resource-illustration resource-illustration--brick" aria-hidden="true">
        <span className="resource-brick-wall">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} />
          ))}
        </span>
      </span>
    );
  }

  if (resourceId === RESOURCE_IDS.grain) {
    return (
      <span className="resource-illustration resource-illustration--grain" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className={`resource-wheat__stalk resource-wheat__stalk--${index + 1}`}>
            <i />
          </span>
        ))}
        <span className="resource-wheat__tie" />
      </span>
    );
  }

  if (resourceId === RESOURCE_IDS.ore) {
    return (
      <span className="resource-illustration resource-illustration--ore" aria-hidden="true">
        <span className="resource-ore__shadow" />
        <span className="resource-ore__rock resource-ore__rock--left" />
        <span className="resource-ore__rock resource-ore__rock--back" />
        <span className="resource-ore__rock resource-ore__rock--center" />
        <span className="resource-ore__rock resource-ore__rock--right" />
        <span className="resource-ore__spark resource-ore__spark--large" />
        <span className="resource-ore__spark resource-ore__spark--small" />
      </span>
    );
  }

  if (resourceId === COMMODITY_IDS.paper) {
    return (
      <span className="resource-illustration resource-illustration--paper" aria-hidden="true">
        <span className="resource-paper__sheet">
          <i />
          <i />
          <i />
        </span>
        <span className="resource-paper__quill" />
      </span>
    );
  }

  if (resourceId === COMMODITY_IDS.cloth) {
    return (
      <span className="resource-illustration resource-illustration--cloth" aria-hidden="true">
        <span className="resource-cloth__roll" />
        <span className="resource-cloth__fold">
          <i />
          <i />
        </span>
      </span>
    );
  }

  if (resourceId === COMMODITY_IDS.coin) {
    return (
      <span className="resource-illustration resource-illustration--coin" aria-hidden="true">
        <span className="resource-coin resource-coin--back">
          <i className="resource-coin__mint-mark" />
        </span>
        <span className="resource-coin resource-coin--middle">
          <i className="resource-coin__mint-mark" />
        </span>
        <span className="resource-coin resource-coin--front">
          <i className="resource-coin__laurel" />
          <i className="resource-coin__profile" />
          <i className="resource-coin__beading" />
        </span>
      </span>
    );
  }

  return (
    <span className="resource-illustration resource-illustration--livestock" aria-hidden="true">
      <span className="resource-livestock__grass" />
      <span className="resource-livestock__sheep">{resourceGlyph(resourceId)}</span>
    </span>
  );
}
