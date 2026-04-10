import { useState, useMemo } from 'react'
import { useMutation } from '@tanstack/react-query'
import { moviesApi, showsApi } from '../api/index.ts'
import type { IndexerSearchResultWithScore } from '../api/index.ts'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, RefreshCw, CheckCircle2, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type SortField = 'score' | 'size' | 'date' | 'grabs'
type SortDir = 'asc' | 'desc'

type Props =
  | { type: 'movie'; movieId: number; label?: string }
  | { type: 'episode'; showId: number; episodeId: number; label?: string }

export default function ManualSearchDialog(props: Props) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<IndexerSearchResultWithScore[]>([])
  const [grabbed, setGrabbed] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<SortField>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sorted = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1
    return [...results].sort((a, b) => {
      switch (sortField) {
        case 'score': return dir * (a.score - b.score)
        case 'size': return dir * (a.size - b.size)
        case 'grabs': return dir * (a.grabs - b.grabs)
        case 'date': {
          const da = a.publishDate ? new Date(a.publishDate).getTime() : 0
          const db = b.publishDate ? new Date(b.publishDate).getTime() : 0
          return dir * (da - db)
        }
      }
    })
  }, [results, sortField, sortDir])

  const searchMutation = useMutation({
    mutationFn: () =>
      props.type === 'movie'
        ? moviesApi.search(props.movieId)
        : showsApi.searchEpisode(props.showId, props.episodeId),
    onSuccess: (data) => setResults(data),
  })

  const grabMutation = useMutation({
    mutationFn: (release: IndexerSearchResultWithScore) =>
      props.type === 'movie'
        ? moviesApi.grab(props.movieId, release)
        : showsApi.grabEpisode(props.showId, props.episodeId, release),
    onSuccess: (_, release) => setGrabbed((prev) => new Set(prev).add(release.title)),
  })

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen)
    if (isOpen && results.length === 0) searchMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs px-2">
          <Search className="h-3.5 w-3.5" />
          Search
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-primary" />
            Manual Search
            {props.label && <span className="text-muted-foreground font-normal">— {props.label}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between text-sm py-1">
          <span className="text-muted-foreground">
            {searchMutation.isPending
              ? 'Searching indexers…'
              : `${results.length} result${results.length !== 1 ? 's' : ''} found`}
          </span>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={() => searchMutation.mutate()} disabled={searchMutation.isPending}>
            <RefreshCw className={cn('h-3.5 w-3.5', searchMutation.isPending && 'animate-spin')} />
            Re-search
          </Button>
        </div>

        {results.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground pb-1">
            <span className="mr-1">Sort:</span>
            {(['score', 'size', 'date', 'grabs'] as SortField[]).map((f) => (
              <button
                key={f}
                onClick={() => toggleSort(f)}
                className={cn(
                  'flex items-center gap-0.5 px-2 py-0.5 rounded hover:bg-muted transition-colors capitalize',
                  sortField === f && 'bg-muted text-foreground font-medium'
                )}
              >
                {f}
                {sortField === f
                  ? sortDir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
                  : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
              </button>
            ))}
          </div>
        )}

        <ScrollArea className="h-96 border border-border rounded-lg">
          {searchMutation.isPending && (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Searching…
            </div>
          )}
          {!searchMutation.isPending && results.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground text-sm">
              <Search className="h-8 w-8 opacity-30" />
              No results found
            </div>
          )}
          {results.length > 0 && (
            <div className="divide-y divide-border">
              {sorted.map((r, i) => {
                const isGrabbed = grabbed.has(r.title)
                const isRejected = r.score === 0
                return (
                  <div key={i} className={cn('flex items-start gap-3 px-4 py-3 hover:bg-muted/50', isRejected && 'opacity-50')}>
                    <ScoreBadge score={r.score} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium break-all leading-snug">
                        {r.title}
                        {isRejected && (
                          <span className="ml-1.5 text-xs font-normal text-orange-400 border border-orange-500/40 rounded px-1 py-0.5 align-middle">⚠ filtered</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatSize(r.size)}
                        {r.grabs > 0 && <> · <span className="text-sky-400">{r.grabs} grabs</span></>}
                        {r.indexerType === 'torznab' && r.seeders > 0 && <> · <span className="text-green-400">{r.seeders}S</span></>}
                        {r.indexerType === 'torznab' && r.leechers > 0 && <> · <span className="text-orange-400">{r.leechers}L</span></>}
                        {r.publishDate && <> · {new Date(r.publishDate).toLocaleDateString()}</>}
                        {r.indexerName && <> · <span className="text-muted-foreground/70">{r.indexerName}</span></>}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="h-7 shrink-0"
                      variant={isGrabbed ? 'secondary' : 'default'}
                      disabled={isGrabbed || grabMutation.isPending}
                      onClick={() => grabMutation.mutate(r)}
                    >
                      {isGrabbed ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Queued</> : 'Grab'}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 text-xs w-10 justify-center',
        score >= 70 && 'border-green-500/50 text-green-400',
        score >= 40 && score < 70 && 'border-yellow-500/50 text-yellow-400',
        score < 40 && 'border-muted text-muted-foreground',
      )}
    >
      {score}
    </Badge>
  )
}

function formatSize(bytes: number): string {
  if (!bytes) return '?'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}
