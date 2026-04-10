import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '../../api/index.ts'
import { useAuth } from '../../context/AuthContext.tsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Trash2, Loader2, KeyRound } from 'lucide-react'

export default function UsersSettings() {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: usersApi.list })

  const deleteMut = useMutation({
    mutationFn: usersApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const [changePwdTarget, setChangePwdTarget] = React.useState<number | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<number | null>(null)

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Users</h2>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users found.</p>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{u.name}</p>
                    {u.role === 'admin' && <Badge variant="default" className="text-xs">Admin</Badge>}
                    {u.id === me?.id && <Badge variant="outline" className="text-xs text-muted-foreground">You</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setChangePwdTarget(u.id)}
                  >
                    <KeyRound className="h-3.5 w-3.5 mr-1" />
                    Change password
                  </Button>
                  {u.id !== me?.id && (
                    deleteConfirmId === u.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-destructive">Delete?</span>
                        <Button variant="destructive" size="sm" className="h-7 px-2 text-xs" onClick={() => { deleteMut.mutate(u.id); setDeleteConfirmId(null) }}>Yes</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDeleteConfirmId(null)}>No</Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirmId(u.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ChangePasswordDialog
        userId={changePwdTarget}
        isSelf={changePwdTarget === me?.id}
        isAdmin={me?.role === 'admin'}
        onClose={() => setChangePwdTarget(null)}
      />
    </div>
  )
}

function ChangePasswordDialog({
  userId, isSelf, isAdmin, onClose,
}: {
  userId: number | null
  isSelf: boolean
  isAdmin: boolean
  onClose: () => void
}) {
  const [currentPwd, setCurrentPwd] = React.useState('')
  const [newPwd, setNewPwd] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  const changeMut = useMutation({
    mutationFn: ({ id, password, current }: { id: number; password: string; current?: string }) =>
      usersApi.changePassword(id, password, current),
    onSuccess: () => { setDone(true); setTimeout(onClose, 1200) },
    onError: (e: any) => setError(e?.response?.data?.error ?? 'Failed'),
  })

  React.useEffect(() => {
    if (!userId) { setCurrentPwd(''); setNewPwd(''); setConfirm(''); setError(null); setDone(false) }
  }, [userId])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (newPwd !== confirm) { setError('Passwords do not match'); return }
    if (newPwd.length < 8) { setError('Password must be at least 8 characters'); return }
    changeMut.mutate({
      id: userId!,
      password: newPwd,
      current: (isSelf && !isAdmin) ? currentPwd : undefined,
    })
  }

  return (
    <Dialog open={userId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>
        {done ? (
          <p className="text-sm text-emerald-400 py-2">Password changed successfully.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {isSelf && !isAdmin && (
              <div className="space-y-1.5">
                <Label>Current password</Label>
                <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm new password</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={changeMut.isPending}>
              {changeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Save password
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
