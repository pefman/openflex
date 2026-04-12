import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { optimizationApi, type OptimizationProfile, type OptimizationJob } from '../api/index.ts'
import { formatBytes } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Zap, Pencil, Trash2, Plus, X } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-gray-500/20 text-gray-400',
  running: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-yellow-500/20 text-yellow-500',
}

const VIDEO_MODE_LABELS: Record<string, string> = {
  copy_always: 'Always copy video',
  copy_compatible: 'Copy if already target codec',
  reencode: 'Always re-encode',
}

// ─── Profile form ─────────────────────────────────────────────────────────────

type ProfileFormData = Omit<OptimizationProfile, 'id' | 'createdAt'>

const DEFAULT_FORM: ProfileFormData = {
  name: '',
  videoMode: 'copy_compatible',
  videoCodec: 'h264',
  videoCrf: 23,
  videoPreset: 'fast',
  audioMode: 'reencode',
  audioChannels: 2,
  audioBitrate: 128,
  useHwEncoder: true,
  applyToNew: false,
}

function ProfileForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: ProfileFormData
  onSave: (data: ProfileFormData) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<ProfileFormData>(initial)
  const set = <K extends keyof ProfileFormData>(k: K, v: ProfileFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial.name ? 'Edit Profile' : 'New Profile'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Name</span>
            <Input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Profile name"
            />
          </label>

          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Video</p>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Mode</span>
              <Select value={form.videoMode} onValueChange={v => set('videoMode', v as ProfileFormData['videoMode'])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="copy_always">Always copy (fastest, no re-encode)</SelectItem>
                  <SelectItem value="copy_compatible">Copy if already target codec</SelectItem>
                  <SelectItem value="reencode">Always re-encode</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {form.videoMode !== 'copy_always' && (
              <>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Target codec</span>
                  <Select value={form.videoCodec} onValueChange={v => set('videoCodec', v as 'h264' | 'hevc')}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="h264">H.264 (best compatibility)</SelectItem>
                      <SelectItem value="hevc">H.265 / HEVC (smaller files)</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Quality (CRF/CQ)</span>
                  <Input type="number" min={0} max={51}
                    value={form.videoCrf} onChange={e => set('videoCrf', Number(e.target.value))} />
                  <p className="text-xs text-muted-foreground/60">Lower = higher quality, larger file. Typical: 18–28</p>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Preset</span>
                  <Select value={form.videoPreset} onValueChange={v => set('videoPreset', v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ultrafast">ultrafast (fastest encode)</SelectItem>
                      <SelectItem value="superfast">superfast</SelectItem>
                      <SelectItem value="veryfast">veryfast</SelectItem>
                      <SelectItem value="faster">faster</SelectItem>
                      <SelectItem value="fast">fast</SelectItem>
                      <SelectItem value="medium">medium (balanced)</SelectItem>
                      <SelectItem value="slow">slow (best compression)</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.useHwEncoder}
                    onChange={e => set('useHwEncoder', e.target.checked)} />
                  Use GPU encoder (NVENC / QSV / VA-API)
                </label>
              </>
            )}
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audio</p>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Mode</span>
              <Select value={form.audioMode} onValueChange={v => set('audioMode', v as 'copy' | 'reencode')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="copy">Copy audio (no re-encode)</SelectItem>
                  <SelectItem value="reencode">Re-encode/downmix to AAC target channels</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {form.audioMode === 'reencode' && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Channels</span>
                  <Select value={String(form.audioChannels)} onValueChange={v => set('audioChannels', Number(v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">Stereo (2.0)</SelectItem>
                      <SelectItem value="6">5.1 Surround</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Bitrate (kbps)</span>
                  <Select value={String(form.audioBitrate)} onValueChange={v => set('audioBitrate', Number(v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[96, 128, 160, 192, 256, 320].map(b => <SelectItem key={b} value={String(b)}>{b}k</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.applyToNew}
                onChange={e => set('applyToNew', e.target.checked)} />
              Auto-apply to new downloads (when assigned to a show/movie)
            </label>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={!form.name.trim() || saving} onClick={() => onSave(form)}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Profiles tab ─────────────────────────────────────────────────────────────

function ProfilesTab() {
  const qc = useQueryClient()
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['optimization-profiles'],
    queryFn: optimizationApi.listProfiles,
  })

  const [editTarget, setEditTarget] = useState<OptimizationProfile | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const createMut = useMutation({
    mutationFn: (data: ProfileFormData) => optimizationApi.createProfile(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['optimization-profiles'] }); setCreating(false); toast.success('Profile created') },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ProfileFormData }) => optimizationApi.updateProfile(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['optimization-profiles'] }); setEditTarget(null); toast.success('Profile updated') },
  })
  const deleteMut = useMutation({
    mutationFn: optimizationApi.deleteProfile,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['optimization-profiles'] }); toast.success('Profile deleted') },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Delete failed'),
  })

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}><Plus size={14} className="mr-1" /> New Profile</Button>
      </div>

      {profiles.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No profiles yet</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {profiles.map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  {p.applyToNew && (
                    <Badge className="mt-1 text-xs bg-primary/20 text-primary border-0">Auto-apply to new</Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditTarget(p)} className="text-muted-foreground hover:text-foreground p-1">
                    <Pencil size={14} />
                  </button>
                  {confirmDeleteId === p.id ? (
                    <>
                      <button onClick={() => { deleteMut.mutate(p.id); setConfirmDeleteId(null) }} className="text-destructive hover:text-destructive/80 p-1 text-xs font-medium">
                        Yes
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-muted-foreground hover:text-foreground p-1 text-xs">
                        No
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(p.id)} className="text-muted-foreground hover:text-destructive p-1">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <div>Video: <span className="text-foreground">{VIDEO_MODE_LABELS[p.videoMode]}</span></div>
              {p.videoMode !== 'copy_always' && (
                <div>Codec: <span className="text-foreground">{p.videoCodec.toUpperCase()} · CRF {p.videoCrf} · {p.videoPreset}</span>{p.useHwEncoder && <span className="ml-1 text-blue-400">(GPU)</span>}</div>
              )}
              <div>Audio: <span className="text-foreground">
                {p.audioMode === 'copy' ? 'Copy' : `AAC ${p.audioBitrate}k ${p.audioChannels === 2 ? 'Stereo' : `${p.audioChannels}ch`}`}
              </span></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {creating && (
        <ProfileForm
          initial={DEFAULT_FORM}
          onSave={(data) => createMut.mutate(data)}
          onCancel={() => setCreating(false)}
          saving={createMut.isPending}
        />
      )}
      {editTarget && (
        <ProfileForm
          initial={editTarget}
          onSave={(data) => updateMut.mutate({ id: editTarget.id, data })}
          onCancel={() => setEditTarget(null)}
          saving={updateMut.isPending}
        />
      )}
    </div>
  )
}

// ─── Queue tab ────────────────────────────────────────────────────────────────

function QueueTab() {
  const qc = useQueryClient()
  const { data: jobs = [] } = useQuery({
    queryKey: ['optimization-jobs'],
    queryFn: () => optimizationApi.listJobs({ limit: 200 }),
    refetchInterval: 2000,
  })

  const cancelMut = useMutation({
    mutationFn: optimizationApi.cancelJob,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['optimization-jobs'] }),
  })
  const clearMut = useMutation({
    mutationFn: optimizationApi.clearJobs,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['optimization-jobs'] }),
  })

  const hasFinished = jobs.some((j) => ['completed', 'failed', 'cancelled'].includes(j.status))

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {hasFinished && (
          <Button variant="outline" size="sm" onClick={() => clearMut.mutate()}>
            Clear finished
          </Button>
        )}
      </div>

      {jobs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No optimization jobs</div>
      )}

      <div className="space-y-2">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} onCancel={() => cancelMut.mutate(job.id)} />
        ))}
      </div>
    </div>
  )
}

function JobRow({ job, onCancel }: { job: OptimizationJob; onCancel: () => void }) {
  const sizeDiff = job.originalSize != null && job.optimizedSize != null
    ? job.originalSize - job.optimizedSize
    : null

  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{basename(job.mediaFile.path)}</p>
        <p className="text-xs text-muted-foreground">{job.profile.name}</p>
      </div>

      {job.status === 'running' && (
        <div className="w-32 space-y-1">
          <Progress value={job.progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground text-right">{job.progress.toFixed(0)}%</p>
        </div>
      )}

      {sizeDiff != null && (
        <div className="text-xs text-right text-muted-foreground w-28">
          <span className={sizeDiff > 0 ? 'text-green-400' : 'text-red-400'}>
            {sizeDiff > 0 ? '−' : '+'}{formatBytes(Math.abs(sizeDiff))}
            {sizeDiff > 0 && job.originalSize ? ` (${Math.round((sizeDiff / job.originalSize) * 100)}% saved)` : ''}
          </span>
          <br />
          <span>{formatBytes(job.optimizedSize!)} final</span>
        </div>
      )}

      {job.error && (
        <p className="text-xs text-destructive max-w-[180px] truncate" title={job.error}>{job.error}</p>
      )}

      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[job.status] ?? ''}`}>
        {job.status}
      </span>

      {(job.status === 'queued' || job.status === 'running') && (
        <button onClick={onCancel} className="text-muted-foreground hover:text-destructive">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = ['Profiles', 'Queue'] as const
type Tab = typeof TABS[number]

export default function OptimizationPage() {
  const [tab, setTab] = useState<Tab>('Profiles')

  const { data: jobs = [] } = useQuery({
    queryKey: ['optimization-jobs'],
    queryFn: () => optimizationApi.listJobs({ limit: 200 }),
    refetchInterval: 5000,
  })

  const activeCount = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Zap size={24} className="text-primary" />
        <h1 className="text-2xl font-bold">Optimization</h1>
        {activeCount > 0 && (
          <Badge className="bg-blue-500/20 text-blue-400 border-0">{activeCount} active</Badge>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
            {t === 'Queue' && activeCount > 0 && (
              <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">{activeCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'Profiles' && <ProfilesTab />}
      {tab === 'Queue' && <QueueTab />}
    </div>
  )
}
