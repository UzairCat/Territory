import { useNavigate } from 'react-router-dom';

import { useAppStore } from '../stores/app-store';
import { Button } from '../../ui/components/Button';

export function MainMenuScreen() {
  const navigate = useNavigate();
  const startFreshLobby = useAppStore((state) => state.startFreshLobby);
  const openSettings = useAppStore((state) => state.openSettings);

  return (
    <main className="menu-screen">
      <div className="hex-field" aria-hidden="true">
        {Array.from({ length: 13 }, (_, index) => (
          <span key={index} />
        ))}
      </div>

      <section className="menu-card" aria-labelledby="territory-title">
        <p className="eyebrow">Tabletop strategy, together</p>
        <h1 id="territory-title">Territory</h1>
        <p className="menu-card__tagline">Build your network. Command the board.</p>

        <div className="menu-actions">
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              startFreshLobby();
              void navigate('/lobby');
            }}
          >
            Local game
          </Button>
          <Button variant="secondary" fullWidth onClick={() => void navigate('/online')}>
            Online multiplayer
          </Button>
          <Button variant="secondary" fullWidth onClick={openSettings}>
            Settings
          </Button>
        </div>

        <p className="version-label">v0.1 · Local edition</p>
      </section>
    </main>
  );
}
