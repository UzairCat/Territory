import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import '../app.css';

import { Button } from '../../ui/components/Button';
import { MenuBoardArtwork } from '../../ui/components/MenuBoardArtwork';
import { useOnlineStore } from '../stores/online-store';

export function OnlineMenuScreen() {
  const navigate = useNavigate();
  const createRoom = useOnlineStore((state) => state.createRoom);
  const joinRoom = useOnlineStore((state) => state.joinRoom);
  const initialize = useOnlineStore((state) => state.initialize);
  const room = useOnlineStore((state) => state.room);
  const error = useOnlineStore((state) => state.error);
  const commandPending = useOnlineStore((state) => state.commandPending);
  const connection = useOnlineStore((state) => state.connection);
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');

  useEffect(() => {
    let active = true;
    void initialize().then((resumed) => {
      const currentRoom = useOnlineStore.getState().room;
      if (active && resumed && currentRoom !== null) {
        void navigate(`/online/${currentRoom.code}`, { replace: true });
      }
    });
    return () => {
      active = false;
    };
  }, [initialize, navigate]);

  useEffect(() => {
    if (room !== null) void navigate(`/online/${room.code}`);
  }, [navigate, room]);

  const validName = displayName.trim().length >= 1 && displayName.trim().length <= 20;
  const validCode = /^[A-Z2-9]{6}$/.test(roomCode.trim().toUpperCase());

  const enterCreatedRoom = async () => {
    const created = await createRoom(displayName);
    const createdRoom = useOnlineStore.getState().room;
    if (created && createdRoom !== null) {
      void navigate(`/online/${createdRoom.code}`, { flushSync: true });
    }
  };

  const enterJoinedRoom = async () => {
    const joined = await joinRoom(roomCode, displayName);
    const joinedRoom = useOnlineStore.getState().room;
    if (joined && joinedRoom !== null) {
      void navigate(`/online/${joinedRoom.code}`, { flushSync: true });
    }
  };

  return (
    <main className="online-entry-screen">
      <div className="online-entry-grid" aria-hidden="true" />

      <header className="online-entry-nav">
        <button
          type="button"
          className="online-entry-brand"
          aria-label="Return to main menu"
          onClick={() => void navigate('/')}
        >
          <span aria-hidden="true">T</span>
          <div>
            <strong>Territory</strong>
            <small>Online game hall</small>
          </div>
        </button>
        <button type="button" className="online-back-link" onClick={() => void navigate('/')}>
          <span aria-hidden="true">←</span> Main menu
        </button>
        <p className={`online-status online-status--${connection.toLocaleLowerCase()}`}>
          <span aria-hidden="true" />
          {commandPending
            ? 'Contacting server…'
            : connection === 'CONNECTED'
              ? 'Server connected'
              : connection === 'RECONNECTING'
                ? 'Reconnecting…'
                : 'Ready to connect'}
        </p>
      </header>

      <div className="online-entry-layout">
        <aside className="online-entry-showcase" aria-label="Online Territory">
          <div className="online-entry-showcase__copy">
            <p className="eyebrow">The table has no borders</p>
            <h2>Your next realm is one room code away.</h2>
            <p>Build, bargain, and defend your cities together in a private live match.</p>
          </div>
          <MenuBoardArtwork compact />
          <div className="online-entry-perks">
            <span>
              <i aria-hidden="true">01</i>
              <b>Private rooms</b>
              <small>Invite only the players you choose</small>
            </span>
            <span>
              <i aria-hidden="true">02</i>
              <b>Live tabletop</b>
              <small>Every move stays synchronized</small>
            </span>
          </div>
        </aside>

        <section className="online-entry-card" aria-labelledby="online-title">
          <header className="online-entry-card__heading">
            <span className="online-entry-card__crest" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <div>
              <p className="eyebrow">Private multiplayer</p>
              <h1 id="online-title">Play Territory Online</h1>
              <p>Choose your name, then raise a room or join your party.</p>
            </div>
          </header>

          <label className="online-field">
            <span>
              Your name <small>Shown to the table</small>
            </span>
            <span className="online-field__input">
              <i aria-hidden="true">♟</i>
              <input
                autoComplete="nickname"
                maxLength={20}
                value={displayName}
                placeholder="Player name"
                onChange={(event) => setDisplayName(event.target.value)}
              />
              <small>{displayName.trim().length}/20</small>
            </span>
          </label>

          <div className="online-entry-divider" aria-hidden="true">
            <i />
            <span>Choose a path</span>
            <i />
          </div>

          <div className="online-entry-actions">
            <section className="online-entry-action online-entry-action--host">
              <header>
                <span aria-hidden="true">♛</span>
                <div>
                  <strong>Raise a new room</strong>
                  <small>You become party leader and control the match.</small>
                </div>
              </header>
              <ul aria-label="Host room benefits">
                <li>Choose the map and rules</li>
                <li>Share a private six-character code</li>
              </ul>
              <Button
                variant="primary"
                fullWidth
                aria-label="Create private room"
                disabled={!validName || commandPending}
                onClick={() => void enterCreatedRoom()}
              >
                <span>Create private room</span>
                <i aria-hidden="true">›</i>
              </Button>
            </section>

            <section className="online-entry-action online-entry-action--join">
              <header>
                <span aria-hidden="true">⚑</span>
                <div>
                  <strong>Join your party</strong>
                  <small>Enter the code displayed in your friend’s lobby.</small>
                </div>
              </header>
              <label className="online-room-code-field">
                <span>Room code</span>
                <input
                  className="online-code-input"
                  aria-label="Room code"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={6}
                  value={roomCode}
                  placeholder="ABC234"
                  onChange={(event) =>
                    setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))
                  }
                />
              </label>
              <Button
                variant="secondary"
                fullWidth
                aria-label="Join room"
                disabled={!validName || !validCode || commandPending}
                onClick={() => void enterJoinedRoom()}
              >
                <span>Join room</span>
                <i aria-hidden="true">›</i>
              </Button>
            </section>
          </div>

          <footer className="online-entry-card__footer">
            <span aria-hidden="true">♜</span>
            <p>
              Rooms are private <small>Only players with your code can enter.</small>
            </p>
          </footer>
          {error === null ? null : (
            <p className="online-error" role="alert">
              {error.message}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
