import { describe, expect, it } from 'vitest';

import { MEDIEVAL_MUSIC_TRACKS } from '../../src/app/audio/audio-catalog';
import { audioCuesForEvents } from '../../src/app/audio/audio-manager';
import { resourceBundle } from '../../src/engine/content/types';
import type { GameEvent } from '../../src/engine/core/events';
import { hexId, knightId, vertexId } from '../../src/engine/core/ids';
import { TEST_PLAYER_IDS } from '../helpers/game-state';

function cues(events: readonly GameEvent[], viewerPlayerId = TEST_PLAYER_IDS[0]) {
  return audioCuesForEvents(events, viewerPlayerId).map((request) => request.cue);
}

describe('game audio design', () => {
  it('uses one weighty stone-placement sound for houses, cities, metropolises, knights, and walls', () => {
    const placementEvents: readonly GameEvent[] = [
      {
        type: 'BUILDING_PLACED',
        playerId: TEST_PLAYER_IDS[0],
        vertexId: vertexId('sound-house'),
        buildingType: 'HOUSE',
      },
      {
        type: 'BUILDING_UPGRADED',
        playerId: TEST_PLAYER_IDS[0],
        vertexId: vertexId('sound-city'),
      },
      {
        type: 'METROPOLIS_CHANGED',
        track: 'TRADE',
        playerId: TEST_PLAYER_IDS[0],
        previousPlayerId: null,
        vertexId: vertexId('sound-metropolis'),
      },
      {
        type: 'KNIGHT_BUILT',
        playerId: TEST_PLAYER_IDS[0],
        knightId: knightId('sound-knight'),
        vertexId: vertexId('sound-knight-vertex'),
        level: 1,
      },
      {
        type: 'WALL_BUILT',
        playerId: TEST_PLAYER_IDS[0],
        vertexId: vertexId('sound-wall'),
      },
    ];

    for (const event of placementEvents) {
      expect(cues([event])).toEqual(['STONE_PLACE']);
    }
  });

  it('maps the tactile and dramatic actions to their dedicated effects', () => {
    expect(cues([{ type: 'DICE_ROLLED', playerId: TEST_PLAYER_IDS[0], dice: [3, 5] }])).toEqual([
      'DICE_ROLL',
    ]);
    expect(
      cues([
        {
          type: 'KNIGHT_ACTIVATED',
          playerId: TEST_PLAYER_IDS[0],
          knightId: knightId('sound-activation'),
        },
      ]),
    ).toEqual(['SWORD_DRAW']);
    expect(
      cues([
        {
          type: 'RESOURCES_DISCARDED',
          playerId: TEST_PLAYER_IDS[0],
          resources: resourceBundle([]),
        },
      ]),
    ).toEqual(['DISCARD_SLAM']);
    expect(
      cues([
        {
          type: 'CITY_DOWNGRADED',
          playerId: TEST_PLAYER_IDS[0],
          vertexId: vertexId('sound-collapse'),
          wallDestroyed: true,
        },
      ]),
    ).toEqual(['CITY_COLLAPSE']);
    expect(
      cues([
        {
          type: 'ROBBER_MOVED',
          playerId: TEST_PLAYER_IDS[0],
          fromHexId: null,
          hexId: hexId('sound-robber'),
        },
      ]),
    ).toEqual(['ROBBER_THREAT']);
    expect(cues([{ type: 'LONGEST_ROAD_CHANGED', playerId: TEST_PLAYER_IDS[0] }])).toEqual([
      'LONGEST_ROAD',
    ]);
    expect(cues([{ type: 'GAME_WON', playerId: TEST_PLAYER_IDS[0], score: 10 }])).toEqual([
      'VICTORY',
    ]);
  });

  it('gives every level-three commodity perk its own private celebration charm', () => {
    const tracks = [
      ['SCIENCE', 'AQUEDUCT', 'PERK_SCIENCE'],
      ['TRADE', 'TRADING_HOUSE', 'PERK_TRADE'],
      ['POLITICS', 'FORTRESS', 'PERK_POLITICS'],
    ] as const;

    for (const [track, perk, expectedCue] of tracks) {
      const event: GameEvent = {
        type: 'CITY_IMPROVEMENT_PERK_UNLOCKED',
        playerId: TEST_PLAYER_IDS[0],
        track,
        perk,
      };
      expect(cues([event], TEST_PLAYER_IDS[0])).toEqual([expectedCue]);
      expect(cues([event], TEST_PLAYER_IDS[1])).toEqual(['IMPROVEMENT']);
    }
  });

  it('ships four differently named medieval background tracks', () => {
    expect(MEDIEVAL_MUSIC_TRACKS).toHaveLength(4);
    expect(new Set(MEDIEVAL_MUSIC_TRACKS.map((track) => track.id))).toHaveProperty('size', 4);
    expect(new Set(MEDIEVAL_MUSIC_TRACKS.map((track) => track.url))).toHaveProperty('size', 4);
  });
});
