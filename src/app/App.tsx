import { Navigate, Route, Routes } from 'react-router-dom';

import { GameScreen } from './screens/GameScreen';
import { LocalLobbyScreen } from './screens/LocalLobbyScreen';
import { MainMenuScreen } from './screens/MainMenuScreen';
import { OnlineLobbyScreen } from './screens/OnlineLobbyScreen';
import { OnlineMenuScreen } from './screens/OnlineMenuScreen';
import { SettingsModal } from '../ui/settings/SettingsModal';

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<MainMenuScreen />} />
        <Route path="/lobby" element={<LocalLobbyScreen />} />
        <Route path="/online" element={<OnlineMenuScreen />} />
        <Route path="/online/:roomCode" element={<OnlineLobbyScreen />} />
        <Route path="/game" element={<GameScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SettingsModal />
    </>
  );
}
