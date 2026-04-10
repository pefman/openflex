import React from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { showsApi, qualityApi, optimizationApi } from '../api/index.ts'
import { slugify, cn } from '@/lib/utils'
import type { SeasonDto, EpisodeDto } from '@openflex/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Play, Trash2, Download, Loader2, Zap, CheckCheck } from 'lucide-react'
import ManualSearchDialog from '../components/ManualSearchDialog.tsx'

export default function ShowDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const defaultSeason = searchParams.get('season') ?? undefined
  const qc = useQueryClient()

  const { data: shows } = useQuery({ queryKey: ['shows'], queryFn: showsApi.list })
  const resolvedId = shows?.find((s) => slugify(s.title) === slug)?.id

  const { data: show, isLoading } = useQuery({
    queryKey: ['shows', String(resolvedId)],
    queryFn: () => showsApi.get(resolvedId!),
    enabled: resolvedId != null,
  })

  const deleteMutation = useMutation({
    mutationFn: () => showsApi.remove(resolvedId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shows'] }); navigate('/shows') },
  })

  const toggleMonitor = useMutation({
    mutationFn: () => showsApi.update(resolvedId!, { monitored: !show?.monitored }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows', String(resolvedId)] }),
  })

  const updateProfile = useMutation({
    mutationFn: (qualityProfileId: number | null) => showsApi.update(resolvedId!, { qualityProfileId: qualityProfileId ?? undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows', String(resolvedId)] }),
  })

  const { data: profiles = [] } = useQuery({ queryKey: ['quality-profiles'], queryFn: qualityApi.list })
  const { data: optProfiles = [] } = useQuery({ queryKey: ['optimization-profiles'], queryFn: optimizationApi.listProfiles })

  const setOptProfile = useMutation({
    mutationFn: (profileId: number | null) => optimizationApi.setShowProfile(resolvedId!, profileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows', String(resolvedId)] }),
  })

  const optimizeAll = useMutation({
    mutationFn: () => {
      const allFileIds = show!.seasons
        .flatMap((s) => s.episodes)
        .flatMap((e) => e.mediaFiles)
        .map((f) => f.id)
      return optimizationApi.queueJobs(allFileIds, show!.optimizationProfileId!)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['optimization-jobs'] }),
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Failed to queue'),
  })

  if (isLoading || (!show && resolvedId != null)) return (
    <div className="p-6 text-muted-foreground">Loading…</div>
  )
  if (!show) return <div className="p-6 text-destructive">Show not found</div>

  return (
    <div className="relative">
      {show.backdropPath && (
        <div className="absolute inset-0 h-80 overflow-hidden">
          <img src={show.backdropPath} alt="" className="w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
        </div>
      )}

      <div className="relative p-6 pt-16">
        <div className="flex gap-6">
          <div className="flex-shrink-0">
            {show.posterPath ? (
              <img src={show.posterPath} alt={show.title} className="w-40 rounded-xl shadow-2xl" />
            ) : (
              <div className="w-40 aspect-[2/3] bg-muted rounded-xl flex items-center justify-center text-muted-foreground text-sm">No Poster</div>
            )}
          </div>

          <div className="flex-1 pt-8">
            <h1 className="text-3xl font-bold">{show.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`badge-${show.status}`}>{show.status}</span>
              <span className="text-sm text-muted-foreground">{show.seasons.length} seasons</span>
            </div>
            {show.genres.length > 0 && (
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {show.genres.map((g) => (
                  <Badge key={g} variant="secondary">{g}</Badge>
                ))}
              </div>
            )}
            {show.overview && <p className="mt-4 text-muted-foreground text-sm leading-relaxed max-w-2xl">{show.overview}</p>}

            <div className="flex items-center gap-6 mt-6 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  id="show-monitor"
                  checked={show.monitored}
                  onCheckedChange={() => toggleMonitor.mutate()}
                  disabled={toggleMonitor.isPending}
                />
                <Label htmlFor="show-monitor">Monitor</Label>
              </div>
              <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate()}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Remove
              </Button>
              <AutoGrabShowButton showId={resolvedId!} />
              {show.optimizationProfileId && (
                <Button variant="outline" size="sm" onClick={() => optimizeAll.mutate()} disabled={optimizeAll.isPending}>
                  {optimizeAll.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCheck className="h-4 w-4 mr-1.5" />}
                  Optimize All
                </Button>
              )}
            </div>

            {optProfiles.length > 0 && (
              <div className="flex items-center gap-2 mt-4">
                <Zap size={14} className="text-muted-foreground shrink-0" />
                <Label className="text-muted-foreground text-sm shrink-0">Optimization</Label>
                <Select
                  value={show.optimizationProfileId ? String(show.optimizationProfileId) : 'none'}
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
                  value={show.qualityProfileId ? String(show.qualityProfileId) : 'any'}
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

        {/* Seasons */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Seasons</h2>
          <Accordion type="single" collapsible defaultValue={defaultSeason} className="space-y-2">
            {show.seasons.map((season) => (
              <SeasonAccordionItem
                key={season.id}
                season={season}
                showId={show.id}
                optimizationProfileId={show.optimizationProfileId}
                onPlay={(mediaFileId) => navigate(`/player/${mediaFileId}`)}
              />
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  )
}

function AutoGrabShowButton({ showId }: { showId: number }) {
  const qc = useQueryClient()
  const [result, setResult] = React.useState<string | null>(null)
  const mut = useMutation({
    mutationFn: () => showsApi.autoGrabShow(showId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['downloads'] })
      setResult(`${data.grabbed}/${data.total} queued`)
      setTimeout(() => setResult(null), 3000)
    },
  })
  return (
    <Button variant="secondary" size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
      {mut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
      {result ?? 'Download All'}
    </Button>
  )
}

function SeasonAccordionItem({
  season, showId, optimizationProfileId, onPlay,
}: {
  season: SeasonDto
  showId: number
  optimizationProfileId: number | null
  onPlay: (id: number) => void
}) {
  const qc = useQueryClient()
  const downloaded = season.episodes.filter((e) => e.status === 'downloaded').length
  const allMonitored = season.episodes.length > 0 && season.episodes.every((e) => e.monitored)

  const toggleSeasonMonitor = useMutation({
    mutationFn: (monitored: boolean) => showsApi.updateSeason(showId, season.id, { monitored }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows', String(showId)] }),
  })

  const deleteSeasonFiles = useMutation({
    mutationFn: () => showsApi.deleteSeasonFiles(showId, season.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows', String(showId)] }),
  })

  const optimizeSeason = useMutation({
    mutationFn: () => {
      const fileIds = season.episodes.flatMap((e) => e.mediaFiles).map((f) => f.id)
      return optimizationApi.queueJobs(fileIds, optimizationProfileId!)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['optimization-jobs'] }),
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Failed to queue'),
  })

  return (
    <AccordionItem value={String(season.seasonNumber)} className="border border-border rounded-lg overflow-hidden bg-card">
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
        <div className="flex items-center gap-3 flex-1 mr-2">
          {season.posterPath && (
            <img
              src={season.posterPath}
              alt=""
              className="w-8 h-11 object-cover rounded"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          )}
          <div className="text-left flex-1">
            <p className="font-medium text-sm">Season {season.seasonNumber}</p>
            <p className="text-xs text-muted-foreground">{downloaded}/{season.episodes.length} episodes</p>
          </div>
          <div
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <AutoGrabSeasonButton showId={showId} season={season} />
            {downloaded > 0 && optimizationProfileId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                title="Optimize all downloaded episodes in this season"
                disabled={optimizeSeason.isPending}
                onClick={() => optimizeSeason.mutate()}
              >
                {optimizeSeason.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}
                Optimize
              </Button>
            )}
            {downloaded > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                title="Remove all downloaded files for this season"
                disabled={deleteSeasonFiles.isPending}
                onClick={() => deleteSeasonFiles.mutate()}
              >
                {deleteSeasonFiles.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                Remove Files
              </Button>
            )}
            <Label className="text-xs text-muted-foreground cursor-pointer" onClick={() => toggleSeasonMonitor.mutate(!allMonitored)}>
              Monitor
            </Label>
            <Switch
              checked={allMonitored}
              onCheckedChange={(v) => toggleSeasonMonitor.mutate(v)}
              disabled={toggleSeasonMonitor.isPending}
              className="scale-75 origin-right"
            />
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="p-0">
        <div className="divide-y divide-border">
          {season.episodes.map((ep) => (
            <EpisodeRow key={ep.id} episode={ep} showId={showId} optimizationProfileId={optimizationProfileId} onPlay={onPlay} />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

function AutoGrabSeasonButton({ showId, season }: { showId: number; season: SeasonDto }) {
  const qc = useQueryClient()
  const [result, setResult] = React.useState<string | null>(null)
  const mut = useMutation({
    mutationFn: () => showsApi.autoGrabSeason(showId, season.id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['downloads'] })
      setResult(`${data.grabbed}/${data.total}`)
      setTimeout(() => setResult(null), 3000)
    },
  })
  return (
    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => mut.mutate()} disabled={mut.isPending}>
      {mut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
      {result ?? 'Download'}
    </Button>
  )
}

function EpisodeRow({ episode, showId, optimizationProfileId, onPlay }: { episode: EpisodeDto; showId: number; optimizationProfileId: number | null; onPlay: (id: number) => void }) {
  const qc = useQueryClient()

  const queueOptimize = useMutation({
    mutationFn: () => optimizationApi.queueJobs([episode.mediaFiles[0].id], optimizationProfileId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['optimization-jobs'] }),
    onError: (e: any) => alert(e?.response?.data?.error ?? 'Failed to queue'),
  })

  const toggleMonitor = useMutation({
    mutationFn: () => showsApi.updateEpisode(showId, episode.id, { monitored: !episode.monitored }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows', String(showId)] }),
  })

  const autoGrab = useMutation({
    mutationFn: () => showsApi.autoGrabEpisode(showId, episode.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['downloads'] }),
  })

  const deleteFile = useMutation({
    mutationFn: () => showsApi.deleteEpisodeFile(showId, episode.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows', String(showId)] }),
  })

  const hasFile = episode.mediaFiles.length > 0
  const isGrabbable = !hasFile && episode.status !== 'downloading'

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors">
      <span className="text-xs text-muted-foreground w-8 text-right shrink-0">E{episode.episodeNumber}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{episode.title ?? `Episode ${episode.episodeNumber}`}</p>
        {episode.airDate && <p className="text-xs text-muted-foreground">{episode.airDate}</p>}
      </div>
      <span className={cn('shrink-0', `badge-${episode.status}`)}>{episode.status}</span>
      <Switch
        checked={episode.monitored}
        onCheckedChange={() => toggleMonitor.mutate()}
        disabled={toggleMonitor.isPending}
        className="shrink-0 scale-75 origin-right"
      />
      {isGrabbable && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          title="Auto-download"
          disabled={autoGrab.isPending}
          onClick={() => autoGrab.mutate()}
        >
          {autoGrab.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </Button>
      )}
      {hasFile && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
          title="Remove file"
          disabled={deleteFile.isPending}
          onClick={() => deleteFile.mutate()}
        >
          {deleteFile.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      )}
      <ManualSearchDialog type="episode" showId={showId} episodeId={episode.id} />
      {hasFile && optimizationProfileId && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          title="Optimize"
          disabled={queueOptimize.isPending}
          onClick={() => queueOptimize.mutate()}
        >
          {queueOptimize.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
        </Button>
      )}
      {hasFile && (
        <Button size="sm" className="h-7 px-2 shrink-0" onClick={() => onPlay(episode.mediaFiles[0].id)}>
          <Play className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
