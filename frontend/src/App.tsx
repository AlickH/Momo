import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AppProvider, useApp } from './context/AppContext';
import { Layout } from './components/Layout';
import { BootError, BootSplash, DeniedPage } from './pages/BootPages';
import { OverviewPage } from './pages/OverviewPage';
import { ProxiesPage } from './pages/ProxiesPage';
import { ProfilesPage } from './pages/ProfilesPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { TopologyPage } from './pages/TopologyPage';
import { RulesPage } from './pages/RulesPage';
import { LogsPage } from './pages/LogsPage';
import { SettingsPage } from './pages/SettingsPage';

function Gate() {
  const { me, status, denied, bootError, retryBoot, statusError } = useApp();
  const [retrying, setRetrying] = useState(false);

  if (denied) return <DeniedPage />;

  const retry = async () => {
    setRetrying(true);
    try {
      await retryBoot();
    } finally {
      setRetrying(false);
    }
  };

  if (!me) {
    if (bootError) return <BootError message={bootError.message} onRetry={retry} pending={retrying} />;
    return <BootSplash />;
  }

  if (!status) {
    if (bootError) return <BootError message={bootError.message} onRetry={retry} pending={retrying} />;
    if (statusError) return <BootError message={statusError.message} onRetry={retry} pending={retrying} />;
    return <BootSplash />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="proxies" element={<ProxiesPage />} />
        <Route path="profiles" element={<ProfilesPage />} />
        <Route path="connections" element={<ConnectionsPage />} />
        <Route path="topology" element={<TopologyPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <Gate />
      </AppProvider>
    </ToastProvider>
  );
}
