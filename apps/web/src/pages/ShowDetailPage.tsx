import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { showsApi, qualityApi } from '../api/index.ts'
import { slugify, cn } from '@/lib/utils'
import type { SeasonDto, EpisodeDto } from '@openflex/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Play, Trash2 } from 'lucide-react'
import ManualSearchDialog from '../components/ManualSearchDialog.tsx'

export default function ShowDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
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
            </div>

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
          <Accordion type="single" collapsible className="space-y-2">
            {show.seasons.map((season) => (
              <SeasonAccordionItem
                key={season.id}
                season={season}
                showId={show.id}
                onPlay={(mediaFileId) => navigate(`/player/${mediaFileId}`)}
              />
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  )
}

function SeasonAccordionItem({
  season, showId, onPlay,
}: {
  season: SeasonDto
  showId: number
  onPlay: (id: number) => void
}) {
  const qc = useQueryClient()
  const downloaded = season.episodes.filter((e) => e.status === 'downloaded').length
  const allMonitored = season.episodes.length > 0 && season.episodes.every((e) => e.monitored)

  const toggleSeasonMonitor = useMutation({
    mutationFn: (monitored: boolean) => showsApi.updateSeason(showId, season.id, { monitored }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows', String(showId)] }),
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
            <EpisodeRow key={ep.id} episode={ep} showId={showId} onPlay={onPlay} />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

function EpisodeRow({ episode, showId, onPlay }: { episode: EpisodeDto; showId: number; onPlay: (id: number) => void }) {
  const qc = useQueryClient()

  const toggleMonitor = useMutation({
    mutationFn: () => showsApi.updateEpisode(showId, episode.id, { monitored: !episode.monitored }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shows', String(showId)] }),
  })

  const hasFile = episode.mediaFiles.length > 0

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
      <ManualSearchDialog type="episode" showId={showId} episodeId={episode.id} />
      {hasFile && (
        <Button size="sm" className="h-7 px-2 shrink-0" onClick={() => onPlay(episode.mediaFiles[0].id)}>
          <Play className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
