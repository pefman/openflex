import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { downloadsApi } from '../api/index.ts'
import type { DownloadDto } from '@openflex/shared'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Pause, Play, X, Trash2 } from 'lucide-react'

const statusCls: Record<string, string> = {
  queued:      'badge-status bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/20',
  downloading: 'badge-downloading',
  importing:   'badge-status bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/20',
  paused:      'badge-wanted',
  completed:   'badge-downloaded',
  failed:      'badge-missing',
}

export default function DownloadsPage() {
  const qc = useQueryClient()
  const { data: downloads = [] } = useQuery({
    queryKey: ['downloads'],
    queryFn: downloadsApi.list,
    refetchInterval: 2000,
  })

  const clearHistoryMutation = useMutation({
    mutationFn: downloadsApi.clearHistory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['downloads'] }),
  })

  const removeMutation = useMutation({
    mutationFn: downloadsApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['downloads'] }),
  })
  const pauseMutation = useMutation({
    mutationFn: downloadsApi.pause,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['downloads'] }),
  })
  const resumeMutation = useMutation({
    mutationFn: downloadsApi.resume,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['downloads'] }),
  })

  const active = downloads.filter((d) => ['queued', 'downloading', 'importing', 'paused'].includes(d.status))
  const history = downloads.filter((d) => ['completed', 'failed'].includes(d.status))

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Downloads</h1>

      <section>
        <h2 className="text-base font-semibold mb-3 text-muted-foreground uppercase tracking-wide text-xs">
          Active ({active.length})
        </h2>
        {active.length === 0 ? (
          <p className="text-muted-foreground text-sm">No active downloads</p>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {active.map((d) => (
                <DownloadRow
                  key={d.id}
                  download={d}
                  onPause={() => pauseMutation.mutate(d.id)}
                  onResume={() => resumeMutation.mutate(d.id)}
                  onRemove={() => removeMutation.mutate(d.id)}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide text-xs">
              History
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => clearHistoryMutation.mutate()}
              disabled={clearHistoryMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear history
            </Button>
          </div>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {history.map((d) => (
                <DownloadRow
                  key={d.id}
                  download={d}
                  onRemove={() => removeMutation.mutate(d.id)}
                />
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}

function DownloadRow({
  download, onPause, onResume, onRemove,
}: {
  download: DownloadDto
  onPause?: () => void
  onResume?: () => void
  onRemove: () => void
}) {
  const pct = Math.round(download.progress * 100)

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={statusCls[download.status] ?? statusCls.queued}>{download.status}</span>
          <span className="text-xs text-muted-foreground">{download.type}</span>
        </div>
        <p className="text-sm font-medium truncate">{download.title}</p>
        {download.status === 'downloading' && (
          <div className="mt-2 space-y-1">
            <Progress value={pct} className="h-1.5" />
            <p className="text-xs text-muted-foreground">
              {pct}%
              {download.speed ? ` · ${formatSpeed(download.speed)}` : ''}
              {download.eta ? ` · ETA ${formatEta(download.eta)}` : ''}
            </p>
          </div>
        )}
        {download.error && <p className="text-xs text-destructive mt-1">{download.error}</p>}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {download.status === 'downloading' && onPause && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPause}>
            <Pause className="h-3.5 w-3.5" />
          </Button>
        )}
        {download.status === 'paused' && onResume && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onResume}>
            <Play className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function formatSpeed(bps: number): string {
  if (bps > 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
  if (bps > 1024) return `${Math.round(bps / 1024)} KB/s`
  return `${Math.round(bps)} B/s`
}

function formatEta(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`
}
