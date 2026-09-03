import { describe, expect, it } from 'vitest';

import { boardPieceScale, boardRenderProfile } from '../../src/board-renderer/performance';

describe('board render profiles', () => {
  it('reduces GPU work without changing high-detail defaults', () => {
    expect(boardRenderProfile('HIGH')).toEqual({
      antialias: true,
      maximumResolution: 2,
      terrainDetails: true,
    });
    expect(boardRenderProfile('BALANCED').maximumResolution).toBe(1.5);
    expect(boardRenderProfile('PERFORMANCE')).toEqual({
      antialias: false,
      maximumResolution: 1,
      terrainDetails: false,
    });
  });

  it('keeps medium pieces at their existing size and provides bounded accessibility steps', () => {
    expect(boardPieceScale('SMALL')).toBe(0.82);
    expect(boardPieceScale('MEDIUM')).toBe(1);
    expect(boardPieceScale('LARGE')).toBe(1.14);
    expect(boardPieceScale('VERY_LARGE')).toBe(1.28);
  });
});
