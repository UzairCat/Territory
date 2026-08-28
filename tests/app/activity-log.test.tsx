// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ActivityLog } from '../../src/ui/game/ActivityLog';
import { PROGRESS_CARD_IDS } from '../../src/engine/content/progress-cards';
import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import type { GameEvent } from '../../src/engine/core/events';
import { cardInstanceId, edgeId, vertexId } from '../../src/engine/core/ids';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

describe('game activity log', () => {
  afterEach(cleanup);

  it('shows exact production, purchase, and steal details for local testing', () => {
    const state = createTestGameState('ACTION_PHASE');
    const cardId = cardInstanceId('activity-plenty');
    const events: readonly GameEvent[] = [
      { type: 'DICE_ROLLED', playerId: TEST_PLAYER_IDS[0], dice: [3, 5] },
      {
        type: 'RESOURCES_PRODUCED',
        source: 'DICE',
        rollTotal: 8,
        grants: {
          [TEST_PLAYER_IDS[0]]: resourceBundle([
            [RESOURCE_IDS.wood, 2],
            [RESOURCE_IDS.grain, 1],
          ]),
          [TEST_PLAYER_IDS[1]]: resourceBundle([[RESOURCE_IDS.brick, 1]]),
        },
        unavailableResourceIds: [],
      },
      {
        type: 'PROGRESS_CARD_BOUGHT',
        playerId: TEST_PLAYER_IDS[0],
        cardInstanceId: cardId,
        cardDefinitionId: PROGRESS_CARD_IDS.yearOfPlenty,
      },
      {
        type: 'PROGRESS_CARD_RESOLVED',
        playerId: TEST_PLAYER_IDS[0],
        cardInstanceId: cardId,
        cardDefinitionId: PROGRESS_CARD_IDS.yearOfPlenty,
        amount: 2,
        resources: resourceBundle([[RESOURCE_IDS.wood, 2]]),
      },
      {
        type: 'PROGRESS_CARD_RESOLVED',
        playerId: TEST_PLAYER_IDS[0],
        cardInstanceId: cardInstanceId('activity-monopoly'),
        cardDefinitionId: PROGRESS_CARD_IDS.monopoly,
        amount: 3,
        resourceId: RESOURCE_IDS.grain,
      },
      {
        type: 'RESOURCE_STOLEN',
        playerId: TEST_PLAYER_IDS[0],
        targetPlayerId: TEST_PLAYER_IDS[1],
        resourceId: RESOURCE_IDS.brick,
      },
      {
        type: 'ROAD_BUILT',
        playerId: TEST_PLAYER_IDS[0],
        edgeId: edgeId('activity-road'),
      },
      {
        type: 'BUILDING_PLACED',
        playerId: TEST_PLAYER_IDS[1],
        vertexId: vertexId('activity-house'),
        buildingType: 'HOUSE',
      },
      {
        type: 'BUILDING_UPGRADED',
        playerId: TEST_PLAYER_IDS[0],
        vertexId: vertexId('activity-city'),
      },
    ];

    render(<ActivityLog events={events} state={state} />);

    const log = screen.getByRole('log');
    expect(within(log).getByText('Alex rolled 3 + 5 = 8.')).toBeInTheDocument();
    expect(
      within(log).getByText('Alex received 2 Wood · 1 Grain from roll 8.'),
    ).toBeInTheDocument();
    expect(within(log).getByText('Sam received 1 Brick from roll 8.')).toBeInTheDocument();
    const purchase = within(log).getByText('Alex bought a progress card.').closest('li');
    expect(purchase).toBeInTheDocument();
    expect(purchase?.querySelector('[data-progress-artwork]')).not.toBeInTheDocument();
    expect(within(log).queryByText('Alex bought Year of Plenty.')).not.toBeInTheDocument();
    expect(within(log).getByText('Alex chose 2 Wood with Year of Plenty.')).toBeInTheDocument();
    expect(
      within(log).getByText('Alex chose Grain for Monopoly and collected 3 cards.'),
    ).toBeInTheDocument();
    expect(within(log).getByText('Alex stole 1 Brick from Sam.')).toBeInTheDocument();
    expect(log.querySelectorAll('.activity-die')).toHaveLength(2);
    expect(log.querySelectorAll('.activity-die')[0]?.querySelectorAll('.is-visible')).toHaveLength(
      3,
    );
    expect(log.querySelectorAll('.activity-die')[1]?.querySelectorAll('.is-visible')).toHaveLength(
      5,
    );
    expect(log.querySelector('.activity-piece__road')).toBeInTheDocument();
    expect(log.querySelector('.activity-piece__house')).toBeInTheDocument();
    expect(log.querySelector('.activity-piece__city')).toBeInTheDocument();
    const alexProduction = within(log)
      .getByText('Alex received 2 Wood · 1 Grain from roll 8.')
      .closest('li');
    expect(alexProduction?.querySelectorAll('.activity-resource-card')).toHaveLength(3);
    const plentyResolution = within(log)
      .getByText('Alex chose 2 Wood with Year of Plenty.')
      .closest('li');
    expect(plentyResolution?.querySelectorAll('.activity-resource-card')).toHaveLength(2);
    expect(plentyResolution?.querySelector('[data-progress-artwork]')).not.toBeInTheDocument();
    const monopolyResolution = within(log)
      .getByText('Alex chose Grain for Monopoly and collected 3 cards.')
      .closest('li');
    expect(monopolyResolution?.querySelectorAll('.activity-resource-card')).toHaveLength(3);
    expect(monopolyResolution?.querySelector('[data-progress-artwork]')).not.toBeInTheDocument();
  });

  it('makes the K+N Event die family explicit in the log', () => {
    const state = createTestGameState('ACTION_PHASE');
    render(
      <ActivityLog
        state={state}
        events={[
          {
            type: 'KN_DICE_ROLLED',
            playerId: TEST_PLAYER_IDS[0],
            red: 3,
            regular: 2,
            numericTotal: 5,
            event: 'POLITICS',
          },
        ]}
      />,
    );

    const eventDie = screen.getByText('POLITICS').closest('.activity-event-die');
    expect(eventDie).toHaveClass('activity-event-die--politics');
    expect(eventDie).toHaveTextContent('♛');
  });

  it('uses family-colored K+N draw art and a concise improvement line', () => {
    const state = createTestGameState('ACTION_PHASE');
    render(
      <ActivityLog
        state={state}
        events={[
          {
            type: 'KN_PROGRESS_CARD_DRAWN',
            playerId: TEST_PLAYER_IDS[0],
            family: 'SCIENCE',
            cardInstanceId: cardInstanceId('activity-science'),
            revealed: false,
          },
          {
            type: 'IMPROVEMENT_BOUGHT',
            playerId: TEST_PLAYER_IDS[0],
            track: 'POLITICS',
            level: 1,
            cost: 1,
          },
        ]}
      />,
    );

    const draw = screen.getByText('Alex drew a Progress Card.').closest('li');
    expect(draw?.querySelector('.activity-kn-progress--science')).toBeInTheDocument();
    expect(draw?.querySelector('.activity-piece--progress')).not.toBeInTheDocument();
    const improvement = screen.getByText('Alex upgraded Politics to level 1.').closest('li');
    expect(improvement?.querySelector('.activity-improvement-chip--politics')).toBeInTheDocument();
  });
});
