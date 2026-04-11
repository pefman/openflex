import { useState } from 'react'
import { toast } from 'sonner'
import { MoreHorizontal, Copy, MonitorPlay, Tv } from 'lucide-react'
import { streamApi } from '../api/index.ts'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

interface Props {
  mediaFileId: number
  size?: 'sm' | 'default'
}

export default function ExternalPlayerMenu({ mediaFileId, size = 'sm' }: Props) {
  const [fetching, setFetching] = useState(false)

  const getStreamUrl = async (): Promise<string | null> => {
    setFetching(true)
    try {
      const { token } = await streamApi.token(mediaFileId)
      const base = `${window.location.origin}/api/stream/${mediaFileId}`
      return `${base}?token=${encodeURIComponent(token)}`
    } catch {
      toast.error('Could not generate stream URL')
      return null
    } finally {
      setFetching(false)
    }
  }

  const handleCopy = async () => {
    const url = await getStreamUrl()
    if (!url) return
    await navigator.clipboard.writeText(url)
    toast.success('Stream URL copied')
  }

  const handleVlc = async () => {
    const url = await getStreamUrl()
    if (!url) return
    window.open(`vlc://${url}`)
  }

  const handleInfuse = async () => {
    const url = await getStreamUrl()
    if (!url) return
    window.location.href = `infuse://x-callback-url/play?url=${encodeURIComponent(url)}`
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant="outline" disabled={fetching} title="Open in external player">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs">Open in…</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopy}>
          <Copy className="h-3.5 w-3.5 mr-2" />
          Copy stream URL
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleVlc}>
          <MonitorPlay className="h-3.5 w-3.5 mr-2" />
          Open in VLC
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleInfuse}>
          <Tv className="h-3.5 w-3.5 mr-2" />
          Open in Infuse
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
