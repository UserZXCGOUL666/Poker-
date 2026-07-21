import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ErrorState, Loading } from './components/Loading';
import { useAuth } from './contexts/AuthContext';
import { AdminPage } from './pages/AdminPage';
import { GamesPage } from './pages/GamesPage';
import { HomePage } from './pages/HomePage';
import { ProfilePage } from './pages/ProfilePage';
import { RatingPage } from './pages/RatingPage';
import { BrowserLoginPage } from './pages/BrowserLoginPage';
import { api } from './lib/api';
import { applyAccentColor } from './lib/theme';

export default function App() {
  const { user, loading, error } = useAuth();
  useEffect(() => {
    void api<{ accentColor: string }>('/branding/theme').then((theme) => applyAccentColor(theme.accentColor)).catch(() => undefined);
  }, []);
  if (loading) return <div className="app-shell"><Loading /></div>;
  if (window.location.pathname === '/browser-login' && !user) return <BrowserLoginPage />;
  if (error || !user) return <div className="app-shell"><ErrorState message={error ?? 'Откройте приложение из Telegram-бота'} /></div>;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="rating" element={<RatingPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="admin" element={user.role === 'ADMIN' ? <AdminPage /> : <Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
