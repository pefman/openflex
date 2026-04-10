import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { moviesApi, showsApi, schedulerApi } from '../api/index.ts'
import { slugify, formatDate } from '@/lib/utils'
import ManualSearchDialog from '../components/ManualSearchDialog.tsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Play, Loader2 } from 'lucide-react'

type EpisodeEntry = {
  showId: number
  showTitle: string
  showSlug: string
  seasonNumber: number
  episodeId: number
  episodeNumber: number
  episodeTitle: string | null
  airDate: string | null
  status: string
}

function EpisodeRow({ ep }: { ep: EpisodeEntry }) {
  const epCode = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <Link to={`/shows/${ep.showSlug}`} className="text-sm font-medium hover:text-primary truncate block">
          {ep.showTitle}
        </Link>
        <Link to={`/shows/${ep.showSlug}?season=${ep.seasonNumber}`} className="text-xs text-muted-foreground hover:text-primary truncate block">
          {epCode}{ep.episodeTitle && ` · ${ep.episodeTitle}`}
          {ep.airDate && <span className="ml-1 text-muted-foreground/60">· {formatDate(ep.airDate)}</span>}
        </Link>
      </div>
      <Badge variant="outline" className={`shrink-0 ${ep.status === 'missing' ? 'badge-missing' : 'badge-wanted'}`}>
        {ep.status}
      </Badge>
      <ManualSearchDialog
        type="episode"
        showId={ep.showId}
        episodeId={ep.episodeId}
        label={`${ep.showTitle} ${epCode}`}
      />
    </div>
  )
}

export default function WantedPage() {
  const qc = useQueryClient()
  const { data: movies = [] } = useQuery({ queryKey: ['movies'], queryFn: moviesApi.list })
  const { data: shows = [] } = useQuery({ queryKey: ['shows'], queryFn: showsApi.list })
  const [episodeSort, setEpisodeSort] = React.useState<'airDate' | 'show'>('airDate')
  const [searchAllMsg, setSearchAllMsg] = React.useState<string | null>(null)

  const searchAllMut = useMutation({
    mutationFn: schedulerApi.runNow,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['downloads'] })
      setSearchAllMsg('Scheduler triggered — results will appear in Downloads')
      setTimeout(() => setSearchAllMsg(null), 5000)
    },
  })

  const wantedMovies = movies.filter((m) => m.status === 'wanted' && m.monitored)

  const wantedEpisodes: EpisodeEntry[] = []
  const missingEpisodes: EpisodeEntry[] = []

  for (const show of shows) {
    for (const season of show.seasons) {
      for (const ep of season.episodes) {
        if (!ep.monitored) continue
        const entry: EpisodeEntry = {
          showId: show.id,
          showTitle: show.title,
          showSlug: slugify(show.title),
          seasonNumber: season.seasonNumber,
          episodeId: ep.id,
          episodeNumber: ep.episodeNumber,
          episodeTitle: ep.title,
          airDate: ep.airDate,
          status: ep.status,
        }
        if (ep.status === 'wanted') wantedEpisodes.push(entry)
        else if (ep.status === 'missing') missingEpisodes.push(entry)
      }
    }
  }

  function sortEps(eps: EpisodeEntry[]) {
    if (episodeSort === 'airDate') {
      return [...eps].sort((a, b) => {
        if (!a.airDate) return 1
        if (!b.airDate) return -1
        return new Date(b.airDate).getTime() - new Date(a.airDate).getTime()
      })
    }
    return [...eps].sort((a, b) => a.showTitle.localeCompare(b.showTitle))
  }

  const sortedWanted = sortEps(wantedEpisodes)
  const sortedMissing = sortEps(missingEpisodes)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Wanted</h1>
        <div className="flex items-center gap-3">
          {searchAllMsg && <span className="text-xs text-muted-foreground">{searchAllMsg}</span>}
          <Button
            variant="outline"
            size="sm"
            onClick={() => searchAllMut.mutate()}
            disabled={searchAllMut.isPending}
          >
            {searchAllMut.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              : <Play className="h-3.5 w-3.5 mr-1.5" />}
            Search All
          </Button>
        </div>
      </div>

      {/* Movies */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Movies ({wantedMovies.length})
        </h2>
        {wantedMovies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wanted movies.</p>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {wantedMovies.map((movie) => (
                <div key={movie.id} className="flex items-center gap-3 px-4 py-3">
                  {movie.posterPath && (
                    <img src={movie.posterPath} alt="" className="h-10 w-7 object-cover rounded shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <Link to={`/movies/${movie.id}`} className="text-sm font-medium hover:text-primary truncate block">
                      {movie.title}
                    </Link>
                    {movie.year && <p className="text-xs text-muted-foreground">{movie.year}</p>}
                  </div>
                  <Badge variant="outline" className="badge-wanted shrink-0">wanted</Badge>
                  <ManualSearchDialog type="movie" movieId={movie.id} label={movie.title} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Wanted Episodes */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Episodes ({sortedWanted.length})
          </h2>
          <Select value={episodeSort} onValueChange={(v) => setEpisodeSort(v as 'airDate' | 'show')}>
            <SelectTrigger className="w-36 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="airDate">Sort by date</SelectItem>
              <SelectItem value="show">Sort by show</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {sortedWanted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wanted episodes.</p>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {sortedWanted.map((ep) => <EpisodeRow key={ep.episodeId} ep={ep} />)}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Missing Episodes */}
      {sortedMissing.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Missing ({sortedMissing.length})
            <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/60">files were removed</span>
          </h2>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {sortedMissing.map((ep) => <EpisodeRow key={ep.episodeId} ep={ep} />)}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}
