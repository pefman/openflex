import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import IndexersSettings from './settings/IndexersSettings.tsx'
import QualitySettings from './settings/QualitySettings.tsx'
import UsenetSettings from './settings/UsenetSettings.tsx'
import GeneralSettings from './settings/GeneralSettings.tsx'
import LibrarySettings from './settings/LibrarySettings.tsx'
import UsersSettings from './settings/UsersSettings.tsx'
import NotificationsSettings from './settings/NotificationsSettings.tsx'
import BackupSettings from './settings/BackupSettings.tsx'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/settings/general', label: 'General' },
  { to: '/settings/library', label: 'Library' },
  { to: '/settings/indexers', label: 'Indexers' },
  { to: '/settings/quality', label: 'Quality' },
  { to: '/settings/download-clients', label: 'Download Clients' },
  { to: '/settings/notifications', label: 'Notifications' },
  { to: '/settings/backup', label: 'Backup' },
  { to: '/settings/users', label: 'Users' },
]

export default function SettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Tab bar styled like shadcn Tabs */}
      <div className="inline-flex h-9 items-center rounded-lg bg-muted p-1 mb-6 flex-wrap gap-y-1">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cn(
                'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isActive
                  ? 'bg-background text-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <Routes>
        <Route path="/" element={<Navigate to="general" replace />} />
        <Route path="general" element={<GeneralSettings />} />
        <Route path="library" element={<LibrarySettings />} />
        <Route path="indexers" element={<IndexersSettings />} />
        <Route path="quality" element={<QualitySettings />} />
        <Route path="download-clients" element={<UsenetSettings />} />
        <Route path="notifications" element={<NotificationsSettings />} />
        <Route path="backup" element={<BackupSettings />} />
        <Route path="users" element={<UsersSettings />} />
      </Routes>
    </div>
  )
}
