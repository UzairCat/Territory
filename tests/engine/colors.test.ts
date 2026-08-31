import { describe, expect, it } from 'vitest';

import { PLAYER_COLORS, randomAvailablePlayerColorId } from '../../src/engine/content/colors';

describe('player color assignment', () => {
  it('selects from the unused colors using the supplied random position', () => {
    const used = [PLAYER_COLORS[0]!.id, PLAYER_COLORS[2]!.id];
    const available = PLAYER_COLORS.filter((color) => !used.includes(color.id));

    expect(randomAvailablePlayerColorId(used, 0)).toBe(available[0]!.id);
    expect(randomAvailablePlayerColorId(used, 0.999_999)).toBe(available.at(-1)!.id);
    expect(used).not.toContain(randomAvailablePlayerColorId(used, 0.5));
  });
});
