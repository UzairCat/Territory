import { colorId } from '../core/ids';
import type { PlayerColorDefinition } from './types';

export const PLAYER_COLORS: readonly PlayerColorDefinition[] = [
  { id: colorId('cobalt'), displayName: 'Cobalt', hex: '#4384e6', marker: 'CIRCLE' },
  { id: colorId('crimson'), displayName: 'Crimson', hex: '#dc5264', marker: 'DIAMOND' },
  { id: colorId('gold'), displayName: 'Gold', hex: '#d9a433', marker: 'TRIANGLE' },
  { id: colorId('violet'), displayName: 'Violet', hex: '#9272df', marker: 'SQUARE' },
] as const;
