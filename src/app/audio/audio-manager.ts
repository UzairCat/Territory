import type { GameEvent } from '../../engine/core/events';
import type { PlayerId } from '../../engine/core/ids';
import {
  MEDIEVAL_MUSIC_TRACKS,
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
      return [cue('IMPROVEMENT')];
    }
    return [
      cue(
        perkUnlock.track === 'SCIENCE'
          ? 'PERK_SCIENCE'
          : perkUnlock.track === 'TRADE'
            ? 'PERK_TRADE'
            : 'PERK_POLITICS',
      ),
    ];
  }

  if (events.some((event) => event.type === 'LONGEST_ROAD_CHANGED' && event.playerId !== null)) {
    return [cue('LONGEST_ROAD')];
  }

  const diceRolled = events.some(
    (event) => event.type === 'DICE_ROLLED' || event.type === 'KN_DICE_ROLLED',
  );
  const cityCollapsed = events.some((event) => event.type === 'CITY_DOWNGRADED');
  const barbarianBattle = events.some((event) => event.type === 'BARBARIAN_ATTACK_RESOLVED');
  const barbarianAdvanced = events.some((event) => event.type === 'BARBARIAN_ADVANCED');
  if (diceRolled) {
    const requests: ScheduledSoundCue[] = [cue('DICE_ROLL')];
    if (barbarianBattle) requests.push(cue('BARBARIAN_BATTLE', 700));
    else if (barbarianAdvanced) requests.push(cue('BARBARIAN_ADVANCE', 720));
    if (cityCollapsed) requests.push(cue('CITY_COLLAPSE', barbarianBattle ? 1_150 : 760));
    const drawnCard = events.find(
      (event): event is Extract<GameEvent, { readonly type: 'KN_PROGRESS_CARD_DRAWN' }> =>
        event.type === 'KN_PROGRESS_CARD_DRAWN',
    );
    if (drawnCard !== undefined && playerCanHearPrivateCue(viewerPlayerId, drawnCard.playerId)) {
      requests.push(cue('CARD', 760));
    }
    return requests;
  }

  if (barbarianBattle || cityCollapsed) {
    return [
      ...(barbarianBattle ? [cue('BARBARIAN_BATTLE')] : []),
      ...(cityCollapsed ? [cue('CITY_COLLAPSE', barbarianBattle ? 520 : 0)] : []),
    ];
  }
  if (events.some((event) => event.type === 'ROBBER_MOVED')) return [cue('ROBBER_THREAT')];
  if (
    events.some(
      (event) =>
        event.type === 'RESOURCES_DISCARDED' || event.type === 'KN_PROGRESS_CARD_DISCARDED',
    )
  ) {
    return [cue('DISCARD_SLAM')];
  }
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
  if (barbarianAdvanced) return [cue('BARBARIAN_ADVANCE')];
  if (events.some((event) => event.type === 'MERCHANT_MOVED')) return [cue('MERCHANT')];
  if (events.some((event) => event.type === 'IMPROVEMENT_BOUGHT')) return [cue('IMPROVEMENT')];
  if (events.some((event) => event.type === 'ROAD_BUILT')) return [cue('ROAD_PLACE')];
  if (
    events.some(
      (event) => event.type === 'TRADE_COMPLETED' || event.type === 'COMMERCIAL_HARBOR_EXCHANGED',
    )
  ) {
    return [cue('TRADE')];
  }
  const privateCardDraw = events.find(
    (event): event is Extract<GameEvent, { readonly type: 'KN_PROGRESS_CARD_DRAWN' }> =>
      event.type === 'KN_PROGRESS_CARD_DRAWN',
  );
  if (
    privateCardDraw !== undefined &&
    !playerCanHearPrivateCue(viewerPlayerId, privateCardDraw.playerId)
  ) {
    return [];
  }
  if (
    events.some((event) =>
      [
        'KN_PROGRESS_CARD_DRAWN',
        'KN_PROGRESS_CARD_PLAYED',
        'PROGRESS_CARD_BOUGHT',
        'PROGRESS_CARD_PLAYED',
      ].includes(event.type),
    )
  ) {
    return [cue('CARD')];
  }
  if (events.some((event) => event.type === 'RESOURCES_PRODUCED')) return [cue('RESOURCE')];
  if (events.some((event) => event.type === 'TURN_STARTED')) return [cue('TURN')];
  return [];
}

const CUE_VOLUME: Readonly<Record<SoundCue, number>> = {
  BARBARIAN_ADVANCE: 0.66,
  BARBARIAN_BATTLE: 0.7,
  CARD: 0.56,
  CITY_COLLAPSE: 0.76,
  DICE_ROLL: 0.72,
  DISCARD_SLAM: 0.74,
  IMPROVEMENT: 0.56,
  INVALID: 0.64,
  KNIGHT_MOVE: 0.56,
  LONGEST_ROAD: 0.72,
  MERCHANT: 0.55,
  PERK_POLITICS: 0.68,
  PERK_SCIENCE: 0.65,
  PERK_TRADE: 0.64,
  RESOURCE: 0.46,
  ROAD_PLACE: 0.58,
  ROBBER_THREAT: 0.7,
  STONE_PLACE: 0.72,
  SWORD_DRAW: 0.68,
  TIMER: 0.42,
  TRADE: 0.54,
  TURN: 0.44,
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

function shuffledTracks(previousTrackId: string | null): readonly MusicTrack[] {
  const tracks = [...MEDIEVAL_MUSIC_TRACKS];
  for (let index = tracks.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [tracks[index], tracks[swapIndex]] = [tracks[swapIndex]!, tracks[index]!];
  }
  const firstTrack = tracks[0];
  const secondTrack = tracks[1];
  if (firstTrack !== undefined && secondTrack !== undefined && firstTrack.id === previousTrackId) {
    tracks[0] = secondTrack;
    tracks[1] = firstTrack;
  }
  return tracks;
}

class AudioManager {
  private preloadedEffects = new Map<SoundCue, HTMLAudioElement>();
  private activeEffects = new Set<HTMLAudioElement>();
  private scheduledEffects = new Set<ReturnType<typeof globalThis.setTimeout>>();
  private musicActive = false;
  private musicElement: HTMLAudioElement | null = null;
  private musicQueue: readonly MusicTrack[] = [];
  private lastMusicTrackId: string | null = null;
  private masterVolume = 0;
  private musicVolume = 0;
  private musicDuckTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private musicDucked = false;
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

  playTimerTick(masterVolume: number, sfxVolume: number): void {
    this.scheduleCue('TIMER', 0, masterVolume, sfxVolume);
  }

  startMusic(): void {
    if (this.musicActive) return;
    this.musicActive = true;
    this.preloadEffects();
    if (globalThis.document !== undefined) {
      this.visibilityHandler = () => {
        if (!this.musicActive || this.musicElement === null) return;
        if (globalThis.document.visibilityState === 'hidden') this.musicElement.pause();
        else if (this.targetMusicVolume() > 0) this.tryPlayMusic(this.musicElement);
      };
      globalThis.document.addEventListener('visibilitychange', this.visibilityHandler);
    }
    if (this.targetMusicVolume() > 0) this.playNextMusicTrack();
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
      this.playNextMusicTrack();
    }
  }

  stopMusic(): void {
    this.musicActive = false;
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
    else if (cueName === 'LONGEST_ROAD') this.duckMusic(3_050);
    else if (cueName.startsWith('PERK_')) this.duckMusic(2_900);
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

  private nextMusicTrack(): MusicTrack | null {
    if (this.musicQueue.length === 0) {
      this.musicQueue = shuffledTracks(this.lastMusicTrackId);
    }
    const [track, ...remaining] = this.musicQueue;
    this.musicQueue = remaining;
    return track ?? null;
  }

  private playNextMusicTrack(): void {
    if (!this.musicActive || !mediaPlaybackAvailable() || this.targetMusicVolume() === 0) return;
    const track = this.nextMusicTrack();
    if (track === null) return;
    if (this.musicElement !== null) this.musicElement.pause();
    const audio = new Audio(track.url);
    audio.preload = 'auto';
    audio.volume = this.musicDucked ? this.targetMusicVolume() * 0.14 : this.targetMusicVolume();
    audio.addEventListener(
      'ended',
      () => {
        if (this.musicElement !== audio) return;
        this.lastMusicTrackId = track.id;
        this.musicElement = null;
        this.playNextMusicTrack();
      },
      { once: true },
    );
    audio.addEventListener(
      'error',
      () => {
        if (this.musicElement !== audio) return;
        this.lastMusicTrackId = track.id;
        this.musicElement = null;
        this.playNextMusicTrack();
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
      if (music === null) this.playNextMusicTrack();
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
