import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { indexersApi } from '../../api/index.ts'
import type { IndexerDto, CreateIndexerRequest, IndexerType } from '@openflex/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export default function IndexersSettings() {
  const qc = useQueryClient()
  const { data: indexers = [] } = useQuery({ queryKey: ['indexers'], queryFn: indexersApi.list })
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<IndexerDto | null>(null)

  const deleteMutation = useMutation({
    mutationFn: indexersApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['indexers'] }),
  })

  const openAdd = () => { setEditing(null); setShowForm(true) }
  const openEdit = (idx: IndexerDto) => { setEditing(idx); setShowForm(true) }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Indexers</h2>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Indexer
        </Button>
      </div>

      {indexers.length === 0 ? (
        <p className="text-muted-foreground text-sm">No indexers configured. Add a Jackett or Prowlarr Torznab/Newznab feed.</p>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {indexers.map((idx) => (
              <div key={idx.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{idx.name}</p>
                    <Badge variant="secondary" className="text-xs">{idx.type}</Badge>
                    {!idx.enabled && <Badge variant="outline" className="text-xs text-muted-foreground">Disabled</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{idx.url}</p>
                </div>
                <div className="flex items-center gap-3 ml-3 shrink-0">
                  <span className="text-xs text-muted-foreground tabular-nums" title="Total grabs">{idx.grabCount} grab{idx.grabCount !== 1 ? 's' : ''}</span>
                  <TestButton indexerId={idx.id} />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(idx)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(idx.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <IndexerForm
        open={showForm}
        existing={editing}
        onClose={() => { setShowForm(false); setEditing(null) }}
      />
    </div>
  )
}

function TestButton({ indexerId }: { indexerId: number }) {
  const [result, setResult] = useState<null | boolean>(null)
  const [loading, setLoading] = useState(false)

  const test = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await indexersApi.test(indexerId)
      setResult(res.success)
    } catch {
      setResult(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={test} disabled={loading}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : result === null ? 'Test'
        : result ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mr-1" />OK</>
        : <><XCircle className="h-3.5 w-3.5 text-destructive mr-1" />Fail</>}
    </Button>
  )
}

function IndexerForm({ open, existing, onClose }: { open: boolean; existing: IndexerDto | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<CreateIndexerRequest>({
    name: existing?.name ?? '',
    type: (existing?.type as IndexerType) ?? 'torznab',
    url: existing?.url ?? '',
    apiKey: existing?.apiKey ?? '',
    enabled: existing?.enabled ?? true,
    priority: existing?.priority ?? 0,
  })

  // Reset when dialog opens with new existing value
  const handleOpenChange = (o: boolean) => {
    if (!o) { onClose(); return }
    setForm({
      name: existing?.name ?? '',
      type: (existing?.type as IndexerType) ?? 'torznab',
      url: existing?.url ?? '',
      apiKey: existing?.apiKey ?? '',
      enabled: existing?.enabled ?? true,
      priority: existing?.priority ?? 0,
    })
  }

  const createMutation = useMutation({
    mutationFn: indexersApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['indexers'] }); onClose() },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateIndexerRequest> }) => indexersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['indexers'] }); onClose() },
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (existing) {
      updateMutation.mutate({ id: existing.id, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit' : 'Add'} Indexer</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="My Jackett indexer" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as IndexerType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="torznab">Torznab (Jackett / Prowlarr)</SelectItem>
                <SelectItem value="newznab">Newznab (NZBGeek / etc.)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>URL</Label>
            <Input placeholder="http://jackett:9117/api/v2.0/indexers/NAME/results" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label>API Key</Label>
            <Input placeholder="Optional" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Priority <span className="text-muted-foreground text-xs">(lower = higher priority)</span></Label>
            <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="indexer-enabled"
              checked={form.enabled}
              onCheckedChange={(v) => setForm({ ...form, enabled: v })}
            />
            <Label htmlFor="indexer-enabled">Enabled</Label>
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {existing ? 'Save changes' : 'Add Indexer'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
