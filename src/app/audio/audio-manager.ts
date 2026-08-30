import type { GameEvent } from '../../engine/core/events';
import type { PlayerId } from '../../engine/core/ids';
import {
  BACKGROUND_MUSIC_TRACKS,
  SOUND_ASSET_URLS,
  type MusicTrack,
  type SoundCue,
} from './audio-catalog';

export interface ScheduledSoundCue {
  readonly cue: SoundCue;
  readonly delayMs: number;
}

function cue(cueName: SoundCue, delayMs = 0): ScheduledSoundCue {
  return { cue: cueName, delayMs };
}

function playerCanHearPrivateCue(
  viewerPlayerId: PlayerId | null,
  eventPlayerId: PlayerId,
): boolean {
  return viewerPlayerId === null || viewerPlayerId === eventPlayerId;
}

export function audioCuesForEvents(
  events: readonly GameEvent[],
  viewerPlayerId: PlayerId | null = null,
): readonly ScheduledSoundCue[] {
  if (events.length === 0) return [];
  if (events.some((event) => event.type === 'GAME_WON')) return [cue('VICTORY')];

  const perkUnlock = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'CITY_IMPROVEMENT_PERK_UNLOCKED' }> =>
      event.type === 'CITY_IMPROVEMENT_PERK_UNLOCKED',
  );
  if (perkUnlock !== undefined) {
    if (!playerCanHearPrivateCue(viewerPlayerId, perkUnlock.playerId)) {
      return [];
    }
    return [cue('PERK')];
  }

  if (events.some((event) => event.type === 'LONGEST_ROAD_CHANGED' && event.playerId !== null)) {
    return [cue('LONGEST_ROAD')];
  }

  const turnStarted = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'TURN_STARTED' }> =>
      event.type === 'TURN_STARTED',
  );
  if (turnStarted !== undefined && playerCanHearPrivateCue(viewerPlayerId, turnStarted.playerId)) {
    return [cue('TURN')];
  }

  const diceRolled = events.some(
    (event) => event.type === 'DICE_ROLLED' || event.type === 'KN_DICE_ROLLED',
  );
  const discardAlert = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'ROBBER_SEQUENCE_STARTED' }> =>
      event.type === 'ROBBER_SEQUENCE_STARTED',
  );
  const viewerMustDiscard =
    discardAlert !== undefined &&
    discardAlert.discardPlayerIds.length > 0 &&
    (viewerPlayerId === null || discardAlert.discardPlayerIds.includes(viewerPlayerId));
  const cityCollapsed = events.some((event) => event.type === 'CITY_DOWNGRADED');
  const barbarianBattle = events.some((event) => event.type === 'BARBARIAN_ATTACK_RESOLVED');
  if (diceRolled) {
    const requests: ScheduledSoundCue[] = [cue('DICE_ROLL')];
    if (barbarianBattle) requests.push(cue('BARBARIAN_BATTLE', 700));
    if (cityCollapsed) requests.push(cue('CITY_COLLAPSE', barbarianBattle ? 1_150 : 760));
    if (viewerMustDiscard) {
      requests.push(
        cue(
          'DISCARD_SLAM',
          cityCollapsed ? (barbarianBattle ? 1_650 : 1_260) : barbarianBattle ? 1_220 : 650,
        ),
      );
    }
    return requests;
  }

  if (barbarianBattle || cityCollapsed) {
    return [
      ...(barbarianBattle ? [cue('BARBARIAN_BATTLE')] : []),
      ...(cityCollapsed ? [cue('CITY_COLLAPSE', barbarianBattle ? 520 : 0)] : []),
    ];
  }
  if (viewerMustDiscard) return [cue('DISCARD_SLAM')];
  if (events.some((event) => event.type === 'ROBBER_MOVED')) return [cue('STONE_PLACE')];
  if (events.some((event) => event.type === 'KNIGHT_ACTIVATED')) return [cue('SWORD_DRAW')];
  if (
    events.some((event) =>
      [
        'BUILDING_PLACED',
        'BUILDING_UPGRADED',
        'KNIGHT_BUILT',
        'WALL_BUILT',
        'METROPOLIS_CHANGED',
      ].includes(event.type),
    )
  ) {
    return [cue('STONE_PLACE')];
  }
  if (
    events.some((event) =>
      ['KNIGHT_UPGRADED', 'KNIGHT_MOVED', 'KNIGHT_DISPLACED', 'KNIGHT_REMOVED'].includes(
        event.type,
      ),
    )
  ) {
    return [cue('KNIGHT_MOVE')];
  }
  const improvement = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'IMPROVEMENT_BOUGHT' }> =>
      event.type === 'IMPROVEMENT_BOUGHT',
  );
  if (improvement !== undefined && playerCanHearPrivateCue(viewerPlayerId, improvement.playerId)) {
    return [cue('IMPROVEMENT')];
  }
  if (events.some((event) => event.type === 'ROAD_BUILT')) return [cue('ROAD_PLACE')];
  if (events.some((event) => event.type === 'TRADE_OFFERED')) return [cue('TRADE')];
  if (
    events.some(
      (event) =>
        event.type === 'TRADE_COMPLETED' && event.tradeId !== null && event.recipientId !== null,
    )
  ) {
    return [cue('TRADE_ACCEPT')];
  }
  return [];
}

const CUE_VOLUME: Readonly<Record<SoundCue, number>> = {
  BARBARIAN_BATTLE: 0.7,
  CITY_COLLAPSE: 0.76,
  DICE_ROLL: 0.72,
  DISCARD_SLAM: 0.74,
  GAME_BEGIN: 0.72,
  IMPROVEMENT: 0.56,
  INVALID: 0.64,
  KNIGHT_MOVE: 0.56,
  LONGEST_ROAD: 0.72,
  PERK: 0.66,
  ROAD_PLACE: 0.58,
  STONE_PLACE: 0.72,
  SWORD_DRAW: 0.68,
  TIMER: 0.42,
  TRADE: 0.54,
  TRADE_ACCEPT: 0.58,
  TURN: 0.56,
  VICTORY: 0.78,
};

const PLAYBACK_VARIATION: Partial<Record<SoundCue, number>> = {
  CITY_COLLAPSE: 0.018,
  DICE_ROLL: 0.028,
  DISCARD_SLAM: 0.015,
  KNIGHT_MOVE: 0.025,
  ROAD_PLACE: 0.032,
  STONE_PLACE: 0.025,
};

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mediaPlaybackAvailable(): boolean {
  if (globalThis.Audio === undefined) return false;
  return !globalThis.navigator?.userAgent.toLocaleLowerCase().includes('jsdom');
}

export function backgroundMusicTrackForGame(gameSessionId: string): MusicTrack {
  let hash = 2_166_136_261;
  for (let index = 0; index < gameSessionId.length; index += 1) {
    hash = Math.imul(hash ^ gameSessionId.charCodeAt(index), 16_777_619);
  }
  return BACKGROUND_MUSIC_TRACKS[(hash >>> 0) % BACKGROUND_MUSIC_TRACKS.length]!;
}

class AudioManager {
  private preloadedEffects = new Map<SoundCue, HTMLAudioElement>();
  private activeEffects = new Set<HTMLAudioElement>();
  private scheduledEffects = new Set<ReturnType<typeof globalThis.setTimeout>>();
  private musicActive = false;
  private musicElement: HTMLAudioElement | null = null;
  private musicTrack: MusicTrack | null = null;
  private musicSessionId: string | null = null;
  private masterVolume = 0;
  private musicVolume = 0;
  private musicDuckTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private musicDucked = false;
  private lastGameBeginSessionId: string | null = null;
  private unlockHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;

  playEvents(
    events: readonly GameEvent[],
    masterVolume: number,
    sfxVolume: number,
    viewerPlayerId: PlayerId | null = null,
  ): void {
    for (const request of audioCuesForEvents(events, viewerPlayerId)) {
      this.scheduleCue(request.cue, request.delayMs, masterVolume, sfxVolume);
    }
  }

  playInvalid(masterVolume: number, sfxVolume: number): void {
    this.scheduleCue('INVALID', 0, masterVolume, sfxVolume);
  }

  playGameBegin(gameSessionId: string, masterVolume: number, sfxVolume: number): void {
    if (this.lastGameBeginSessionId === gameSessionId) return;
    this.lastGameBeginSessionId = gameSessionId;
    this.scheduleCue('GAME_BEGIN', 0, masterVolume, sfxVolume);
  }

  playTimerTick(masterVolume: number, sfxVolume: number): void {
    this.scheduleCue('TIMER', 0, masterVolume, sfxVolume);
  }

  startMusic(gameSessionId: string): void {
    if (this.musicActive && this.musicSessionId === gameSessionId) return;
    if (this.musicActive) this.stopMusic();
    this.musicActive = true;
    this.musicSessionId = gameSessionId;
    this.musicTrack = backgroundMusicTrackForGame(gameSessionId);
    this.preloadEffects();
    if (globalThis.document !== undefined) {
      this.visibilityHandler = () => {
        if (!this.musicActive || this.musicElement === null) return;
        if (globalThis.document.visibilityState === 'hidden') this.musicElement.pause();
        else if (this.targetMusicVolume() > 0) this.tryPlayMusic(this.musicElement);
      };
      globalThis.document.addEventListener('visibilitychange', this.visibilityHandler);
    }
    if (this.targetMusicVolume() > 0) this.playMusicTrack();
  }

  setMusicVolume(masterVolume: number, musicVolume: number): void {
    this.masterVolume = clampUnit(masterVolume / 100);
    this.musicVolume = clampUnit(musicVolume / 100);
    const target = this.targetMusicVolume();
    if (this.musicElement !== null) {
      this.musicElement.volume = this.musicDucked ? target * 0.14 : target;
      if (target === 0) this.musicElement.pause();
      else if (this.musicActive) this.tryPlayMusic(this.musicElement);
    } else if (this.musicActive && target > 0) {
      this.playMusicTrack();
    }
  }

  stopMusic(): void {
    this.musicActive = false;
    this.musicSessionId = null;
    this.musicTrack = null;
    this.removeUnlockHandler();
    if (this.visibilityHandler !== null && globalThis.document !== undefined) {
      globalThis.document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.musicDuckTimer !== null) {
      globalThis.clearTimeout(this.musicDuckTimer);
      this.musicDuckTimer = null;
    }
    this.musicDucked = false;
    if (this.musicElement !== null) {
      this.musicElement.pause();
      this.musicElement.removeAttribute('src');
      this.musicElement.load();
      this.musicElement = null;
    }
    for (const timer of this.scheduledEffects) globalThis.clearTimeout(timer);
    this.scheduledEffects.clear();
  }

  private scheduleCue(
    cueName: SoundCue,
    delayMs: number,
    masterVolume: number,
    sfxVolume: number,
  ): void {
    if (delayMs <= 0) {
      this.playCue(cueName, masterVolume, sfxVolume);
      return;
    }
    const timer = globalThis.setTimeout(() => {
      this.scheduledEffects.delete(timer);
      this.playCue(cueName, masterVolume, sfxVolume);
    }, delayMs);
    this.scheduledEffects.add(timer);
  }

  private playCue(cueName: SoundCue, masterVolume: number, sfxVolume: number): void {
    const volume = clampUnit(masterVolume / 100) * clampUnit(sfxVolume / 100) * CUE_VOLUME[cueName];
    if (volume === 0 || !mediaPlaybackAvailable()) return;
    const source = this.effectSource(cueName);
    if (source === null) return;
    const voice = source.cloneNode(true) as HTMLAudioElement;
    voice.volume = clampUnit(volume);
    const variation = PLAYBACK_VARIATION[cueName] ?? 0;
    if (variation > 0) voice.playbackRate = 1 + (Math.random() * 2 - 1) * variation;
    const cleanup = () => this.activeEffects.delete(voice);
    voice.addEventListener('ended', cleanup, { once: true });
    voice.addEventListener('error', cleanup, { once: true });
    this.activeEffects.add(voice);
    try {
      const playback = voice.play();
      if (playback !== undefined) void playback.catch(cleanup);
    } catch {
      cleanup();
    }
    if (cueName === 'VICTORY') this.duckMusic(5_100);
    else if (cueName === 'GAME_BEGIN') this.duckMusic(3_400);
    else if (cueName === 'LONGEST_ROAD') this.duckMusic(3_050);
    else if (cueName === 'PERK') this.duckMusic(2_900);
  }

  private preloadEffects(): void {
    if (!mediaPlaybackAvailable() || this.preloadedEffects.size > 0) return;
    for (const [cueName, url] of Object.entries(SOUND_ASSET_URLS) as readonly [
      SoundCue,
      string,
    ][]) {
      const audio = new Audio(url);
      audio.preload = 'auto';
      this.preloadedEffects.set(cueName, audio);
    }
  }

  private effectSource(cueName: SoundCue): HTMLAudioElement | null {
    this.preloadEffects();
    const preloaded = this.preloadedEffects.get(cueName);
    if (preloaded !== undefined) return preloaded;
    if (!mediaPlaybackAvailable()) return null;
    const audio = new Audio(SOUND_ASSET_URLS[cueName]);
    audio.preload = 'auto';
    this.preloadedEffects.set(cueName, audio);
    return audio;
  }

  private targetMusicVolume(): number {
    return clampUnit(this.masterVolume * this.musicVolume * 0.52);
  }

  private playMusicTrack(): void {
    if (!this.musicActive || !mediaPlaybackAvailable() || this.targetMusicVolume() === 0) return;
    const track = this.musicTrack;
    if (track === null) return;
    if (this.musicElement !== null) this.musicElement.pause();
    const audio = new Audio(track.url);
    audio.preload = 'auto';
    audio.loop = true;
    audio.volume = this.musicDucked ? this.targetMusicVolume() * 0.14 : this.targetMusicVolume();
    audio.addEventListener(
      'error',
      () => {
        if (this.musicElement !== audio) return;
        this.musicElement = null;
      },
      { once: true },
    );
    this.musicElement = audio;
    this.tryPlayMusic(audio);
  }

  private tryPlayMusic(audio: HTMLAudioElement): void {
    if (
      !this.musicActive ||
      this.targetMusicVolume() === 0 ||
      (globalThis.document !== undefined && globalThis.document.visibilityState === 'hidden')
    ) {
      return;
    }
    try {
      const playback = audio.play();
      if (playback !== undefined) {
        void playback
          .then(() => this.removeUnlockHandler())
          .catch(() => this.installUnlockHandler());
      }
    } catch {
      this.installUnlockHandler();
    }
  }

  private installUnlockHandler(): void {
    if (this.unlockHandler !== null || !this.musicActive) return;
    this.unlockHandler = () => {
      const music = this.musicElement;
      if (music === null) this.playMusicTrack();
      else this.tryPlayMusic(music);
    };
    globalThis.addEventListener('pointerdown', this.unlockHandler, { capture: true, once: true });
    globalThis.addEventListener('keydown', this.unlockHandler, { capture: true, once: true });
  }

  private removeUnlockHandler(): void {
    if (this.unlockHandler === null) return;
    globalThis.removeEventListener('pointerdown', this.unlockHandler, { capture: true });
    globalThis.removeEventListener('keydown', this.unlockHandler, { capture: true });
    this.unlockHandler = null;
  }

  private duckMusic(durationMs: number): void {
    if (this.musicElement === null) return;
    this.musicDucked = true;
    this.musicElement.volume = this.targetMusicVolume() * 0.14;
    if (this.musicDuckTimer !== null) globalThis.clearTimeout(this.musicDuckTimer);
    this.musicDuckTimer = globalThis.setTimeout(() => {
      this.musicDuckTimer = null;
      this.musicDucked = false;
      if (this.musicElement !== null) this.musicElement.volume = this.targetMusicVolume();
    }, durationMs);
  }
}

export const audioManager = new AudioManager();
