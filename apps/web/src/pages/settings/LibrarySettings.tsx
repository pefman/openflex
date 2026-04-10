import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, qualityApi, optimizationApi } from '../../api/index.ts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2 } from 'lucide-react'

export default function LibrarySettings() {
  const qc = useQueryClient()
  const { data: settings = {} } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const { data: qualityProfiles = [] } = useQuery({ queryKey: ['quality-profiles'], queryFn: qualityApi.list })
  const { data: optProfiles = [] } = useQuery({ queryKey: ['optimization-profiles'], queryFn: optimizationApi.listProfiles })

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => settingsApi.set(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  const [defaultMovieQuality, setDefaultMovieQuality] = useState('none')
  const [defaultShowQuality, setDefaultShowQuality] = useState('none')
  const [defaultOptProfile, setDefaultOptProfile] = useState('none')
  const [defaultMonitored, setDefaultMonitored] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings.DEFAULT_MOVIE_QUALITY_PROFILE) setDefaultMovieQuality(settings.DEFAULT_MOVIE_QUALITY_PROFILE)
    if (settings.DEFAULT_SHOW_QUALITY_PROFILE) setDefaultShowQuality(settings.DEFAULT_SHOW_QUALITY_PROFILE)
    if (settings.DEFAULT_OPTIMIZATION_PROFILE) setDefaultOptProfile(settings.DEFAULT_OPTIMIZATION_PROFILE)
    if (settings.DEFAULT_MONITORED !== undefined) setDefaultMonitored(settings.DEFAULT_MONITORED !== 'false')
  }, [settings])

  const save = async () => {
    await saveMutation.mutateAsync({
      DEFAULT_MOVIE_QUALITY_PROFILE: defaultMovieQuality,
      DEFAULT_SHOW_QUALITY_PROFILE: defaultShowQuality,
      DEFAULT_OPTIMIZATION_PROFILE: defaultOptProfile,
      DEFAULT_MONITORED: String(defaultMonitored),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Profiles</CardTitle>
          <CardDescription>
            These profiles are pre-selected when adding new movies or shows. You can override them per item.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Default movie quality profile</Label>
            <Select value={defaultMovieQuality} onValueChange={setDefaultMovieQuality}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any quality</SelectItem>
                {qualityProfiles.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Default show quality profile</Label>
            <Select value={defaultShowQuality} onValueChange={setDefaultShowQuality}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any quality</SelectItem>
                {qualityProfiles.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {optProfiles.length > 0 && (
            <div className="space-y-1.5">
              <Label>Default optimization profile</Label>
              <Select value={defaultOptProfile} onValueChange={setDefaultOptProfile}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {optProfiles.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monitoring</CardTitle>
          <CardDescription>
            Controls whether newly added movies and shows are monitored by default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              id="default-monitored"
              checked={defaultMonitored}
              onCheckedChange={setDefaultMonitored}
            />
            <Label htmlFor="default-monitored">Monitor new additions by default</Label>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saveMutation.isPending}>
        {saved ? <><CheckCircle2 className="h-4 w-4 mr-1.5" />Saved</> : 'Save changes'}
      </Button>
    </div>
  )
}
