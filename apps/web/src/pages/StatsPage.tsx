import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { statsApi, type WatchHistoryEntry, type NowPlayingEntry } from '../api/index.ts'
import { moviePath } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Film, Tv2, PlayCircle, Library, Radio } from 'lucide-react'

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`
  if (secs < 3600) return `${Math.round(secs / 60)}m`
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function mediaLabel(movie: any, episode: any): string {
  if (movie) return movie.title
  if (episode) {
    return `${episode.show.title} S${String(episode.season.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`
  }
  return 'Unknown'
}

function mediaPoster(movie: any, episode: any): string | null {
  return movie?.posterPath ?? episode?.show?.posterPath ?? null
}

function historyLabel(entry: WatchHistoryEntry): string {
  return mediaLabel(entry.mediaFile.movie, entry.mediaFile.episode)
}

function historyPoster(entry: WatchHistoryEntry): string | null {
  return mediaPoster(entry.mediaFile.movie, entry.mediaFile.episode)
}

function ModeBadge({ mode, quality }: { mode: string; quality?: string }) {
  const isTranscode = mode === 'transcode'
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isTranscode ? 'bg-orange-500/20 text-orange-300' : 'bg-green-500/20 text-green-300'}`}>
      {isTranscode ? `Transcode ${quality && quality !== 'original' ? quality : ''}`.trim() : 'Direct Play'}
    </span>
  )
}

function NowPlayingCard({ session }: { session: NowPlayingEntry }) {
  const mf = session.mediaFile
  const movie = mf?.movie ?? null
  const episode = mf?.episode ?? null
  const poster = mediaPoster(movie, episode)
  const pct = session.duration > 0 ? (session.position / session.duration) * 100 : 0

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
      <div className="relative shrink-0">
        {poster ? (
          <img src={poster} alt="" className="w-10 h-14 object-cover rounded" />
        ) : (
          <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
            <PlayCircle className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{mediaLabel(movie, episode)}</div>
        <div className="text-xs text-muted-foreground">{session.userName}</div>
        <div className="flex items-center gap-2 mt-1">
          <ModeBadge mode={session.mode} quality={session.quality} />
          <span className="text-xs text-muted-foreground/60">
            {formatDuration(session.position)} / {formatDuration(session.duration)}
          </span>
        </div>
        <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-muted-foreground/40 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

function MiniBar({ data }: { data: Array<{ date: string; count: number }> }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <div className="flex items-end gap-[3px] h-16">
      {data.map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${d.count} play${d.count !== 1 ? 's' : ''}`}
          className="flex-1 bg-muted rounded-sm hover:bg-muted-foreground/30 transition-colors"
          style={{ height: `${Math.max((d.count / max) * 100, 4)}%` }}
        />
      ))}
    </div>
  )
}

export default function StatsPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: statsApi.get,
    refetchInterval: 10_000,  // live updates every 10s
  })

  if (isLoading || !data) {
    return <div className="p-8 text-muted-foreground">Loading statistics...</div>
  }

  const { library, totalPlays, nowPlaying, recentHistory, topMovies, topShows, playsByDay } = data

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold">Statistics</h1>

      {/* Now Playing */}
      {nowPlaying.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Radio className="h-4 w-4 text-green-400" />
              Now Playing
              <span className="text-xs font-normal text-muted-foreground/60">{nowPlaying.length} stream{nowPlaying.length !== 1 ? 's' : ''}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {nowPlaying.map((s) => (
              <NowPlayingCard key={`${s.userId}_${s.mediaFileId}`} session={s} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Library overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Movies', value: library.movies, icon: Film, color: 'text-blue-400' },
          { label: 'Shows', value: library.shows, icon: Tv2, color: 'text-purple-400' },
          { label: 'Episodes', value: library.episodes, icon: Library, color: 'text-green-400' },
          { label: 'Total Plays', value: totalPlays, icon: PlayCircle, color: 'text-yellow-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Icon className={`h-8 w-8 ${color}`} />
              <div>
                <div className="text-2xl font-bold">{value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Play activity chart */}
      {playsByDay.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Play Activity (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <MiniBar data={playsByDay} />
            <div className="flex justify-between text-xs text-muted-foreground/60 mt-1">
              <span>{playsByDay[0]?.date}</span>
              <span>{playsByDay[playsByDay.length - 1]?.date}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Movies */}
        {topMovies.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Most Watched Movies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topMovies.map(({ movie, playCount }) => (
                <div
                  key={movie.id}
                  className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded p-1 -mx-1 transition-colors"
                  onClick={() => navigate(moviePath(movie.title, movie.id))}
                >
                  {movie.posterPath ? (
                    <img src={movie.posterPath} alt={movie.title} className="w-8 h-12 object-cover rounded" />
                  ) : (
                    <div className="w-8 h-12 bg-muted rounded flex items-center justify-center">
                      <Film className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{movie.title}</div>
                    {movie.year && <div className="text-xs text-muted-foreground/60">{movie.year}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">{playCount} play{playCount !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Top Shows */}
        {topShows.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Most Watched Shows</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topShows.map(({ show, playCount }) => (
                <div
                  key={show.id}
                  className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded p-1 -mx-1 transition-colors"
                  onClick={() => navigate(`/shows/${show.id}`)}
                >
                  {show.posterPath ? (
                    <img src={show.posterPath} alt={show.title} className="w-8 h-12 object-cover rounded" />
                  ) : (
                    <div className="w-8 h-12 bg-muted rounded flex items-center justify-center">
                      <Tv2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{show.title}</div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">{playCount} play{playCount !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent play history */}
      {recentHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Recent Plays</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {recentHistory.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                {historyPoster(entry) ? (
                  <img src={historyPoster(entry)!} alt="" className="w-6 h-9 object-cover rounded shrink-0" />
                ) : (
                  <div className="w-6 h-9 bg-muted rounded shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{historyLabel(entry)}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground/70">{entry.user.name} · {formatDuration(entry.durationSec)}</span>
                    <ModeBadge mode={entry.mode} />
                    {entry.completed && <span className="text-xs text-green-400">✓ Completed</span>}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground/60 shrink-0">
                  {new Date(entry.watchedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {nowPlaying.length === 0 && recentHistory.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <PlayCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No watch history yet. Start playing something!</p>
        </div>
      )}
    </div>
  )
}

