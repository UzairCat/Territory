import barbarianAdvanceUrl from '../../assets/audio/sfx/barbarian-advance.wav';
import barbarianBattleUrl from '../../assets/audio/sfx/barbarian-battle.wav';
import cardUrl from '../../assets/audio/sfx/card.wav';
import cityCollapseUrl from '../../assets/audio/sfx/city-collapse.wav';
import diceRollUrl from '../../assets/audio/sfx/dice-roll.wav';
import discardSlamUrl from '../../assets/audio/sfx/discard-slam.wav';
import improvementUrl from '../../assets/audio/sfx/improvement.wav';
import invalidUrl from '../../assets/audio/sfx/invalid.wav';
import knightMoveUrl from '../../assets/audio/sfx/knight-move.wav';
import longestRoadUrl from '../../assets/audio/sfx/longest-road.wav';
import merchantUrl from '../../assets/audio/sfx/merchant.wav';
import perkPoliticsUrl from '../../assets/audio/sfx/perk-politics.wav';
import perkScienceUrl from '../../assets/audio/sfx/perk-science.wav';
import perkTradeUrl from '../../assets/audio/sfx/perk-trade.wav';
import resourceUrl from '../../assets/audio/sfx/resource.wav';
import roadPlaceUrl from '../../assets/audio/sfx/road-place.wav';
import robberThreatUrl from '../../assets/audio/sfx/robber-threat.wav';
import stonePlaceUrl from '../../assets/audio/sfx/stone-place.wav';
import swordDrawUrl from '../../assets/audio/sfx/sword-draw.wav';
import timerUrl from '../../assets/audio/sfx/timer.wav';
import tradeUrl from '../../assets/audio/sfx/trade.wav';
import turnUrl from '../../assets/audio/sfx/turn.wav';
import victoryUrl from '../../assets/audio/sfx/victory.wav';
import hearthsideRoadsUrl from '../../assets/audio/music/hearthside-roads.wav';
import kingsProcessionUrl from '../../assets/audio/music/kings-procession.wav';
import marketAtDawnUrl from '../../assets/audio/music/market-at-dawn.wav';
import moonlitKeepUrl from '../../assets/audio/music/moonlit-keep.wav';

export type SoundCue =
  | 'BARBARIAN_ADVANCE'
  | 'BARBARIAN_BATTLE'
  | 'CARD'
  | 'CITY_COLLAPSE'
  | 'DICE_ROLL'
  | 'DISCARD_SLAM'
  | 'IMPROVEMENT'
  | 'INVALID'
  | 'KNIGHT_MOVE'
  | 'LONGEST_ROAD'
  | 'MERCHANT'
  | 'PERK_POLITICS'
  | 'PERK_SCIENCE'
  | 'PERK_TRADE'
  | 'RESOURCE'
  | 'ROAD_PLACE'
  | 'ROBBER_THREAT'
  | 'STONE_PLACE'
  | 'SWORD_DRAW'
  | 'TIMER'
  | 'TRADE'
  | 'TURN'
  | 'VICTORY';

export const SOUND_ASSET_URLS: Readonly<Record<SoundCue, string>> = {
  BARBARIAN_ADVANCE: barbarianAdvanceUrl,
  BARBARIAN_BATTLE: barbarianBattleUrl,
  CARD: cardUrl,
  CITY_COLLAPSE: cityCollapseUrl,
  DICE_ROLL: diceRollUrl,
  DISCARD_SLAM: discardSlamUrl,
  IMPROVEMENT: improvementUrl,
  INVALID: invalidUrl,
  KNIGHT_MOVE: knightMoveUrl,
  LONGEST_ROAD: longestRoadUrl,
  MERCHANT: merchantUrl,
  PERK_POLITICS: perkPoliticsUrl,
  PERK_SCIENCE: perkScienceUrl,
  PERK_TRADE: perkTradeUrl,
  RESOURCE: resourceUrl,
  ROAD_PLACE: roadPlaceUrl,
  ROBBER_THREAT: robberThreatUrl,
  STONE_PLACE: stonePlaceUrl,
  SWORD_DRAW: swordDrawUrl,
  TIMER: timerUrl,
  TRADE: tradeUrl,
  TURN: turnUrl,
  VICTORY: victoryUrl,
};

export interface MusicTrack {
  readonly id: string;
  readonly title: string;
  readonly url: string;
}

export const MEDIEVAL_MUSIC_TRACKS: readonly MusicTrack[] = [
  { id: 'hearthside-roads', title: 'Hearthside Roads', url: hearthsideRoadsUrl },
  { id: 'market-at-dawn', title: 'Market at Dawn', url: marketAtDawnUrl },
  { id: 'moonlit-keep', title: 'Moonlit Keep', url: moonlitKeepUrl },
  { id: 'kings-procession', title: "King's Procession", url: kingsProcessionUrl },
];
