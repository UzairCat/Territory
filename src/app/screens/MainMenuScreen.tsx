import { useNavigate } from 'react-router-dom';

import '../app.css';

import { Button } from '../../ui/components/Button';
import { MenuBoardArtwork } from '../../ui/components/MenuBoardArtwork';
import { useAppStore } from '../stores/app-store';

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

      <header className="menu-masthead">
        <div className="menu-wordmark" aria-label="Territory">
          <span aria-hidden="true">T</span>
          <div>
            <strong>Territory</strong>
            <small>Tabletop strategy</small>
          </div>
        </div>
        <span className="menu-masthead__edition">
          <i aria-hidden="true" /> Classic &amp; Cities + Knights
        </span>
      </header>

      <div className="menu-shell">
        <section className="menu-hero" aria-labelledby="territory-title">
          <div className="menu-hero__copy">
            <p className="eyebrow">Settle · Trade · Triumph</p>
            <h1 id="territory-title">Territory</h1>
            <p className="menu-hero__motto">Forge a realm worth remembering.</p>
            <p className="menu-hero__description">
              Claim the coast, command the roads, and outplay your rivals across a living tabletop.
            </p>
            <div className="menu-hero__features" aria-label="Game features">
              <span>
                <i aria-hidden="true">⬡</i> Handcrafted maps
              </span>
              <span>
                <i aria-hidden="true">♞</i> Cities + Knights
              </span>
              <span>
                <i aria-hidden="true">⌁</i> Private online rooms
              </span>
            </div>
          </div>
          <MenuBoardArtwork />
        </section>

        <section className="menu-card" aria-labelledby="play-menu-title">
          <div className="menu-card__ornament" aria-hidden="true">
            <i />
            <span>♛</span>
            <i />
          </div>
          <p className="eyebrow">The game hall</p>
          <h2 id="play-menu-title">Choose your table</h2>
          <p className="menu-card__tagline">
            Gather around one screen or invite your party online.
          </p>

          <div className="menu-actions">
            <Button
              variant="primary"
              fullWidth
              className="menu-action menu-action--local"
              aria-label="Local game"
              onClick={() => {
                startFreshLobby();
                void navigate('/lobby');
              }}
            >
              <span className="menu-action__icon" aria-hidden="true">
                ⌂
              </span>
              <span className="menu-action__copy">
                <strong>Local game</strong>
                <small>Build a table on this device</small>
              </span>
              <span className="menu-action__arrow" aria-hidden="true">
                ›
              </span>
            </Button>
            <Button
              variant="secondary"
              fullWidth
              className="menu-action menu-action--online"
              aria-label="Online multiplayer"
              onClick={() => void navigate('/online')}
            >
              <span className="menu-action__icon" aria-hidden="true">
                ◎
              </span>
              <span className="menu-action__copy">
                <strong>Online multiplayer</strong>
                <small>Host or join a private room</small>
              </span>
              <span className="menu-action__arrow" aria-hidden="true">
                ›
              </span>
            </Button>
            <Button
              variant="ghost"
              fullWidth
              className="menu-action menu-action--settings"
              aria-label="Settings"
              onClick={openSettings}
            >
              <span className="menu-action__icon" aria-hidden="true">
                ⚙
              </span>
              <span className="menu-action__copy">
                <strong>Settings</strong>
                <small>Sound, music, and accessibility</small>
              </span>
              <span className="menu-action__arrow" aria-hidden="true">
                ›
              </span>
            </Button>
          </div>

          <footer className="menu-card__footer">
            <span>
              <i aria-hidden="true" /> Ready to play
            </span>
            <small>v0.1</small>
          </footer>
        </section>
      </div>
    </main>
  );
}
