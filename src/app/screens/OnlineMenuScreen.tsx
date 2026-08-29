import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../ui/components/Button';
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

  return (
    <main className="online-entry-screen">
      <section className="online-entry-card" aria-labelledby="online-title">
        <button type="button" className="online-back-link" onClick={() => void navigate('/')}>
          ← Main menu
        </button>
        <span className="online-entry-card__signal" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <p className="eyebrow">Live rooms</p>
        <h1 id="online-title">Play Territory Online</h1>
        <p>Host a private room or join friends with a six-character code.</p>

        <label className="online-field">
          <span>Your name</span>
          <input
            autoComplete="nickname"
            maxLength={20}
            value={displayName}
            placeholder="Player name"
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>

        <div className="online-entry-actions">
          <section>
            <strong>Start a room</strong>
            <small>You become the host and control the match settings.</small>
            <Button
              variant="primary"
              fullWidth
              disabled={!validName || commandPending}
              onClick={() => void createRoom(displayName)}
            >
              Create private room
            </Button>
          </section>
          <span className="online-entry-actions__or">or</span>
          <section>
            <strong>Join a room</strong>
            <small>Enter the code shown in your friend’s lobby.</small>
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
            <Button
              variant="secondary"
              fullWidth
              disabled={!validName || !validCode || commandPending}
              onClick={() => void joinRoom(roomCode, displayName)}
            >
              Join room
            </Button>
          </section>
        </div>

        <p className={`online-status online-status--${connection.toLocaleLowerCase()}`}>
          <span aria-hidden="true" />
          {commandPending
            ? 'Contacting server…'
            : connection === 'CONNECTED'
              ? 'Multiplayer server connected'
              : connection === 'RECONNECTING'
                ? 'Reconnecting…'
                : 'Ready to connect'}
        </p>
        {error === null ? null : (
          <p className="online-error" role="alert">
            {error.message}
          </p>
        )}
      </section>
    </main>
  );
}
