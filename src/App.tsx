import { Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './app/AppProvider';
import { NotificationsProvider } from './app/Notifications';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { StudyPage } from './pages/StudyPage';
import { VocabularyPage } from './pages/VocabularyPage';
import { ReviewPage } from './pages/ReviewPage';
import { DifficultPage } from './pages/DifficultPage';
import { StatsPage } from './pages/StatsPage';
import { SettingsPage } from './pages/SettingsPage';

function Shell() {
  const { ready, fatalError } = useApp();

  if (fatalError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-danger/50 bg-surface-raised p-6 text-center">
          <h1 className="mb-2 text-lg font-semibold">数据库错误</h1>
          <p className="text-sm text-content-muted">{fatalError}</p>
          <p className="mt-3 text-xs text-content-muted">
            请先导出/备份现有数据，切勿直接清除浏览器存储。
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="初始化本地数据库…" />
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/study" replace />} />
        <Route path="/study" element={<StudyPage />} />
        <Route path="/vocabulary" element={<VocabularyPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/difficult" element={<DifficultPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/study" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <NotificationsProvider>
        <Shell />
      </NotificationsProvider>
    </AppProvider>
  );
}
