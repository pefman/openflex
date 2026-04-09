import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usenetApi } from '../../api/index.ts'
import type { UsenetServerDto, CreateUsenetServerRequest } from '@openflex/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Loader2 } from 'lucide-react'

export default function UsenetSettings() {
  const qc = useQueryClient()
  const { data: servers = [] } = useQuery({ queryKey: ['usenet-servers'], queryFn: usenetApi.list })
  const [showForm, setShowForm] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: usenetApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usenet-servers'] }),
  })

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Usenet Servers</h2>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Server
        </Button>
      </div>

      {servers.length === 0 ? (
        <p className="text-muted-foreground text-sm">No Usenet servers configured. Add your NNTP provider here.</p>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {servers.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{s.name}</p>
                    {s.ssl && <Badge variant="secondary" className="text-xs">SSL</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.host}:{s.port} · {s.maxConnections} connections</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(s.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <UsenetForm open={showForm} onClose={() => setShowForm(false)} />
    </div>
  )
}

function UsenetForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<CreateUsenetServerRequest>({
    name: '', host: '', port: 563, ssl: true, username: '', password: '', maxConnections: 10,
  })

  const createMutation = useMutation({
    mutationFn: usenetApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usenet-servers'] }); onClose() },
  })

  const submit = (e: React.FormEvent) => { e.preventDefault(); createMutation.mutate(form) }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Usenet Server</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="My Provider" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Host</Label>
              <Input placeholder="news.provider.com" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Port</Label>
              <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="ssl"
              checked={form.ssl}
              onCheckedChange={(v) => setForm({ ...form, ssl: v })}
            />
            <Label htmlFor="ssl">SSL / TLS</Label>
          </div>
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label>Max Connections</Label>
            <Input type="number" value={form.maxConnections} onChange={(e) => setForm({ ...form, maxConnections: Number(e.target.value) })} />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Add Server
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
