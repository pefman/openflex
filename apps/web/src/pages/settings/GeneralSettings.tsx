import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, schedulerApi, cleanupApi, systemApi } from '../../api/index.ts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { CheckCircle2, Play, RotateCcw, Trash2 } from 'lucide-react'

const INTERVAL_OPTIONS = [
  { label: '15 minutes', value: '15' },
  { label: '30 minutes', value: '30' },
  { label: '1 hour', value: '60' },
  { label: '2 hours', value: '120' },
  { label: '6 hours', value: '360' },
  { label: '12 hours', value: '720' },
  { label: '24 hours', value: '1440' },
]

const CLEANUP_INTERVAL_OPTIONS = [
  { label: '1 hour', value: '1' },
  { label: '6 hours', value: '6' },
  { label: '12 hours', value: '12' },
  { label: '24 hours', value: '24' },
  { label: '48 hours', value: '48' },
  { label: '7 days', value: '168' },
]

export default function GeneralSettings() {
  const qc = useQueryClient()
  const { data: settings = {} } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const { data: versionData } = useQuery({ queryKey: ['version'], queryFn: systemApi.version })
  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => settingsApi.set(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  const [tmdbKey, setTmdbKey] = useState('')
  const [tmdbSaved, setTmdbSaved] = useState(false)
  const [intervalMinutes, setIntervalMinutes] = useState('30')
  const [intervalSaved, setIntervalSaved] = useState(false)
  const [cleanupEnabled, setCleanupEnabled] = useState(true)
  const [cleanupIntervalHours, setCleanupIntervalHours] = useState('24')
  const [cleanupSaved, setCleanupSaved] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<string | null>(null)
  const [keepFailed, setKeepFailed] = useState(false)
  const [keepFailedSaved, setKeepFailedSaved] = useState(false)

  const { data: cleanupStatus } = useQuery({ queryKey: ['cleanup-status'], queryFn: cleanupApi.status })

  useEffect(() => {
    if (settings.TMDB_API_KEY) setTmdbKey(settings.TMDB_API_KEY)
    if (settings.SCHEDULER_INTERVAL_MINUTES) setIntervalMinutes(settings.SCHEDULER_INTERVAL_MINUTES)
    if (settings.CLEANUP_ENABLED !== undefined) setCleanupEnabled(settings.CLEANUP_ENABLED !== 'false')
    if (settings.CLEANUP_INTERVAL_HOURS) {
      setCleanupIntervalHours(settings.CLEANUP_INTERVAL_HOURS)
    } else if (cleanupStatus?.intervalHours) {
      setCleanupIntervalHours(String(cleanupStatus.intervalHours))
    }
    if (settings.KEEP_FAILED_DOWNLOADS !== undefined) setKeepFailed(settings.KEEP_FAILED_DOWNLOADS === 'true')
  }, [settings, cleanupStatus])

  const submitTmdb = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveMutation.mutateAsync({ TMDB_API_KEY: tmdbKey })
    setTmdbSaved(true)
    setTimeout(() => setTmdbSaved(false), 2000)
  }

  const submitInterval = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveMutation.mutateAsync({ SCHEDULER_INTERVAL_MINUTES: intervalMinutes })
    await schedulerApi.restart()
    setIntervalSaved(true)
    setTimeout(() => setIntervalSaved(false), 2000)
  }

  const runNowMutation = useMutation({ mutationFn: schedulerApi.runNow })

  const submitCleanup = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveMutation.mutateAsync({
      CLEANUP_ENABLED: String(cleanupEnabled),
      CLEANUP_INTERVAL_HOURS: cleanupIntervalHours,
    })
    await cleanupApi.restart()
    setCleanupSaved(true)
    setTimeout(() => setCleanupSaved(false), 2000)
  }

  const runCleanupMutation = useMutation({
    mutationFn: cleanupApi.runNow,
    onSuccess: (result) => {
      if (result.skipped) {
        setCleanupResult('Skipped — active downloads in progress')
      } else {
        setCleanupResult(result.deleted.length > 0 ? `Removed ${result.deleted.length} item(s)` : 'Nothing to clean')
      }
      setTimeout(() => setCleanupResult(null), 4000)
    },
  })

  return (
    <div className="max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">TMDB Integration</CardTitle>
          <CardDescription>Required to search and fetch movie and show metadata.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitTmdb} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tmdb-key">API Key</Label>
              <Input
                id="tmdb-key"
                type="password"
                placeholder="Get yours at themoviedb.org/settings/api"
                value={tmdbKey}
                onChange={(e) => setTmdbKey(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={saveMutation.isPending}>
              {tmdbSaved ? <><CheckCircle2 className="h-4 w-4 mr-1.5" />Saved</> : 'Save changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduler</CardTitle>
          <CardDescription>Controls how often monitored movies and episodes are searched for new releases.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitInterval} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="scheduler-interval">Search interval</Label>
              <Select value={intervalMinutes} onValueChange={setIntervalMinutes}>
                <SelectTrigger id="scheduler-interval" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                {intervalSaved
                  ? <><CheckCircle2 className="h-4 w-4 mr-1.5" />Saved</>
                  : <><RotateCcw className="h-4 w-4 mr-1.5" />Save &amp; restart</>}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={runNowMutation.isPending}
                onClick={() => runNowMutation.mutate()}
              >
                <Play className="h-4 w-4 mr-1.5" />
                Run now
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Downloads Cleanup</CardTitle>
          <CardDescription>
            Periodically removes orphaned files and empty folders from the downloads directory.
            Only runs when no downloads are active.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitCleanup} className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                id="cleanup-enabled"
                checked={cleanupEnabled}
                onCheckedChange={setCleanupEnabled}
              />
              <Label htmlFor="cleanup-enabled">Enable automatic cleanup</Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cleanup-interval">Cleanup interval</Label>
              <Select
                value={cleanupIntervalHours}
                onValueChange={setCleanupIntervalHours}
                disabled={!cleanupEnabled}
              >
                <SelectTrigger id="cleanup-interval" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLEANUP_INTERVAL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {cleanupStatus?.lastRun && (
              <p className="text-xs text-muted-foreground">
                Last run: {new Date(cleanupStatus.lastRun).toLocaleString()}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="submit" disabled={saveMutation.isPending}>
                {cleanupSaved
                  ? <><CheckCircle2 className="h-4 w-4 mr-1.5" />Saved</>
                  : <><RotateCcw className="h-4 w-4 mr-1.5" />Save &amp; restart</>}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={runCleanupMutation.isPending || cleanupStatus?.running}
                onClick={() => runCleanupMutation.mutate()}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                {runCleanupMutation.isPending ? 'Cleaning…' : 'Run now'}
              </Button>
              {cleanupResult && (
                <span className="text-xs text-muted-foreground">{cleanupResult}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Failed Downloads</CardTitle>
          <CardDescription>
            When enabled, the working directory of a failed download is kept on disk so you can inspect the files.
            Disable to have them cleaned up automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              id="keep-failed"
              checked={keepFailed}
              onCheckedChange={async (v) => {
                setKeepFailed(v)
                await saveMutation.mutateAsync({ KEEP_FAILED_DOWNLOADS: String(v) })
                setKeepFailedSaved(true)
                setTimeout(() => setKeepFailedSaved(false), 2000)
              }}
            />
            <Label htmlFor="keep-failed">Keep files from failed downloads</Label>
            {keepFailedSaved && <span className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />Saved</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Version</span>
            <span className="text-foreground font-mono">{versionData?.version ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>Source</span>
            <a href="https://github.com/pefman/openflex" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              github.com/pefman/openflex
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
