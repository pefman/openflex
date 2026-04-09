import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.tsx'
import Layout from './components/Layout.tsx'
import LoginPage from './pages/LoginPage.tsx'
import Dashboard from './pages/Dashboard.tsx'
import MoviesPage from './pages/MoviesPage.tsx'
import MovieDetailPage from './pages/MovieDetailPage.tsx'
import ShowsPage from './pages/ShowsPage.tsx'
import ShowDetailPage from './pages/ShowDetailPage.tsx'
import PlayerPage from './pages/PlayerPage.tsx'
import DownloadsPage from './pages/DownloadsPage.tsx'
import SettingsPage from './pages/SettingsPage.tsx'
import LogsPage from './pages/LogsPage.tsx'
import WantedPage from './pages/WantedPage.tsx'
import HealthPage from './pages/HealthPage.tsx'

function ProtectedRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex h-screen items-center justify-center text-gray-400">Loading…</div>
  if (!user) return <Navigate to="/login" replace />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/movies" element={<MoviesPage />} />
        <Route path="/movies/:id" element={<MovieDetailPage />} />
        <Route path="/shows" element={<ShowsPage />} />
        <Route path="/shows/:slug" element={<ShowDetailPage />} />
        <Route path="/player/:mediaFileId" element={<PlayerPage />} />
        <Route path="/downloads" element={<DownloadsPage />} />
        <Route path="/wanted" element={<WantedPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/settings/*" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </AuthProvider>
  )
}
