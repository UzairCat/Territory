import { useAppStore, type AnimationSpeed } from '../../app/stores/app-store';
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

        <label className="check-field" htmlFor="turn-privacy">
          <input
            id="turn-privacy"
            type="checkbox"
            checked={settings.turnPrivacy}
            onChange={(event) => update({ turnPrivacy: event.target.checked })}
          />
          <span>
            <strong>Pass-device privacy</strong>
            <small>Hide private hands until the active player confirms.</small>
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
