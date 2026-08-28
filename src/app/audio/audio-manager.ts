import type { GameEvent } from '../../engine/core/events';
import { COMMODITIES } from '../../engine/content/commodities';

interface Tone {
  readonly frequency: number;
  readonly offset: number;
  readonly duration: number;
  readonly wave?: OscillatorType;
}

function eventTones(events: readonly GameEvent[]): readonly Tone[] {
  if (events.some((event) => event.type === 'GAME_WON')) {
    return [
      { frequency: 392, offset: 0, duration: 0.12 },
      { frequency: 523, offset: 0.11, duration: 0.15 },
      { frequency: 659, offset: 0.23, duration: 0.24 },
    ];
  }
  if (events.some((event) => event.type === 'LONGEST_ROAD_CHANGED' && event.playerId !== null)) {
    return [
      { frequency: 196, offset: 0, duration: 0.1, wave: 'triangle' },
      { frequency: 294, offset: 0.08, duration: 0.12, wave: 'triangle' },
      { frequency: 440, offset: 0.17, duration: 0.15, wave: 'square' },
      { frequency: 587, offset: 0.29, duration: 0.28, wave: 'triangle' },
    ];
  }
  if (events.some((event) => event.type === 'BARBARIAN_ATTACK_RESOLVED')) {
    return [
      { frequency: 92, offset: 0, duration: 0.24, wave: 'sawtooth' },
      { frequency: 138, offset: 0.16, duration: 0.2, wave: 'square' },
      { frequency: 207, offset: 0.3, duration: 0.28, wave: 'triangle' },
    ];
  }
  if (events.some((event) => event.type === 'METROPOLIS_CHANGED')) {
    return [
      { frequency: 392, offset: 0, duration: 0.11, wave: 'triangle' },
      { frequency: 587, offset: 0.1, duration: 0.14, wave: 'triangle' },
      { frequency: 784, offset: 0.22, duration: 0.2, wave: 'triangle' },
    ];
  }
  if (events.some((event) => event.type === 'BARBARIAN_ADVANCED')) {
    return [
      { frequency: 116, offset: 0, duration: 0.07, wave: 'square' },
      { frequency: 98, offset: 0.07, duration: 0.11, wave: 'sawtooth' },
    ];
  }
  if (events.some((event) => event.type === 'KN_DICE_ROLLED')) {
    return [
      { frequency: 185, offset: 0, duration: 0.045, wave: 'square' },
      { frequency: 237, offset: 0.045, duration: 0.045, wave: 'square' },
      { frequency: 201, offset: 0.09, duration: 0.05, wave: 'square' },
      { frequency: 480, offset: 0.12, duration: 0.1, wave: 'triangle' },
    ];
  }
  if (
    events.some((event) =>
      [
        'KNIGHT_BUILT',
        'KNIGHT_ACTIVATED',
        'KNIGHT_UPGRADED',
        'KNIGHT_MOVED',
        'KNIGHT_DISPLACED',
      ].includes(event.type),
    )
  ) {
    return [
      { frequency: 172, offset: 0, duration: 0.07, wave: 'square' },
      { frequency: 306, offset: 0.06, duration: 0.12, wave: 'triangle' },
    ];
  }
  if (events.some((event) => event.type === 'IMPROVEMENT_BOUGHT')) {
    const level =
      events.find(
        (event): event is Extract<GameEvent, { readonly type: 'IMPROVEMENT_BOUGHT' }> =>
          event.type === 'IMPROVEMENT_BOUGHT',
      )?.level ?? 1;
    return [
      { frequency: 350 + level * 35, offset: 0, duration: 0.1, wave: 'triangle' },
      { frequency: 470 + level * 40, offset: 0.09, duration: 0.15, wave: 'triangle' },
    ];
  }
  if (events.some((event) => event.type === 'WALL_BUILT')) {
    return [
      { frequency: 128, offset: 0, duration: 0.08, wave: 'square' },
      { frequency: 108, offset: 0.07, duration: 0.12, wave: 'square' },
    ];
  }
  if (events.some((event) => event.type === 'MERCHANT_MOVED')) {
    return [
      { frequency: 330, offset: 0, duration: 0.08, wave: 'triangle' },
      { frequency: 440, offset: 0.07, duration: 0.1, wave: 'triangle' },
      { frequency: 554, offset: 0.15, duration: 0.13, wave: 'triangle' },
    ];
  }
  if (
    events.some(
      (event) =>
        event.type === 'KN_PROGRESS_CARD_DRAWN' || event.type === 'KN_PROGRESS_CARD_PLAYED',
    )
  ) {
    return [
      { frequency: 540, offset: 0, duration: 0.08, wave: 'triangle' },
      { frequency: 720, offset: 0.07, duration: 0.12, wave: 'triangle' },
    ];
  }
  if (events.some((event) => event.type === 'PROGRESS_CARD_BOUGHT')) {
    return [
      { frequency: 620, offset: 0, duration: 0.08, wave: 'triangle' },
      { frequency: 820, offset: 0.07, duration: 0.11, wave: 'triangle' },
    ];
  }
  if (
    events.some(
      (event) => event.type === 'TRADE_COMPLETED' || event.type === 'COMMERCIAL_HARBOR_EXCHANGED',
    )
  ) {
    return [
      { frequency: 440, offset: 0, duration: 0.09 },
      { frequency: 587, offset: 0.08, duration: 0.13 },
    ];
  }
  if (events.some((event) => event.type === 'ROBBER_MOVED')) {
    return [{ frequency: 105, offset: 0, duration: 0.18, wave: 'sawtooth' }];
  }
  if (events.some((event) => event.type === 'BUILDING_UPGRADED')) {
    return [
      { frequency: 155, offset: 0, duration: 0.08, wave: 'square' },
      { frequency: 392, offset: 0.06, duration: 0.12 },
    ];
  }
  if (events.some((event) => event.type === 'BUILDING_PLACED')) {
    return [{ frequency: 180, offset: 0, duration: 0.09, wave: 'square' }];
  }
  if (events.some((event) => event.type === 'ROAD_BUILT')) {
    return [{ frequency: 145, offset: 0, duration: 0.07, wave: 'square' }];
  }
  if (events.some((event) => event.type === 'DICE_ROLLED')) {
    return [
      { frequency: 190, offset: 0, duration: 0.045, wave: 'square' },
      { frequency: 245, offset: 0.045, duration: 0.045, wave: 'square' },
      { frequency: 205, offset: 0.09, duration: 0.055, wave: 'square' },
    ];
  }
  if (events.some((event) => event.type === 'RESOURCES_PRODUCED')) {
    const commodityProduced = events.some(
      (event) =>
        event.type === 'RESOURCES_PRODUCED' &&
        Object.values(event.grants).some((bundle) =>
          COMMODITIES.some((commodity) => (bundle[commodity.id] ?? 0) > 0),
        ),
    );
    return commodityProduced
      ? [
          { frequency: 520, offset: 0, duration: 0.1, wave: 'triangle' },
          { frequency: 680, offset: 0.06, duration: 0.12, wave: 'sine' },
        ]
      : [{ frequency: 520, offset: 0, duration: 0.1, wave: 'triangle' }];
  }
  if (events.some((event) => event.type === 'TURN_STARTED')) {
    return [
      { frequency: 330, offset: 0, duration: 0.07 },
      { frequency: 392, offset: 0.07, duration: 0.09 },
    ];
  }
  return [];
}

class AudioManager {
  private context: AudioContext | null = null;

  playEvents(events: readonly GameEvent[], masterVolume: number, sfxVolume: number): void {
    this.play(eventTones(events), masterVolume, sfxVolume);
  }

  playInvalid(masterVolume: number, sfxVolume: number): void {
    this.play(
      [{ frequency: 115, offset: 0, duration: 0.1, wave: 'square' }],
      masterVolume,
      sfxVolume,
    );
  }

  playTimerTick(masterVolume: number, sfxVolume: number): void {
    this.play(
      [{ frequency: 880, offset: 0, duration: 0.035, wave: 'square' }],
      masterVolume,
      sfxVolume,
    );
  }

  private play(tones: readonly Tone[], masterVolume: number, sfxVolume: number): void {
    const volume = Math.max(0, Math.min(1, (masterVolume / 100) * (sfxVolume / 100))) * 0.08;
    if (volume === 0 || tones.length === 0 || globalThis.AudioContext === undefined) return;

    try {
      this.context ??= new AudioContext();
      const context = this.context;
      if (context.state === 'suspended') void context.resume();
      const start = context.currentTime + 0.01;
      for (const tone of tones) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = tone.wave ?? 'sine';
        oscillator.frequency.setValueAtTime(tone.frequency, start + tone.offset);
        gain.gain.setValueAtTime(0.0001, start + tone.offset);
        gain.gain.exponentialRampToValueAtTime(volume, start + tone.offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.offset + tone.duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start + tone.offset);
        oscillator.stop(start + tone.offset + tone.duration + 0.02);
      }
    } catch {
      // Audio is decorative. Unsupported or blocked Web Audio must never stop gameplay.
    }
  }
}

export const audioManager = new AudioManager();
