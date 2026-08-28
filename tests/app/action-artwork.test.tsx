// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { ResourceCostCards } from '../../src/ui/game/ActionArtwork';

describe('purchase cost artwork', () => {
  afterEach(cleanup);

  it('dims only the individual required cards the player is missing', () => {
    const { container } = render(
      <ResourceCostCards
        resources={resourceBundle([
          [RESOURCE_IDS.grain, 2],
          [RESOURCE_IDS.ore, 3],
        ])}
        availableResources={resourceBundle([
          [RESOURCE_IDS.grain, 1],
          [RESOURCE_IDS.ore, 1],
        ])}
      />,
    );

    const cards = [...container.querySelectorAll('.purchase-cost-card')];
    expect(cards).toHaveLength(5);
    expect(container.querySelectorAll('.purchase-cost-card .resource-illustration')).toHaveLength(
      5,
    );
    expect(cards.map((card) => card.classList.contains('purchase-cost-card--missing'))).toEqual([
      false,
      true,
      false,
      true,
      true,
    ]);
  });
});
