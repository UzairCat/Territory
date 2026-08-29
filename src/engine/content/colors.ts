import { colorId } from '../core/ids';
import type { PlayerColorDefinition } from './types';

export const PLAYER_COLORS: readonly PlayerColorDefinition[] = [
  { id: colorId('cobalt'), displayName: 'Cobalt', hex: '#4384e6', marker: 'CIRCLE' },
  { id: colorId('crimson'), displayName: 'Crimson', hex: '#dc5264', marker: 'DIAMOND' },
  { id: colorId('gold'), displayName: 'Gold', hex: '#d9a433', marker: 'TRIANGLE' },
  { id: colorId('violet'), displayName: 'Violet', hex: '#9272df', marker: 'SQUARE' },
  { id: colorId('emerald'), displayName: 'Emerald', hex: '#38a169', marker: 'CIRCLE' },
  { id: colorId('tangerine'), displayName: 'Tangerine', hex: '#ed7b3a', marker: 'DIAMOND' },
  { id: colorId('turquoise'), displayName: 'Turquoise', hex: '#2bb7a9', marker: 'TRIANGLE' },
  { id: colorId('rose'), displayName: 'Rose', hex: '#ec6f9e', marker: 'SQUARE' },
  { id: colorId('lime'), displayName: 'Lime', hex: '#8fbf3f', marker: 'CIRCLE' },
  { id: colorId('azure'), displayName: 'Azure', hex: '#2fadd2', marker: 'DIAMOND' },
  { id: colorId('copper'), displayName: 'Copper', hex: '#b86f45', marker: 'TRIANGLE' },
  { id: colorId('slate'), displayName: 'Slate', hex: '#63758a', marker: 'SQUARE' },
  { id: colorId('ivory'), displayName: 'Ivory', hex: '#ddd6bf', marker: 'CIRCLE' },
  { id: colorId('onyx'), displayName: 'Onyx', hex: '#3c4148', marker: 'DIAMOND' },
] as const;
