import { useAppStore, type AnimationSpeed } from '../../app/stores/app-store';
import type { BoardFrameRateLimit, BoardGraphicsQuality } from '../../board-renderer/performance';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

export function SettingsModal() {
  const open = useAppStore((state) => state.settingsOpen);
  const settings = useAppStore((state) => state.settings);
  const close = useAppStore((state) => state.closeSettings);
  const update = useAppStore((state) => state.updateSettings);

  return (
    <Modal
      open={open}
      title="Settings"
      description="Interface settings never change the game rules."
      onClose={close}
    >
      <div className="settings-grid">
        <label className="field" htmlFor="master-volume">
          <span>
            Master volume <output>{settings.masterVolume}%</output>
          </span>
          <input
            id="master-volume"
            data-modal-autofocus
            type="range"
            min="0"
            max="100"
            value={settings.masterVolume}
            onChange={(event) => update({ masterVolume: Number(event.target.value) })}
          />
        </label>

        <label className="field" htmlFor="sfx-volume">
          <span>
            Sound effects <output>{settings.sfxVolume}%</output>
          </span>
          <input
            id="sfx-volume"
            type="range"
            min="0"
            max="100"
            value={settings.sfxVolume}
            onChange={(event) => update({ sfxVolume: Number(event.target.value) })}
          />
        </label>

        <label className="field" htmlFor="music-volume">
          <span>
            Medieval music <output>{settings.musicVolume}%</output>
          </span>
          <input
            id="music-volume"
            type="range"
            min="0"
            max="100"
            value={settings.musicVolume}
            onChange={(event) => update({ musicVolume: Number(event.target.value) })}
          />
        </label>

        <label className="field" htmlFor="animation-speed">
          <span>Animation speed</span>
          <select
            id="animation-speed"
            value={settings.animationSpeed}
            onChange={(event) => update({ animationSpeed: event.target.value as AnimationSpeed })}
          >
            <option value="NORMAL">Normal</option>
            <option value="FAST">Fast</option>
          </select>
        </label>

        <label className="field" htmlFor="graphics-quality">
          <span>Board detail</span>
          <select
            id="graphics-quality"
            value={settings.graphicsQuality}
            onChange={(event) =>
              update({ graphicsQuality: event.target.value as BoardGraphicsQuality })
            }
          >
            <option value="HIGH">High</option>
            <option value="BALANCED">Balanced</option>
            <option value="PERFORMANCE">Performance</option>
          </select>
          <small>
            Performance mode lowers canvas resolution and removes decorative tile detail.
          </small>
        </label>

        <label className="field" htmlFor="frame-rate-limit">
          <span>Board frame limit</span>
          <select
            id="frame-rate-limit"
            value={settings.frameRateLimit}
            onChange={(event) =>
              update({ frameRateLimit: Number(event.target.value) as BoardFrameRateLimit })
            }
          >
            <option value="60">60 FPS</option>
            <option value="45">45 FPS</option>
            <option value="30">30 FPS</option>
          </select>
          <small>Lower values reduce GPU usage, especially on large maps and laptops.</small>
        </label>

        <label className="check-field" htmlFor="timer-sounds">
          <input
            id="timer-sounds"
            type="checkbox"
            checked={settings.timerSounds}
            onChange={(event) => update({ timerSounds: event.target.checked })}
          />
          <span>
            <strong>Timer warning sounds</strong>
            <small>
              Play countdown ticks during timed choices. Dice and robber timers stay silent.
            </small>
          </span>
        </label>

        <label className="check-field" htmlFor="reduced-motion">
          <input
            id="reduced-motion"
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(event) => update({ reducedMotion: event.target.checked })}
          />
          <span>
            <strong>Reduced motion</strong>
            <small>Shorten or remove nonessential animation.</small>
          </span>
        </label>
      </div>

      <footer className="modal__actions">
        <Button variant="primary" onClick={close}>
          Done
        </Button>
      </footer>
    </Modal>
  );
}
