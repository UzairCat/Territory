import type { ProgressCardEffect } from '../../engine/content/types';
import type { ResourceId } from '../../engine/core/ids';

const RESOURCE_GLYPHS: Readonly<Record<string, string>> = {
  wood: '🌲',
  brick: '🧱',
  grain: '🌾',
  livestock: '🐑',
  ore: '🪨',
  paper: '📜',
  cloth: '🧵',
  coin: '🪙',
};

export function resourceGlyph(resourceId: ResourceId): string {
  return RESOURCE_GLYPHS[resourceId] ?? '◆';
}

export function progressCardGlyph(effect: ProgressCardEffect): string {
  if (effect === 'MOVE_ROBBER') return '♞';
  if (effect === 'PLACE_TWO_ROADS') return '═';
  if (effect === 'TAKE_TWO_RESOURCES') return '✦';
  if (effect === 'MONOPOLY') return '◎';
  return '★';
}
