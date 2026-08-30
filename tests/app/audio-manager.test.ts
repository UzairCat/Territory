import { describe, expect, it } from 'vitest';

import { BACKGROUND_MUSIC_TRACKS } from '../../src/app/audio/audio-catalog';
import { audioCuesForEvents, backgroundMusicTrackForGame } from '../../src/app/audio/audio-manager';
import { COMMODITY_IDS } from '../../src/engine/content/commodities';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import type { GameEvent } from '../../src/engine/core/events';
import {
  cardDefinitionId,
  cardInstanceId,
  hexId,
  knightId,
  tradeId,
  vertexId,
} from '../../src/engine/core/ids';
import { TEST_PLAYER_IDS } from '../helpers/game-state';

function cues(events: readonly GameEvent[], viewerPlayerId = TEST_PLAYER_IDS[0]) {
  return audioCuesForEvents(events, viewerPlayerId).map((request) => request.cue);
}

describe('game audio design', () => {
  it('uses one weighty stone-placement sound for construction and the robber', () => {
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
      {
        type: 'ROBBER_MOVED',
        playerId: TEST_PLAYER_IDS[0],
        fromHexId: null,
        hexId: hexId('sound-robber'),
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
          type: 'CITY_DOWNGRADED',
          playerId: TEST_PLAYER_IDS[0],
          vertexId: vertexId('sound-collapse'),
          wallDestroyed: true,
        },
      ]),
    ).toEqual(['CITY_COLLAPSE']);
    expect(cues([{ type: 'LONGEST_ROAD_CHANGED', playerId: TEST_PLAYER_IDS[0] }])).toEqual([
      'LONGEST_ROAD',
    ]);
    expect(cues([{ type: 'GAME_WON', playerId: TEST_PLAYER_IDS[0], score: 10 }])).toEqual([
      'VICTORY',
    ]);
  });

  it('alerts only players who must discard when a seven starts the robber sequence', () => {
    const sevenEvents: readonly GameEvent[] = [
      { type: 'DICE_ROLLED', playerId: TEST_PLAYER_IDS[0], dice: [3, 4] },
      {
        type: 'ROBBER_SEQUENCE_STARTED',
        playerId: TEST_PLAYER_IDS[0],
        discardPlayerIds: [TEST_PLAYER_IDS[0], TEST_PLAYER_IDS[1]],
      },
    ];

    expect(cues(sevenEvents, TEST_PLAYER_IDS[0])).toEqual(['DICE_ROLL', 'DISCARD_SLAM']);
    expect(cues(sevenEvents, TEST_PLAYER_IDS[1])).toEqual(['DICE_ROLL', 'DISCARD_SLAM']);
    expect(cues(sevenEvents, TEST_PLAYER_IDS[2])).toEqual(['DICE_ROLL']);

    expect(
      cues(
        [
          {
            type: 'ROBBER_SEQUENCE_STARTED',
            playerId: TEST_PLAYER_IDS[0],
            discardPlayerIds: [TEST_PLAYER_IDS[1]],
          },
        ],
        TEST_PLAYER_IDS[1],
      ),
    ).toEqual(['DISCARD_SLAM']);
  });

  it('keeps completed resource and progress-card discards quiet', () => {
    expect(
      cues([
        {
          type: 'RESOURCES_DISCARDED',
          playerId: TEST_PLAYER_IDS[0],
          resources: resourceBundle([]),
        },
      ]),
    ).toEqual([]);
    expect(
      cues([
        {
          type: 'KN_PROGRESS_CARD_DISCARDED',
          playerId: TEST_PLAYER_IDS[0],
          family: 'SCIENCE',
          cardInstanceId: cardInstanceId('quiet-discarded-progress-card'),
        },
      ]),
    ).toEqual([]);
  });

  it('keeps resource production quiet', () => {
    expect(
      cues([
        {
          type: 'RESOURCES_PRODUCED',
          source: 'DICE',
          rollTotal: 8,
          grants: {
            [TEST_PLAYER_IDS[0]]: resourceBundle([[RESOURCE_IDS.wood, 1]]),
          },
          unavailableResourceIds: [],
        },
      ]),
    ).toEqual([]);
  });

  it('keeps merchant placement quiet', () => {
    expect(
      cues([
        {
          type: 'MERCHANT_MOVED',
          playerId: TEST_PLAYER_IDS[0],
          hexId: hexId('quiet-merchant-placement'),
          resourceId: RESOURCE_IDS.wood,
        },
      ]),
    ).toEqual([]);
  });

  it('uses the shared private celebration sound for every level-three commodity perk', () => {
    const tracks = [
      ['SCIENCE', 'AQUEDUCT'],
      ['TRADE', 'TRADING_HOUSE'],
      ['POLITICS', 'FORTRESS'],
    ] as const;

    for (const [track, perk] of tracks) {
      const event: GameEvent = {
        type: 'CITY_IMPROVEMENT_PERK_UNLOCKED',
        playerId: TEST_PLAYER_IDS[0],
        track,
        perk,
      };
      expect(cues([event], TEST_PLAYER_IDS[0])).toEqual(['PERK']);
      expect(cues([event], TEST_PLAYER_IDS[1])).toEqual([]);
    }
  });

  it('keeps ordinary city-improvement audio private to the purchasing player', () => {
    const event: GameEvent = {
      type: 'IMPROVEMENT_BOUGHT',
      playerId: TEST_PLAYER_IDS[0],
      track: 'SCIENCE',
      level: 2,
      cost: 2,
    };

    expect(cues([event], TEST_PLAYER_IDS[0])).toEqual(['IMPROVEMENT']);
    expect(cues([event], TEST_PLAYER_IDS[1])).toEqual([]);
  });

  it('keeps barbarian advances quiet and alerts only the player whose turn started', () => {
    expect(cues([{ type: 'BARBARIAN_ADVANCED', position: 2, trackLength: 7 }])).toEqual([]);
    const event: GameEvent = {
      type: 'TURN_STARTED',
      playerId: TEST_PLAYER_IDS[0],
      turnNumber: 4,
    };
    expect(cues([event], TEST_PLAYER_IDS[0])).toEqual(['TURN']);
    expect(cues([event], TEST_PLAYER_IDS[1])).toEqual([]);
  });

  it('plays dedicated cues when a player trade is offered or fully completed', () => {
    const offerId = tradeId('sound-trade-request');

    expect(
      cues([
        {
          type: 'TRADE_OFFERED',
          tradeId: offerId,
          playerId: TEST_PLAYER_IDS[0],
          recipientIds: [TEST_PLAYER_IDS[1]],
        },
      ]),
    ).toEqual(['TRADE']);

    expect(
      cues([
        {
          type: 'TRADE_ACCEPTED',
          tradeId: offerId,
          playerId: TEST_PLAYER_IDS[0],
          recipientId: TEST_PLAYER_IDS[1],
        },
      ]),
    ).toEqual([]);

    expect(
      cues([
        {
          type: 'TRADE_COMPLETED',
          tradeId: offerId,
          playerId: TEST_PLAYER_IDS[0],
          recipientId: TEST_PLAYER_IDS[1],
          offered: resourceBundle([[RESOURCE_IDS.wood, 1]]),
          requested: resourceBundle([[RESOURCE_IDS.brick, 1]]),
        },
      ]),
    ).toEqual(['TRADE_ACCEPT']);

    const silentTradeEvents: readonly GameEvent[] = [
      {
        type: 'TRADE_COMPLETED',
        tradeId: null,
        playerId: TEST_PLAYER_IDS[0],
        recipientId: null,
        offered: resourceBundle([[RESOURCE_IDS.wood, 1]]),
        requested: resourceBundle([[RESOURCE_IDS.brick, 1]]),
      },
      {
        type: 'COMMERCIAL_HARBOR_EXCHANGED',
        playerId: TEST_PLAYER_IDS[0],
        targetPlayerId: TEST_PLAYER_IDS[1],
        offeredResourceId: RESOURCE_IDS.wood,
        receivedCommodityId: COMMODITY_IDS.paper,
      },
      {
        type: 'TRADE_REJECTED',
        tradeId: offerId,
        playerId: TEST_PLAYER_IDS[0],
        recipientId: TEST_PLAYER_IDS[1],
      },
      { type: 'TRADE_CANCELLED', tradeId: offerId, playerId: TEST_PLAYER_IDS[0] },
      { type: 'TRADE_EXPIRED', tradeId: offerId, playerId: TEST_PLAYER_IDS[0] },
    ];

    for (const event of silentTradeEvents) expect(cues([event])).toEqual([]);
  });

  it('keeps every progress-card draw, purchase, and play quiet', () => {
    const instanceId = cardInstanceId('quiet-progress-card');
    const definitionId = cardDefinitionId('quiet-progress-definition');
    const events: readonly GameEvent[] = [
      {
        type: 'KN_PROGRESS_CARD_DRAWN',
        playerId: TEST_PLAYER_IDS[0],
        family: 'SCIENCE',
        cardInstanceId: instanceId,
        revealed: false,
      },
      {
        type: 'KN_PROGRESS_CARD_PLAYED',
        playerId: TEST_PLAYER_IDS[0],
        cardInstanceId: instanceId,
        cardDefinitionId: definitionId,
      },
      {
        type: 'PROGRESS_CARD_BOUGHT',
        playerId: TEST_PLAYER_IDS[0],
        cardInstanceId: instanceId,
        cardDefinitionId: definitionId,
      },
      {
        type: 'PROGRESS_CARD_PLAYED',
        playerId: TEST_PLAYER_IDS[0],
        cardInstanceId: instanceId,
      },
    ];

    for (const event of events) expect(cues([event])).toEqual([]);
  });

  it('ships the two custom background music tracks', () => {
    expect(BACKGROUND_MUSIC_TRACKS).toHaveLength(2);
    expect(new Set(BACKGROUND_MUSIC_TRACKS.map((track) => track.id))).toHaveProperty('size', 2);
    expect(new Set(BACKGROUND_MUSIC_TRACKS.map((track) => track.url))).toHaveProperty('size', 2);
  });

  it('selects one stable background music track for each game', () => {
    const selectedTracks = Array.from({ length: 32 }, (_, index) =>
      backgroundMusicTrackForGame(`music-game-${index}`),
    );

    expect(backgroundMusicTrackForGame('stable-music-game')).toBe(
      backgroundMusicTrackForGame('stable-music-game'),
    );
    expect(selectedTracks.every((track) => BACKGROUND_MUSIC_TRACKS.includes(track))).toBe(true);
    expect(new Set(selectedTracks.map((track) => track.id))).toHaveProperty('size', 2);
  });
});
