import barbarianBattleUrl from '../../assets/audio/sfx/barbarian-battle.mp3';
import cityCollapseUrl from '../../assets/audio/sfx/city-collapse.mp3';
import diceRollUrl from '../../assets/audio/sfx/dice-roll.mp3';
import discardSlamUrl from '../../assets/audio/sfx/discard-slam.mp3';
import gameBeginUrl from '../../assets/audio/sfx/game_begin.mp3';
import improvementUrl from '../../assets/audio/sfx/improvement.mp3';
import invalidUrl from '../../assets/audio/sfx/invalid.mp3';
import knightMoveUrl from '../../assets/audio/sfx/knight-move.mp3';
import longestRoadUrl from '../../assets/audio/sfx/longest_road.mp3';
import perkUrl from '../../assets/audio/sfx/perk.mp3';
import roadPlaceUrl from '../../assets/audio/sfx/road_place.mp3';
import stonePlaceUrl from '../../assets/audio/sfx/stone-place.mp3';
import swordDrawUrl from '../../assets/audio/sfx/sword-draw.mp3';
import timerUrl from '../../assets/audio/sfx/timer.mp3';
import tradeUrl from '../../assets/audio/sfx/trade.mp3';
import tradeAcceptUrl from '../../assets/audio/sfx/trade_accept.mp3';
import turnUrl from '../../assets/audio/sfx/turn.mp3';
import victory2Url from '../../assets/audio/sfx/victory2.mp3';
import backgroundMusicUrl from '../../assets/audio/music/background_music.mp3';
import backgroundMusic2Url from '../../assets/audio/music/background_music2.mp3';

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
