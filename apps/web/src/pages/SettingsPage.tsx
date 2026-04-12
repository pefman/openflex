import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import IndexersSettings from './settings/IndexersSettings.tsx'
import QualitySettings from './settings/QualitySettings.tsx'
import UsenetSettings from './settings/UsenetSettings.tsx'
import GeneralSettings from './settings/GeneralSettings.tsx'
import LibrarySettings from './settings/LibrarySettings.tsx'
import UsersSettings from './settings/UsersSettings.tsx'
import NotificationsSettings from './settings/NotificationsSettings.tsx'
import BackupSettings from './settings/BackupSettings.tsx'
import { indexersApi, settingsApi, usenetApi } from '../api/index.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  const qc = useQueryClient()
  const { data: settings = {} } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const { data: indexers = [] } = useQuery({ queryKey: ['indexers'], queryFn: indexersApi.list })
  const { data: usenetServers = [] } = useQuery({ queryKey: ['usenet-servers'], queryFn: usenetApi.list })

  const indexerConfigured = indexers.some((i) => i.enabled)
  const downloadConfigured = usenetServers.some((s) => s.enabled)
  const completedSteps = Number(indexerConfigured) + Number(downloadConfigured)
  const onboardingCompleted = settings.ONBOARDING_COMPLETED === 'true'

  const finishMutation = useMutation({
    mutationFn: () => settingsApi.set({ ONBOARDING_COMPLETED: 'true' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <Card className="mb-6 border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-3 flex-wrap">
            <span>Setup progress</span>
            <div className="flex items-center gap-2">
              <Badge variant={completedSteps === 2 ? 'default' : 'outline'}>{completedSteps}/2 configured</Badge>
              {onboardingCompleted && <Badge variant="secondary">Onboarding complete</Badge>}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between gap-3 py-2">
            <div>
              <p className="text-sm font-medium">Indexer setup</p>
              <p className="text-xs text-muted-foreground">Add and enable at least one indexer.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={indexerConfigured ? 'default' : 'outline'}>
                {indexerConfigured ? 'Configured' : 'Missing'}
              </Badge>
              <Button asChild size="sm" variant="outline">
                <NavLink to="/settings/indexers">Open</NavLink>
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 py-2 border-t">
            <div>
              <p className="text-sm font-medium">Download client setup</p>
              <p className="text-xs text-muted-foreground">Add and enable at least one Usenet server.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={downloadConfigured ? 'default' : 'outline'}>
                {downloadConfigured ? 'Configured' : 'Missing'}
              </Badge>
              <Button asChild size="sm" variant="outline">
                <NavLink to="/settings/download-clients">Open</NavLink>
              </Button>
            </div>
          </div>

          {!onboardingCompleted && (
            <div className="pt-3 border-t mt-2">
              <Button
                size="sm"
                onClick={() => finishMutation.mutate()}
                disabled={!indexerConfigured || !downloadConfigured || finishMutation.isPending}
              >
                Finish onboarding
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
