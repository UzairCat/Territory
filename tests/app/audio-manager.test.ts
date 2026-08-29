import { afterEach, describe, expect, it, vi } from 'vitest';

import { audioManager } from '../../src/app/audio/audio-manager';
import type { GameEvent } from '../../src/engine/core/events';
import { TEST_PLAYER_IDS } from '../helpers/game-state';

const originalAudioContext = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');

afterEach(() => {
  if (originalAudioContext === undefined) {
    Reflect.deleteProperty(globalThis, 'AudioContext');
  } else {
    Object.defineProperty(globalThis, 'AudioContext', originalAudioContext);
  }
});

describe('game audio', () => {
  it('plays a dedicated five-note flourish for a level-three perk unlock', () => {
    const frequencies: number[] = [];
    class FakeAudioContext {
      readonly currentTime = 0;
      readonly destination = {};
      readonly state = 'running';

      createOscillator() {
        return {
          type: 'sine',
          frequency: {
            setValueAtTime: (frequency: number) => frequencies.push(frequency),
          },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
      }

      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        };
      }

      resume(): Promise<void> {
        return Promise.resolve();
      }
    }
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    });
    const events: readonly GameEvent[] = [
      {
        type: 'CITY_IMPROVEMENT_PERK_UNLOCKED',
        playerId: TEST_PLAYER_IDS[0],
        track: 'SCIENCE',
        perk: 'AQUEDUCT',
      },
    ];

    audioManager.playEvents(events, 100, 100);

    expect(frequencies).toEqual([262, 327.5, 393, 524, 786]);
  });
});
