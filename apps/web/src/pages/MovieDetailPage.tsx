import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { moviesApi, qualityApi, optimizationApi, ratingsApi, watchlistApi } from '../api/index.ts'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn, playerPath } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Play, Trash2, Zap, ChevronDown, ChevronRight, BookMarked, Bookmark, Loader2, RefreshCw, ScanSearch } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import ManualSearchDialog from '../components/ManualSearchDialog.tsx'
import ExternalPlayerMenu from '../components/ExternalPlayerMenu.tsx'
import StarRating from '../components/StarRating.tsx'

export default function MovieDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [confirmRemove, setConfirmRemove] = React.useState(false)
  const [confirmRemoveFiles, setConfirmRemoveFiles] = React.useState(false)

  const movieId = React.useMemo(() => {
    if (!slug) return NaN
    if (/^\d+$/.test(slug)) return Number(slug)
    const match = slug.match(/-(\d+)$/)
    return match ? Number(match[1]) : NaN
  }, [slug])

  const validMovieId = Number.isFinite(movieId)

  const { data: movie, isLoading } = useQuery({
    queryKey: ['movies', String(movieId)],
    queryFn: () => moviesApi.get(movieId),
    enabled: validMovieId,
  })

  const deleteMutation = useMutation({
    mutationFn: () => moviesApi.remove(movieId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movies'] }); navigate('/movies'); toast.success('Movie removed') },
  })

  const deleteFilesMutation = useMutation({
    mutationFn: () => moviesApi.removeFiles(movieId),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['movies'] })
      qc.invalidateQueries({ queryKey: ['movies', String(movieId)] })
      setConfirmRemoveFiles(false)
      toast.success(`Removed ${r.removedFiles} file(s)`)
    },
  })

  const toggleMonitor = useMutation({
    mutationFn: () => moviesApi.update(movieId, { monitored: !movie?.monitored }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['movies', String(movieId)] }),
  })

  const updateProfile = useMutation({
    mutationFn: (qualityProfileId: number | null) => moviesApi.update(movieId, { qualityProfileId: qualityProfileId ?? undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['movies', String(movieId)] }),
  })

  const { data: profiles = [] } = useQuery({ queryKey: ['quality-profiles'], queryFn: qualityApi.list })
  const { data: optProfiles = [] } = useQuery({ queryKey: ['optimization-profiles'], queryFn: optimizationApi.listProfiles })
  const { data: ratings } = useQuery({ queryKey: ['ratings'], queryFn: ratingsApi.get })
  const { data: watchlist = [] } = useQuery({ queryKey: ['watchlist'], queryFn: watchlistApi.list })

  const myRating = ratings?.movies[movieId] ?? 0
  const isWatchlisted = watchlist.some(w => w.movie?.id === movieId)

  const rateMutation = useMutation({
    mutationFn: (rating: number) => ratingsApi.rateMovie(movieId, rating),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ratings'] }),
    onError: () => toast.error('Failed to rate'),
  })

  const toggleWatchlistMutation = useMutation({
    mutationFn: () => isWatchlisted ? watchlistApi.removeMovie(movieId) : watchlistApi.addMovie(movieId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['watchlist'] }); toast.success(isWatchlisted ? 'Removed from watchlist' : 'Added to watchlist') },
  })

  const setOptProfile = useMutation({
    mutationFn: (profileId: number | null) => optimizationApi.setMovieProfile(movieId, profileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['movies', String(movieId)] }),
  })

  const queueOptimize = useMutation({
    mutationFn: ({ mediaFileId, profileId }: { mediaFileId: number; profileId: number }) => optimizationApi.queueJobs([mediaFileId], profileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['optimization-jobs'] }),
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Failed to queue'),
  })

  const reprobeMutation = useMutation({
    mutationFn: () => moviesApi.reprobe(movieId),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['movies', String(movieId)] }); toast.success(`Re-probed ${r.updated}/${r.total} files`) },
    onError: () => toast.error('Re-probe failed'),
  })

  if (!validMovieId) return <div className="p-6 text-destructive">Invalid movie URL</div>
  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>
  if (!movie) return <div className="p-6 text-destructive">Movie not found</div>

  const hasFiles = movie.mediaFiles.length > 0

  return (
    <div className="relative">
      {movie.backdropPath && (
        <div className="absolute inset-0 h-80 overflow-hidden">
          <img src={movie.backdropPath} alt="" className="w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
        </div>
      )}

      <div className="relative p-6 pt-16">
        <div className="flex gap-6">
          <div className="flex-shrink-0">
            {movie.posterPath ? (
              <img src={movie.posterPath} alt={movie.title} className="w-40 rounded-xl shadow-2xl" />
            ) : (
              <div className="w-40 aspect-[2/3] bg-muted rounded-xl flex items-center justify-center text-muted-foreground text-sm">No Poster</div>
            )}
          </div>

          <div className="flex-1 pt-8">
            <h1 className="text-3xl font-bold">{movie.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {movie.year && <span className="text-muted-foreground">{movie.year}</span>}
              {movie.runtime && <span className="text-muted-foreground">{movie.runtime} min</span>}
              {movie.rating && <span className="text-yellow-400">★ {movie.rating.toFixed(1)}</span>}
              <span className={`badge-${movie.status}`}>{movie.status}</span>
            </div>

            {movie.genres.length > 0 && (
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {movie.genres.map((g) => (
                  <Badge key={g} variant="secondary">{g}</Badge>
                ))}
              </div>
            )}

            {movie.overview && <p className="mt-4 text-muted-foreground text-sm leading-relaxed max-w-2xl">{movie.overview}</p>}

            <div className="flex items-center gap-6 mt-6 flex-wrap">
              {hasFiles && (
                <div className="flex items-center gap-2">
                  <Button onClick={() => navigate(playerPath(movie.title, movie.mediaFiles[0].id))}>
                    <Play className="h-4 w-4 mr-1.5" /> Play
                  </Button>
                  <ExternalPlayerMenu mediaFileId={movie.mediaFiles[0].id} size="default" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  id="movie-monitor"
                  checked={movie.monitored}
                  onCheckedChange={() => toggleMonitor.mutate()}
                  disabled={toggleMonitor.isPending}
                />
                <Label htmlFor="movie-monitor">Monitor</Label>
              </div>
              <Button
                variant={isWatchlisted ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => toggleWatchlistMutation.mutate()}
                disabled={toggleWatchlistMutation.isPending}
              >
                {isWatchlisted ? <BookMarked className="h-4 w-4 mr-1.5" /> : <Bookmark className="h-4 w-4 mr-1.5" />}
                {isWatchlisted ? 'Watchlisted' : 'Watchlist'}
              </Button>
              <StarRating rating={myRating} onRate={(r) => rateMutation.mutate(r)} />
              <ManualSearchDialog type="movie" movieId={movieId} label={movie.title} />
              {confirmRemoveFiles ? (
                <div className="flex items-center gap-1">
                  <span className="text-sm text-amber-500">Remove files?</span>
                  <Button variant="outline" size="sm" onClick={() => deleteFilesMutation.mutate()} disabled={deleteFilesMutation.isPending}>Yes</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmRemoveFiles(false)}>Cancel</Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirmRemoveFiles(true)} disabled={!hasFiles}>
                  <Trash2 className="h-4 w-4 mr-1.5" /> Remove Files
                </Button>
              )}
              {confirmRemove ? (
                <div className="flex items-center gap-1">
                  <span className="text-sm text-destructive">Remove?</span>
                  <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate()}>Yes</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>Cancel</Button>
                </div>
              ) : (
                <Button variant="destructive" size="sm" onClick={() => setConfirmRemove(true)}>
                  <Trash2 className="h-4 w-4 mr-1.5" /> Remove
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => reprobeMutation.mutate()} disabled={reprobeMutation.isPending}>
                {reprobeMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ScanSearch className="h-4 w-4 mr-1.5" />}
                Re-probe Files
              </Button>
            </div>

            {(optProfiles.length > 0 || profiles.length > 0) && (
              <Separator className="mt-5 mb-1" />
            )}
            {(optProfiles.length > 0 || profiles.length > 0) && (
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 mt-3 mb-2">Library settings</p>
            )}
            {optProfiles.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <Zap size={14} className="text-muted-foreground shrink-0" />
                <Label className="text-muted-foreground text-sm shrink-0">Optimization</Label>
                <Select
                  value={movie.optimizationProfileId ? String(movie.optimizationProfileId) : 'none'}
                  onValueChange={(v) => setOptProfile.mutate(v === 'none' ? null : Number(v))}
                >
                  <SelectTrigger className="w-48 h-8 text-sm">
                    <SelectValue placeholder="No profile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No profile</SelectItem>
                    {optProfiles.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {profiles.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <Label className="text-muted-foreground text-sm shrink-0">Quality profile</Label>
                <Select
                  value={movie.qualityProfileId ? String(movie.qualityProfileId) : 'any'}
                  onValueChange={(v) => updateProfile.mutate(v === 'any' ? null : Number(v))}
                >
                  <SelectTrigger className="w-48 h-8 text-sm">
                    <SelectValue />
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
          </div>
        </div>

        {hasFiles && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-3">Files</h2>
            <Card>
              <CardContent className="p-0 divide-y divide-border">
                {movie.mediaFiles.map((f) => (
                  <FileRow
                    key={f.id}
                    movieId={movie.id}
                    f={f}
                    onOptimize={(profileId) => queueOptimize.mutate({ mediaFileId: f.id, profileId })}
                    optPending={queueOptimize.isPending}
                    onPlay={() => navigate(playerPath(movie.title, f.id))}
                    mediaFileId={f.id}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function formatBytes(b: number): string {
  if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function channelLabel(ch: number): string {
  if (ch === 1) return 'Mono (1.0)'
  if (ch === 2) return 'Stereo (2.0)'
  if (ch === 6) return 'Surround (5.1)'
  if (ch === 8) return 'Surround (7.1)'
  return `${ch} ch`
}

function FileRow({ movieId, f, onOptimize, optPending, onPlay, mediaFileId }: {
  movieId: number
  f: { id: number; path: string; resolution?: string | null; codec?: string | null; size: number; duration?: number | null }
  onOptimize: (profileId: number) => void
  optPending: boolean
  onPlay: () => void
  mediaFileId: number
}) {
  const { data: fileOptProfiles = [] } = useQuery({ queryKey: ['optimization-profiles'], queryFn: optimizationApi.listProfiles })
  const [showFullPath, setShowFullPath] = React.useState(false)
  const qc = useQueryClient()
  const removeFile = useMutation({
    mutationFn: () => moviesApi.removeFile(movieId, f.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movies', String(movieId)] })
      qc.invalidateQueries({ queryKey: ['movies'] })
      toast.success('File removed')
    },
    onError: () => toast.error('Failed to remove file'),
  })
  const filename = f.path.split('/').pop() ?? f.path
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <button
          type="button"
          className="flex items-center gap-1 group text-left"
          onClick={() => setShowFullPath((v) => !v)}
          title={showFullPath ? 'Hide full path' : 'Show full path'}
        >
          {showFullPath ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          <p className="text-sm font-mono text-foreground/80 break-all group-hover:text-foreground">
            {showFullPath ? f.path : filename}
          </p>
        </button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 ml-4">
          <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
          {f.codec && <span className="text-xs text-muted-foreground">{f.codec.toUpperCase()}</span>}
          {f.resolution && <span className="text-xs text-muted-foreground">{f.resolution}</span>}
          {(f as any).audioCodec && <span className="text-xs text-muted-foreground">{String((f as any).audioCodec).toUpperCase()}</span>}
          {(f as any).audioChannels ? <span className="text-xs text-muted-foreground">{channelLabel(Number((f as any).audioChannels))}</span> : null}
          {f.duration ? <span className="text-xs text-muted-foreground">{formatDuration(f.duration)}</span> : null}
        </div>
      </div>

      <span className={cn('shrink-0', 'badge-downloaded')}>downloaded</span>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
        title="Remove file"
        disabled={removeFile.isPending}
        onClick={() => removeFile.mutate()}
      >
        {removeFile.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </Button>

      <div className="shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Optimize" disabled={optPending}>
              {optPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {fileOptProfiles.length === 0 && <DropdownMenuItem disabled>No profiles</DropdownMenuItem>}
            {fileOptProfiles.map((p) => (
              <DropdownMenuItem key={p.id} onClick={() => onOptimize(p.id)}>{p.name}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button size="sm" className="h-7 px-2 shrink-0" onClick={onPlay}>
          <Play className="h-3.5 w-3.5" />
      </Button>
      <ExternalPlayerMenu mediaFileId={mediaFileId} />
    </div>
  )
}
