import { useQuery } from '@tanstack/react-query'
import { systemApi } from '../api/index.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function HealthPage() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: systemApi.health,
    refetchInterval: 30_000,
  })

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>
  if (!health) return <div className="p-6 text-destructive">Failed to load health data</div>

  const disk = health.disk
  const diskPct = disk ? Math.round((disk.used / disk.total) * 100) : 0

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Health</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Disk card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Disk Space</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {disk ? (
              <>
                <Progress
                  value={diskPct}
                  className={`h-2 ${diskPct > 90 ? '[&>*]:bg-destructive' : diskPct > 75 ? '[&>*]:bg-yellow-500' : ''}`}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatBytes(disk.used)} used</span>
                  <span>{formatBytes(disk.free)} free / {formatBytes(disk.total)} total</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{disk.path}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Unavailable</p>
            )}
          </CardContent>
        </Card>

        {/* Scheduler card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Scheduler</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Status</span>
              <Badge variant={health.scheduler.running ? 'default' : 'secondary'}>
                {health.scheduler.running ? 'Running' : 'Idle'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Interval</span>
              <span className="text-sm">{health.scheduler.intervalMinutes} min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last run</span>
              <span className="text-sm">{health.scheduler.lastRun ? timeAgo(health.scheduler.lastRun) : 'Never'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Indexers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Indexers ({health.indexers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {health.indexers.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No indexers configured</p>
          ) : (
            <div className="divide-y divide-border">
              {health.indexers.map((idx) => (
                <div key={idx.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{idx.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{idx.type} · priority {idx.priority}</p>
                  </div>
                  <Badge variant={idx.enabled ? 'default' : 'secondary'}>
                    {idx.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usenet servers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Usenet Servers ({health.usenetServers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {health.usenetServers.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No usenet servers configured</p>
          ) : (
            <div className="divide-y divide-border">
              {health.usenetServers.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.host}:{s.port}{s.ssl ? ' · SSL' : ''}</p>
                  </div>
                  <Badge variant={s.online ? 'default' : 'destructive'}>
                    {s.online ? 'Online' : 'Offline'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
