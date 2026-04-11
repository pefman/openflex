import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { backupApi, settingsApi } from '../../api/index.ts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Database, FileDown, FileUp, Settings2 } from 'lucide-react'

export default function BackupSettings() {
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: settings = {} } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })

  const downloadSettings = () => {
    const json = JSON.stringify(settings, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `openflex-settings-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Settings exported')
  }

  const downloadDb = () => {
    // Get auth token from localStorage
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token')
    if (!token) { toast.error('Not authenticated'); return }
    backupApi.downloadDb(token)
  }

  const importSettings = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      if (typeof json !== 'object' || Array.isArray(json)) throw new Error('Invalid format')
      await backupApi.importSettings(json)
      toast.success(`Imported ${Object.keys(json).length} settings`)
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : err}`)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Backup &amp; Restore</h2>
        <p className="text-sm text-muted-foreground">Export and restore your OpenFlex configuration.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" /> Database Backup</CardTitle>
          <CardDescription>Download a full copy of the SQLite database. Includes all media, downloads, and history.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={downloadDb} variant="outline">
            <FileDown className="h-4 w-4 mr-2" /> Download database
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4" /> Settings Export</CardTitle>
          <CardDescription>Export API keys, paths, and configuration to a JSON file.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={downloadSettings} variant="outline">
            <FileDown className="h-4 w-4 mr-2" /> Export settings
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
            <FileUp className="h-4 w-4 mr-2" /> {importing ? 'Importing…' : 'Import settings'}
          </Button>
          <input ref={fileRef} type="file" accept=".json" onChange={importSettings} className="hidden" />
        </CardContent>
      </Card>
    </div>
  )
}
