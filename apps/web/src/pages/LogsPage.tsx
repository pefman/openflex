import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { logsApi, type LogEntry } from '../api/index.ts'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RefreshCw, Trash2 } from 'lucide-react'

const KNOWN_SOURCES = ['scheduler', 'indexer', 'grabber', 'torrent', 'usenet', 'organizer', 'player'] as const
const LEVEL_OPTIONS = ['all', 'info', 'warn', 'error'] as const

export default function LogsPage() {
  const qc = useQueryClient()
  const { data: logs = [], isFetching, refetch } = useQuery({
    queryKey: ['logs'],
    queryFn: () => logsApi.list(500),
    refetchInterval: 5_000,
  })

  const clearMutation = useMutation({
    mutationFn: logsApi.clear,
    onSuccess: () => {
      qc.setQueryData(['logs'], [])
      qc.setQueryData(['logs', 'error-count'], 0)
      toast.success('Logs cleared')
    },
  })

  const [source, setSource] = useState<string>('all')
  const [level, setLevel] = useState<string>('all')
  const [confirmClear, setConfirmClear] = useState(false)

  // Collect all sources that have actually appeared in logs
  const activeSources = useMemo(() => {
    const seen = new Set(logs.map((l) => l.source))
    return ['all', ...KNOWN_SOURCES.filter((s) => seen.has(s)), ...[...seen].filter((s) => !KNOWN_SOURCES.includes(s as any) && s !== 'all')]
  }, [logs])

  const filtered = useMemo(() => {
    return [...logs]
      .filter((l) => source === 'all' || l.source === source)
      .filter((l) => level === 'all' || l.level === level)
      .reverse()
  }, [logs, source, level])

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{logs.length} entries — refreshes every 5 s</p>
        </div>
        <div className="flex items-center gap-2">
          {confirmClear ? (
            <>
              <span className="text-xs text-destructive">Clear all logs?</span>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs"
                onClick={() => { clearMutation.mutate(); setConfirmClear(false) }}
                disabled={clearMutation.isPending}
              >
                Yes, clear
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setConfirmClear(false)}>Cancel</Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-destructive hover:text-destructive"
              onClick={() => setConfirmClear(true)}
              disabled={logs.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Clear logs
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-4 w-4 mr-1.5', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        {/* Source tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {activeSources.map((s) => {
            const levelFiltered = level === 'all' ? logs : logs.filter((l) => l.level === level)
            const count = s === 'all' ? levelFiltered.length : levelFiltered.filter((l) => l.source === s).length
            return (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  source === s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {s} <span className="opacity-60">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Level filter */}
        <div className="flex items-center gap-1 ml-auto">
          {LEVEL_OPTIONS.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                level === l ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
                l === 'error' && level !== l && 'hover:text-destructive',
                l === 'warn' && level !== l && 'hover:text-yellow-400',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 rounded-lg border border-border bg-card min-h-0">
        <div className="p-4 space-y-0.5 font-mono text-xs">
          {filtered.length === 0 && (
            <p className="text-muted-foreground py-8 text-center">No matching log entries.</p>
          )}
          {filtered.map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function LogRow({ entry }: { entry: LogEntry }) {
  return (
    <div className={cn(
      'flex gap-3 items-start py-1 px-2 rounded',
      entry.level === 'error' && 'bg-destructive/10',
      entry.level === 'warn' && 'bg-yellow-500/10',
    )}>
      <span className="text-muted-foreground shrink-0 tabular-nums">{formatTime(entry.ts)}</span>
      <LevelBadge level={entry.level} />
      <span className="text-primary/80 shrink-0">[{entry.source}]</span>
      <span className={cn(
        'break-all',
        entry.level === 'error' && 'text-destructive',
        entry.level === 'warn' && 'text-yellow-400',
      )}>
        {entry.message}
      </span>
    </div>
  )
}

function LevelBadge({ level }: { level: LogEntry['level'] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 h-4 px-1 text-[10px] font-bold uppercase tabular-nums',
        level === 'info' && 'border-blue-500/50 text-blue-400',
        level === 'warn' && 'border-yellow-500/50 text-yellow-400',
        level === 'error' && 'border-destructive/50 text-destructive',
      )}
    >
      {level}
    </Badge>
  )
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    + ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
