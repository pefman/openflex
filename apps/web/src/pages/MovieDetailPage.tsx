import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { moviesApi, qualityApi, optimizationApi } from '../api/index.ts'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Play, Trash2, Zap } from 'lucide-react'
import ManualSearchDialog from '../components/ManualSearchDialog.tsx'

export default function MovieDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: movie, isLoading } = useQuery({
    queryKey: ['movies', id],
    queryFn: () => moviesApi.get(Number(id)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => moviesApi.remove(Number(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movies'] }); navigate('/movies') },
  })

  const toggleMonitor = useMutation({
    mutationFn: () => moviesApi.update(Number(id), { monitored: !movie?.monitored }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['movies', id] }),
  })

  const updateProfile = useMutation({
    mutationFn: (qualityProfileId: number | null) => moviesApi.update(Number(id), { qualityProfileId: qualityProfileId ?? undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['movies', id] }),
  })

  const { data: profiles = [] } = useQuery({ queryKey: ['quality-profiles'], queryFn: qualityApi.list })
  const { data: optProfiles = [] } = useQuery({ queryKey: ['optimization-profiles'], queryFn: optimizationApi.listProfiles })

  const setOptProfile = useMutation({
    mutationFn: (profileId: number | null) => optimizationApi.setMovieProfile(Number(id), profileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['movies', id] }),
  })

  const queueOptimize = useMutation({
    mutationFn: (mediaFileId: number) => optimizationApi.queueJobs([mediaFileId], movie!.optimizationProfileId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['optimization-jobs'] }),
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Failed to queue'),
  })

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
                <Button onClick={() => navigate(`/player/${movie.mediaFiles[0].id}`)}>
                  <Play className="h-4 w-4 mr-1.5" /> Play
                </Button>
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
              <ManualSearchDialog type="movie" movieId={Number(id)} label={movie.title} />
              <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate()}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Remove
              </Button>
            </div>

            {optProfiles.length > 0 && (
              <div className="flex items-center gap-2 mt-4">
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
              <div className="flex items-center gap-2 mt-4">
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
                  <div key={f.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-mono text-foreground/80 break-all">{f.path.split('/').pop()}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {f.resolution} · {f.codec} · {formatBytes(f.size)}
                        {f.duration ? ` · ${formatDuration(f.duration)}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => queueOptimize.mutate(f.id)} disabled={queueOptimize.isPending}>
                          <Zap className="h-3.5 w-3.5" />
                        </Button>
                      <Button size="sm" onClick={() => navigate(`/player/${f.id}`)}>
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
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
