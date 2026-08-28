// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PROGRESS_CARDS } from '../../src/engine/content/progress-cards';
import { KN_PROGRESS_CARDS } from '../../src/engine/content/kn-progress-cards';
import { KNProgressCardArtwork } from '../../src/ui/game/KNProgressCardArtwork';
import { ProgressCardArtwork } from '../../src/ui/game/ProgressCardArtwork';

describe('progress card artwork', () => {
  afterEach(cleanup);

  it('gives every classic card family its own illustration', () => {
    const { container } = render(
      <>
        {PROGRESS_CARDS.map((definition) => (
          <ProgressCardArtwork key={definition.id} definition={definition} />
        ))}
      </>,
    );

    const artwork = [...container.querySelectorAll<HTMLElement>('[data-progress-artwork]')];
    expect(artwork.map((element) => element.dataset.progressArtwork)).toEqual([
      'KNIGHT',
      'ROAD_BUILDING',
      'YEAR_OF_PLENTY',
      'MONOPOLY',
      'CHAPEL',
      'LIBRARY',
      'MARKET',
      'PALACE',
      'UNIVERSITY',
    ]);
    expect(container.querySelectorAll('svg')).toHaveLength(PROGRESS_CARDS.length);
    expect(container.querySelectorAll('.progress-card-illustration > strong')).toHaveLength(7);
  });

  it('uses family color without redundant T, P, or S letter badges', () => {
    const definition = KN_PROGRESS_CARDS[0];
    if (definition === undefined) throw new Error('K+N artwork fixture is missing.');
    const { container } = render(<KNProgressCardArtwork definition={definition} />);

    expect(container.querySelector('.kn-progress-art > small')).toBeNull();
    expect(container.querySelector('.kn-progress-art--science')).toBeInTheDocument();
  });
});
