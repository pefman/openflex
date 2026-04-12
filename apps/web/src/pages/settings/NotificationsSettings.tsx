import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { notificationsApi } from '../../api/index.ts'
import type { NotificationEndpointDto } from '../../api/index.ts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Trash2, Send, Pencil } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = { discord: 'Discord', telegram: 'Telegram', gotify: 'Gotify', webhook: 'Generic Webhook' }
const EVENT_OPTIONS = [
  { value: 'grab', label: 'Grab (download queued)' },
  { value: 'complete', label: 'Complete (file organized)' },
  { value: 'failed', label: 'Failed (download error)' },
]

const DEFAULT_FORM = { name: '', type: 'discord', url: '', token: '', chatId: '', enabled: true, events: ['grab', 'complete', 'failed'] }

export default function NotificationsSettings() {
  const qc = useQueryClient()
  const { data: endpoints = [], isLoading } = useQuery({ queryKey: ['notifications'], queryFn: notificationsApi.list })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<NotificationEndpointDto | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM)

  const openCreate = () => { setEditing(null); setForm(DEFAULT_FORM); setOpen(true) }
  const openEdit = (ep: NotificationEndpointDto) => {
    setEditing(ep)
    setForm({ name: ep.name, type: ep.type, url: ep.url, token: ep.token ?? '', chatId: ep.chatId ?? '', enabled: ep.enabled, events: JSON.parse(ep.events ?? '[]') })
    setOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { ...form, events: JSON.stringify(form.events), token: form.token || null, chatId: form.chatId || null }
      if (editing) return notificationsApi.update(editing.id, body)
      return notificationsApi.create(body as any)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); setOpen(false); toast.success(editing ? 'Endpoint updated' : 'Endpoint added') },
    onError: () => toast.error('Failed to save'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); toast.success('Endpoint removed') },
    onError: () => toast.error('Failed to remove'),
  })

  const testMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.test(id),
    onSuccess: () => toast.success('Test notification sent'),
    onError: () => toast.error('Test notification failed — check the endpoint URL'),
  })

  const toggleEvent = (val: string) => {
    setForm(prev => ({
      ...prev,
      events: prev.events.includes(val) ? prev.events.filter(e => e !== val) : [...prev.events, val],
    }))
  }

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Notification Endpoints</h2>
          <p className="text-sm text-muted-foreground">Send notifications to Discord, Telegram, Gotify, or any webhook.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Endpoint</Button>
      </div>

      {endpoints.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">No notification endpoints configured yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {endpoints.map((ep) => (
            <Card key={ep.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{ep.name}</CardTitle>
                    <CardDescription>{TYPE_LABELS[ep.type] ?? ep.type} · {JSON.parse(ep.events ?? '[]').join(', ')}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ep.enabled ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                      {ep.enabled ? 'enabled' : 'disabled'}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => testMutation.mutate(ep.id)} title="Send test notification">
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(ep)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(ep.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Endpoint' : 'Add Notification Endpoint'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="My Discord" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{form.type === 'telegram' ? 'Telegram API URL (or leave default)' : form.type === 'gotify' ? 'Gotify Server URL' : 'Webhook URL'}</Label>
              <Input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder={form.type === 'discord' ? 'https://discord.com/api/webhooks/...' : form.type === 'telegram' ? 'https://api.telegram.org' : 'https://'} />
            </div>
            {(form.type === 'telegram' || form.type === 'gotify') && (
              <div className="space-y-1.5">
                <Label>{form.type === 'telegram' ? 'Bot Token' : 'App Token'}</Label>
                <Input value={form.token} onChange={e => setForm(p => ({ ...p, token: e.target.value }))} type="password" />
              </div>
            )}
            {form.type === 'telegram' && (
              <div className="space-y-1.5">
                <Label>Chat ID</Label>
                <Input value={form.chatId} onChange={e => setForm(p => ({ ...p, chatId: e.target.value }))} placeholder="-1001234567890" />
              </div>
            )}
            <div className="space-y-2">
              <Label>Events to notify</Label>
              {EVENT_OPTIONS.map(ev => (
                <div key={ev.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={ev.value}
                    checked={form.events.includes(ev.value)}
                    onChange={() => toggleEvent(ev.value)}
                    className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                  />
                  <label htmlFor={ev.value} className="text-sm cursor-pointer">{ev.label}</label>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={v => setForm(p => ({ ...p, enabled: v }))} />
              <Label>Enabled</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || !form.url}>
                {editing ? 'Save' : 'Add'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
