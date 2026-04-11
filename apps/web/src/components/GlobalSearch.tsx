import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Film, Tv2, Search } from 'lucide-react'
import { moviesApi, showsApi } from '../api/index.ts'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { slugify } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onNavigate: (path: string) => void
}

export default function GlobalSearch({ open, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState('')

  const { data: movies = [] } = useQuery({ queryKey: ['movies'], queryFn: moviesApi.list, staleTime: 30_000 })
  const { data: shows = [] } = useQuery({ queryKey: ['shows'], queryFn: showsApi.list, staleTime: 30_000 })

  // Reset query when dialog closes
  useEffect(() => { if (!open) setQuery('') }, [open])

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (!open) onClose() // trigger parent to open — actually we toggle from Layout
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const movieHits = movies
      .filter((m) => m.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map((m) => ({ type: 'movie' as const, id: m.id, title: m.title, year: m.year, path: `/movies/${m.id}`, poster: m.posterPath }))
    const showHits = shows
      .filter((s) => s.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map((s) => ({ type: 'show' as const, id: s.id, title: s.title, year: null as number | null, path: `/shows/${slugify(s.title)}-${s.id}`, poster: s.posterPath }))
    return [...movieHits, ...showHits]
  }, [query, movies, shows])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            placeholder="Search library… (⌘K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 h-12 text-sm pl-3"
          />
        </div>

        {query.trim() && (
          <div className="max-h-80 overflow-y-auto py-1">
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No results in library</p>
            ) : (
              results.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => onNavigate(r.path)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent text-left transition-colors"
                >
                  {r.poster ? (
                    <img src={r.poster} alt="" className="h-9 w-6 rounded object-cover shrink-0" />
                  ) : (
                    <div className="h-9 w-6 rounded bg-muted flex items-center justify-center shrink-0">
                      {r.type === 'movie' ? <Film className="h-3 w-3 text-muted-foreground" /> : <Tv2 className="h-3 w-3 text-muted-foreground" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.type === 'movie' ? 'Movie' : 'Show'}{r.year ? ` · ${r.year}` : ''}</p>
                  </div>
                </button>
              ))
            )}

            <div className="border-t mt-1 pt-1">
              <button
                onClick={() => onNavigate(`/movies?q=${encodeURIComponent(query.trim())}`)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent text-left transition-colors text-sm text-muted-foreground"
              >
                <Search className="h-4 w-4 shrink-0" />
                Search TMDB for "{query.trim()}"
              </button>
            </div>
          </div>
        )}

        {!query.trim() && (
          <p className="text-xs text-muted-foreground text-center py-6">Start typing to search your library</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
