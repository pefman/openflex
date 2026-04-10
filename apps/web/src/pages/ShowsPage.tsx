import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { showsApi, searchApi, qualityApi } from '../api/index.ts'
import { slugify } from '@/lib/utils'
import type { TmdbShowResult, ShowDto } from '@openflex/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Plus, Loader2 } from 'lucide-react'

export default function ShowsPage() {
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'added' | 'title'>('added')
  const { data: shows = [], isLoading } = useQuery({ queryKey: ['shows'], queryFn: showsApi.list })

  const filtered = shows
    .filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title)
      return b.id - a.id
    })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Shows</h1>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Show
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative max-w-xs flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search library…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-32 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="added">Newest added</SelectItem>
            <SelectItem value="title">Title A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">📺</p>
          <p>No shows yet. Click "Add Show" to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
          {filtered.map((s) => <ShowCard key={s.id} show={s} />)}
        </div>
      )}

      <AddShowModal open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  )
}

function ShowCard({ show }: { show: ShowDto }) {
  const totalEpisodes = show.seasons.flatMap((s) => s.episodes).length
  const downloaded = show.seasons.flatMap((s) => s.episodes).filter((e) => e.status === 'downloaded').length

  return (
    <Link to={`/shows/${slugify(show.title)}`} className="group">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted">
        {show.posterPath ? (
          <img src={show.posterPath} alt={show.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs text-center p-2">{show.title}</div>
        )}
        {totalEpisodes > 0 && (
          <div className="absolute bottom-0 inset-x-0 bg-black/60 text-xs text-center py-1">
            {downloaded}/{totalEpisodes}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs font-medium truncate text-muted-foreground group-hover:text-foreground">{show.title}</p>
    </Link>
  )
}

function AddShowModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TmdbShowResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const { data: profiles = [] } = useQuery({ queryKey: ['quality-profiles'], queryFn: qualityApi.list })
  const [profileId, setProfileId] = useState<string>('')
  const qc = useQueryClient()

  const addMutation = useMutation({
    mutationFn: showsApi.add,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shows'] }); onClose() },
    onError: (e: any) => setAddError(e?.response?.data?.error ?? e?.message ?? 'Failed to add'),
  })

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const res = await searchApi.shows(query)
      setResults(res)
    } catch (err: any) {
      setSearchError(err?.response?.data?.message ?? err?.message ?? 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add TV Show</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Search TMDB…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={searching} size="icon">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {profiles.length > 0 && (
          <div className="space-y-1.5">
            <Label>Quality Profile</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger>
                <SelectValue placeholder="Any quality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any quality</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {searchError && <p className="text-sm text-destructive">{searchError}</p>}
        {addError && <p className="text-sm text-destructive">{addError}</p>}

        <ScrollArea className="max-h-96">
          <div className="space-y-1 pr-3">
            {results.map((r) => (
              <div key={r.tmdbId} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors">
                {r.posterPath && (
                  <img src={r.posterPath} alt={r.title} className="w-10 h-14 object-cover rounded shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.title}</p>
                  <p className="text-sm text-muted-foreground">{r.year}</p>
                  {r.overview && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.overview}</p>}
                </div>
                <Button
                  size="sm"
                  onClick={() => addMutation.mutate({ tmdbId: r.tmdbId, qualityProfileId: profileId && profileId !== 'any' ? Number(profileId) : undefined, monitored: true })}
                  disabled={addMutation.isPending}
                >
                  {addMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
