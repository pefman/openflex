import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { indexersApi, settingsApi, usenetApi } from '../api/index.ts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

function SetupStep({
  title,
  configured,
  buttonLabel,
  onOpenSettings,
}: {
  title: string
  configured: boolean
  buttonLabel: string
  onOpenSettings: () => void
}) {
  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            {configured ? 'This step is ready.' : 'This step still needs setup.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={configured ? 'default' : 'outline'}>
            {configured ? 'Configured' : 'Missing'}
          </Badge>
          <Button variant="outline" size="sm" onClick={onOpenSettings}>
            {buttonLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function OnboardingGuide() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [sessionDismissed, setSessionDismissed] = useState(false)
  const [hiddenAfterFinish, setHiddenAfterFinish] = useState(false)

  const { data: settings = {}, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  const { data: indexers = [], isLoading: indexersLoading } = useQuery({
    queryKey: ['indexers'],
    queryFn: indexersApi.list,
  })

  const { data: usenetServers = [], isLoading: usenetLoading } = useQuery({
    queryKey: ['usenet-servers'],
    queryFn: usenetApi.list,
  })

  const onboardingCompleted = settings.ONBOARDING_COMPLETED === 'true'
  const indexerConfigured = indexers.some((i) => i.enabled)
  const downloadConfigured = usenetServers.some((s) => s.enabled)
  const hasMissingSetup = !indexerConfigured || !downloadConfigured
  const loading = settingsLoading || indexersLoading || usenetLoading

  const finishMutation = useMutation({
    mutationFn: () => settingsApi.set({ ONBOARDING_COMPLETED: 'true' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['settings'] })
      setHiddenAfterFinish(true)
      setSessionDismissed(true)
    },
  })

  const open = !loading && !hiddenAfterFinish && !sessionDismissed && !onboardingCompleted && hasMissingSetup

  const openSettingsAndDismiss = (path: string) => {
    setSessionDismissed(true)
    navigate(path)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) setSessionDismissed(true) }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Welcome to OpenFlex</DialogTitle>
          <DialogDescription>
            Finish these setup steps before downloads can run.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <SetupStep
            title="Indexer setup"
            configured={indexerConfigured}
            buttonLabel="Open Indexer Settings"
            onOpenSettings={() => openSettingsAndDismiss('/settings/indexers')}
          />
          <SetupStep
            title="Download client setup"
            configured={downloadConfigured}
            buttonLabel="Open Download Settings"
            onOpenSettings={() => openSettingsAndDismiss('/settings/download-clients')}
          />
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setSessionDismissed(true)} disabled={finishMutation.isPending}>
            Later
          </Button>
          <Button
            onClick={() => finishMutation.mutate()}
            disabled={!indexerConfigured || !downloadConfigured || finishMutation.isPending}
          >
            {finishMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Finish onboarding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}