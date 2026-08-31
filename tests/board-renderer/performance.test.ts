import { describe, expect, it } from 'vitest';

import { boardRenderProfile } from '../../src/board-renderer/performance';

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
});
