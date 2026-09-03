import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { SettingsModal } from '../ui/settings/SettingsModal';
import { useAppStore } from './stores/app-store';

const testRoutes =
  import.meta.env.MODE === 'test'
    ? await Promise.all([
        import('./screens/GameScreen'),
        import('./screens/LocalLobbyScreen'),
        import('./screens/MainMenuScreen'),
        import('./screens/OnlineLobbyScreen'),
        import('./screens/OnlineMenuScreen'),
      ])
    : null;

const GameScreen =
  testRoutes?.[0].GameScreen ??
  lazy(() => import('./screens/GameScreen').then((module) => ({ default: module.GameScreen })));
const LocalLobbyScreen =
  testRoutes?.[1].LocalLobbyScreen ??
  lazy(() =>
    import('./screens/LocalLobbyScreen').then((module) => ({ default: module.LocalLobbyScreen })),
  );
const MainMenuScreen =
  testRoutes?.[2].MainMenuScreen ??
  lazy(() =>
    import('./screens/MainMenuScreen').then((module) => ({ default: module.MainMenuScreen })),
  );
const OnlineLobbyScreen =
  testRoutes?.[3].OnlineLobbyScreen ??
  lazy(() =>
    import('./screens/OnlineLobbyScreen').then((module) => ({ default: module.OnlineLobbyScreen })),
  );
const OnlineMenuScreen =
  testRoutes?.[4].OnlineMenuScreen ??
  lazy(() =>
    import('./screens/OnlineMenuScreen').then((module) => ({ default: module.OnlineMenuScreen })),
  );

function RouteFallback() {
  return (
    <main className="route-loading" aria-live="polite" aria-label="Loading Territory">
      <span aria-hidden="true">⬡</span>
      <strong>Preparing the table…</strong>
    </main>
  );
}

export function App() {
  const reducedMotion = useAppStore((state) => state.settings.reducedMotion);
  const interfaceSize = useAppStore((state) => state.settings.interfaceSize);
  const gameElementSize = useAppStore((state) => state.settings.gameElementSize);

  useEffect(() => {
    document.documentElement.classList.toggle('app-reduced-motion', reducedMotion);
    return () => document.documentElement.classList.remove('app-reduced-motion');
  }, [reducedMotion]);

  useEffect(() => {
    document.documentElement.dataset.interfaceSize = interfaceSize.toLowerCase();
    return () => {
      delete document.documentElement.dataset.interfaceSize;
    };
  }, [interfaceSize]);

  useEffect(() => {
    document.documentElement.dataset.gameElementSize = gameElementSize.toLowerCase();
    return () => {
      delete document.documentElement.dataset.gameElementSize;
    };
  }, [gameElementSize]);

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<MainMenuScreen />} />
          <Route path="/lobby" element={<LocalLobbyScreen />} />
          <Route path="/online" element={<OnlineMenuScreen />} />
          <Route path="/online/:roomCode" element={<OnlineLobbyScreen />} />
          <Route path="/game" element={<GameScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <SettingsModal />
    </>
  );
}
