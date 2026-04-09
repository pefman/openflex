import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qualityApi, settingsApi } from '../../api/index.ts'
import type { QualityProfileDto, CreateQualityProfileRequest } from '@openflex/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Plus, Trash2, Loader2, X, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function QualitySettings() {
  const qc = useQueryClient()
  const { data: profiles = [] } = useQuery({ queryKey: ['quality-profiles'], queryFn: qualityApi.list })
  const [showForm, setShowForm] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: qualityApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quality-profiles'] }),
  })

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Quality Profiles</h2>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Profile
        </Button>
      </div>

      {profiles.length === 0 ? (
        <p className="text-muted-foreground text-sm">No quality profiles. The scheduler will grab any quality if none is set.</p>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Min score: {p.minScore} · Upgrade: {p.upgradeAllowed ? 'yes' : 'no'}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(p.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <QualityForm open={showForm} onClose={() => setShowForm(false)} />

      <KeywordFilters />
    </div>
  )
}

function QualityForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [minScore, setMinScore] = useState(50)
  const [upgradeAllowed, setUpgradeAllowed] = useState(true)

  const createMutation = useMutation({
    mutationFn: qualityApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quality-profiles'] }); onClose() },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ name, items: [], minScore, upgradeAllowed })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Quality Profile</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Profile name</Label>
            <Input placeholder="e.g. HD-1080p" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>
              Minimum score <span className="text-muted-foreground text-xs">(0–100)</span>
            </Label>
            <Input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">720p=60 · 1080p=80 · 4K=100 · BluRay bonus: +15</p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="upgrade-allowed"
              checked={upgradeAllowed}
              onCheckedChange={setUpgradeAllowed}
            />
            <Label htmlFor="upgrade-allowed">Upgrade when better quality found</Label>
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Add Profile
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const PREFERRED_PRESETS = ['BluRay', 'REMUX', '2160p', '4K', '1080p', 'x265', 'PROPER', 'REPACK']
const REJECTED_PRESETS = ['NUKED', 'CAM', 'HDCAM', 'HDTS', 'TELESYNC', 'SAMPLE', 'PASSWORDED', 'INCOMPLETE']

function KeywordFilters() {
  const qc = useQueryClient()
  const { data: settings = {} } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })

  const [preferred, setPreferred] = useState<string[]>([])
  const [rejected, setRejected] = useState<string[]>([])
  const [prefInput, setPrefInput] = useState('')
  const [rejInput, setRejInput] = useState('')
  const [saved, setSaved] = useState(false)
  const prefRef = useRef<HTMLInputElement>(null)
  const rejRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (settings.PREFERRED_KEYWORDS) setPreferred(JSON.parse(settings.PREFERRED_KEYWORDS))
    if (settings.REJECTED_KEYWORDS) setRejected(JSON.parse(settings.REJECTED_KEYWORDS))
  }, [settings.PREFERRED_KEYWORDS, settings.REJECTED_KEYWORDS])

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => settingsApi.set(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  function addKeyword(list: 'preferred' | 'rejected', value: string) {
    const kw = value.trim()
    if (!kw) return
    if (list === 'preferred') {
      if (!preferred.includes(kw)) setPreferred((p) => [...p, kw])
      setPrefInput('')
    } else {
      if (!rejected.includes(kw)) setRejected((r) => [...r, kw])
      setRejInput('')
    }
  }

  function handleKeyDown(list: 'preferred' | 'rejected', e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addKeyword(list, list === 'preferred' ? prefInput : rejInput)
    }
  }

  function save() {
    saveMutation.mutate({
      PREFERRED_KEYWORDS: JSON.stringify(preferred),
      REJECTED_KEYWORDS: JSON.stringify(rejected),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Keyword Filters</CardTitle>
        <CardDescription>
          Releases matching a rejected keyword score 0 and are excluded from auto-grab.
          Releases matching preferred keywords get a score boost (+10 each, max +20).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Rejected keywords */}
        <div className="space-y-2">
          <Label>Rejected keywords</Label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {rejected.map((kw) => (
              <span key={kw} className="inline-flex items-center gap-1 text-xs bg-destructive/15 text-destructive border border-destructive/30 rounded px-2 py-0.5">
                {kw}
                <button onClick={() => setRejected((r) => r.filter((k) => k !== kw))} className="hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              ref={rejRef}
              placeholder="Type keyword + Enter"
              value={rejInput}
              onChange={(e) => setRejInput(e.target.value)}
              onKeyDown={(e) => handleKeyDown('rejected', e)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {REJECTED_PRESETS.filter((p) => !rejected.includes(p)).map((p) => (
              <button
                key={p}
                onClick={() => addKeyword('rejected', p)}
                className="text-xs px-2 py-0.5 rounded border border-dashed border-border text-muted-foreground hover:border-destructive/60 hover:text-destructive transition-colors"
              >
                + {p}
              </button>
            ))}
          </div>
        </div>

        {/* Preferred keywords */}
        <div className="space-y-2">
          <Label>Preferred keywords</Label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {preferred.map((kw) => (
              <span key={kw} className="inline-flex items-center gap-1 text-xs bg-green-500/15 text-green-400 border border-green-500/30 rounded px-2 py-0.5">
                {kw}
                <button onClick={() => setPreferred((p) => p.filter((k) => k !== kw))} className="hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              ref={prefRef}
              placeholder="Type keyword + Enter"
              value={prefInput}
              onChange={(e) => setPrefInput(e.target.value)}
              onKeyDown={(e) => handleKeyDown('preferred', e)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {PREFERRED_PRESETS.filter((p) => !preferred.includes(p)).map((p) => (
              <button
                key={p}
                onClick={() => addKeyword('preferred', p)}
                className={cn(
                  'text-xs px-2 py-0.5 rounded border border-dashed border-border text-muted-foreground',
                  'hover:border-green-500/60 hover:text-green-400 transition-colors'
                )}
              >
                + {p}
              </button>
            ))}
          </div>
        </div>

        <Button onClick={save} disabled={saveMutation.isPending} size="sm">
          {saved
            ? <><CheckCircle2 className="h-4 w-4 mr-1.5" />Saved</>
            : saveMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving…</>
              : 'Save filters'}
        </Button>
      </CardContent>
    </Card>
  )
}
