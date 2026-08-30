import barbarianBattleUrl from '../../assets/audio/sfx/barbarian-battle.mp3';
import cityCollapseUrl from '../../assets/audio/sfx/city-collapse.wav';
import diceRollUrl from '../../assets/audio/sfx/dice-roll.mp3';
import discardSlamUrl from '../../assets/audio/sfx/discard-slam.wav';
import gameBeginUrl from '../../assets/audio/sfx/game_begin.wav';
import improvementUrl from '../../assets/audio/sfx/improvement.mp3';
import invalidUrl from '../../assets/audio/sfx/invalid.wav';
import knightMoveUrl from '../../assets/audio/sfx/knight-move.wav';
import longestRoadUrl from '../../assets/audio/sfx/longest_road.wav';
import perkUrl from '../../assets/audio/sfx/perk.wav';
import roadPlaceUrl from '../../assets/audio/sfx/road_place.wav';
import stonePlaceUrl from '../../assets/audio/sfx/stone-place.mp3';
import swordDrawUrl from '../../assets/audio/sfx/sword-draw.mp3';
import timerUrl from '../../assets/audio/sfx/timer.wav';
import tradeUrl from '../../assets/audio/sfx/trade.wav';
import tradeAcceptUrl from '../../assets/audio/sfx/trade_accept.wav';
import turnUrl from '../../assets/audio/sfx/turn.wav';
import victory2Url from '../../assets/audio/sfx/victory2.wav';
import backgroundMusicUrl from '../../assets/audio/music/background_music.wav';
import backgroundMusic2Url from '../../assets/audio/music/background_music2.wav';

export type SoundCue =
  | 'BARBARIAN_BATTLE'
  | 'CITY_COLLAPSE'
  | 'DICE_ROLL'
  | 'DISCARD_SLAM'
  | 'GAME_BEGIN'
  | 'IMPROVEMENT'
  | 'INVALID'
  | 'KNIGHT_MOVE'
  | 'LONGEST_ROAD'
  | 'PERK'
  | 'ROAD_PLACE'
  | 'STONE_PLACE'
  | 'SWORD_DRAW'
  | 'TIMER'
  | 'TRADE'
  | 'TRADE_ACCEPT'
  | 'TURN'
  | 'VICTORY';

export const SOUND_ASSET_URLS: Readonly<Record<SoundCue, string>> = {
  BARBARIAN_BATTLE: barbarianBattleUrl,
  CITY_COLLAPSE: cityCollapseUrl,
  DICE_ROLL: diceRollUrl,
  DISCARD_SLAM: discardSlamUrl,
  GAME_BEGIN: gameBeginUrl,
  IMPROVEMENT: improvementUrl,
  INVALID: invalidUrl,
  KNIGHT_MOVE: knightMoveUrl,
  LONGEST_ROAD: longestRoadUrl,
  PERK: perkUrl,
  ROAD_PLACE: roadPlaceUrl,
  STONE_PLACE: stonePlaceUrl,
  SWORD_DRAW: swordDrawUrl,
  TIMER: timerUrl,
  TRADE: tradeUrl,
  TRADE_ACCEPT: tradeAcceptUrl,
  TURN: turnUrl,
  VICTORY: victory2Url,
};

export interface MusicTrack {
  readonly id: string;
  readonly title: string;
  readonly url: string;
}

export const BACKGROUND_MUSIC_TRACKS: readonly MusicTrack[] = [
  { id: 'background-music', title: 'Background Music', url: backgroundMusicUrl },
  { id: 'background-music-2', title: 'Background Music 2', url: backgroundMusic2Url },
];
