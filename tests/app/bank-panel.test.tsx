// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { BankPanel } from '../../src/ui/game/BankPanel';

describe('BankPanel', () => {
  afterEach(cleanup);

  it('shows exact supply counts when Hide Bank Cards is off', () => {
    const { container } = render(
      <BankPanel bank={resourceBundle([[RESOURCE_IDS.wood, 17]])} progressCardsRemaining={25} />,
    );
    const wood = container.querySelector('[data-bank-card="wood"]');

    expect(wood).toHaveAttribute('title', 'Wood: 17 cards');
    expect(wood?.querySelector('strong')).toHaveTextContent('17');
  });

  it('removes exact supply counts when Hide Bank Cards is on', () => {
    const { container } = render(
      <BankPanel
        bank={resourceBundle([[RESOURCE_IDS.wood, 17]])}
        progressCardsRemaining={25}
        hideCounts
      />,
    );
    const wood = container.querySelector('[data-bank-card="wood"]');

    expect(wood).toHaveAttribute('title', 'Wood: card count hidden');
    expect(wood?.querySelector('strong')).toBeNull();
    expect(wood).toHaveTextContent('Wood: card count hidden');
  });
});
