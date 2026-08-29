// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RESOURCE_IDS } from '../../src/engine/content/resources';
import { resourceBundle } from '../../src/engine/content/types';
import { dispatch } from '../../src/engine/core/game-engine';
import { actionId, tradeId } from '../../src/engine/core/ids';
import { projectGameState } from '../../src/multiplayer/projection';
import { TradeResponsePanel } from '../../src/ui/game/TradeResponseModal';
import { createTestGameState, TEST_PLAYER_IDS } from '../helpers/game-state';

afterEach(cleanup);

describe('online trade responses', () => {
  it('allows the recipient to accept from a private projection with a hidden proposer hand', async () => {
    const original = createTestGameState('ACTION_PHASE');
    const state = {
      ...original,
      players: {
        ...original.players,
        [TEST_PLAYER_IDS[0]]: {
          ...original.players[TEST_PLAYER_IDS[0]]!,
          resources: resourceBundle([[RESOURCE_IDS.wood, 1]]),
        },
        [TEST_PLAYER_IDS[1]]: {
          ...original.players[TEST_PLAYER_IDS[1]]!,
          resources: resourceBundle([[RESOURCE_IDS.brick, 1]]),
        },
      },
    };
    const offerId = tradeId('projected-trade-acceptance');
    const created = dispatch(state, {
      id: actionId('create-projected-trade'),
      type: 'CREATE_TRADE',
      actorId: TEST_PLAYER_IDS[0],
      tradeId: offerId,
      recipientIds: [TEST_PLAYER_IDS[1]],
      offered: resourceBundle([[RESOURCE_IDS.wood, 1]]),
      requested: resourceBundle([[RESOURCE_IDS.brick, 1]]),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const projected = projectGameState(created.state, TEST_PLAYER_IDS[1]);
    const trade = projected.tradeOffers[offerId]!;
    const proposer = projected.players[TEST_PLAYER_IDS[0]]!;
    const recipient = projected.players[TEST_PLAYER_IDS[1]]!;
    expect(proposer.resources).toEqual({});
    const onRespond = vi.fn();

    render(
      <TradeResponsePanel
        state={projected}
        trade={trade}
        proposer={proposer}
        recipients={[recipient]}
        playerColors={{}}
        errorMessage={null}
        viewerPlayerId={recipient.id}
        serverAuthoritative
        onRespond={onRespond}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        onExpire={vi.fn()}
      />,
    );

    const accept = screen.getByRole('button', { name: `${recipient.name} accept trade` });
    expect(accept).toBeEnabled();
    await userEvent.click(accept);
    expect(onRespond).toHaveBeenCalledWith(recipient.id, true);
  });
});
