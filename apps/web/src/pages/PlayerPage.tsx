import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Hls from 'hls.js'
import { playbackApi, streamApi, type HlsQuality, type SubtitleTrack } from '../api/index.ts'

// Ambient types for the Cast SDK loaded from CDN
declare global {
  interface Window {
    cast: any
    chrome: { cast: any }
    __onGCastApiAvailable: (isAvailable: boolean) => void
  }
}

const CAST_APP_ID = 'CC1AD845'
const QUALITIES: HlsQuality[] = ['original', '1080p', '720p', '480p']

export default function PlayerPage() {
  const { mediaFileId } = useParams<{ mediaFileId: string }>()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [mode, setMode] = useState<'direct' | 'hls'>('direct')
  const [quality, setQuality] = useState<HlsQuality>('original')
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([])
  const [activeSubtitle, setActiveSubtitle] = useState<number | null>(null)
  const [castState, setCastState] = useState<'unavailable' | 'available' | 'connecting' | 'connected'>('unavailable')
  const [castDeviceName, setCastDeviceName] = useState('')
  const [error, setError] = useState('')

  // stream token is fetched once on mount and used for all media requests that can't send headers
  const streamTokenRef = useRef('')

  // ── Direct play ──────────────────────────────────────────────────────────
  const getToken = useCallback(() => localStorage.getItem('token') ?? '', [])

  useEffect(() => {
    if (!mediaFileId || !videoRef.current) return
    const video = videoRef.current
    let cancelled = false

    async function init() {
      // Obtain a stream token so that video.src and <track> elements can auth without headers
      try {
        const data = await streamApi.token(Number(mediaFileId))
        streamTokenRef.current = data.token
      } catch {
        setError('Failed to start player. Please try again.')
        return
      }
      if (cancelled) return

      // Restore playback position
      playbackApi.get(Number(mediaFileId)).then((pos) => {
        if (pos.position > 10) video.currentTime = pos.position
      }).catch(() => {})

      video.src = `/api/stream/${mediaFileId}?streamToken=${streamTokenRef.current}`

      const onError = () => {
        if (!cancelled && mode === 'direct') {
          setMode('hls')
          startHls('original')
        }
      }
      video.addEventListener('error', onError, { once: true })

      // Load subtitles in background
      streamApi.subtitles(Number(mediaFileId)).then(setSubtitleTracks).catch(() => {})
    }

    init()

    // Periodic position save
    saveTimerRef.current = setInterval(() => {
      if (!video.paused && video.currentTime > 0) {
        playbackApi.save(Number(mediaFileId), video.currentTime, video.duration || 0).catch(() => {})
      }
    }, 5000)

    return () => {
      cancelled = true
      video.removeEventListener('error', () => {})
      if (saveTimerRef.current) clearInterval(saveTimerRef.current)
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [mediaFileId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── HLS playback ─────────────────────────────────────────────────────────
  async function startHls(q: HlsQuality) {
    const video = videoRef.current
    if (!video || !mediaFileId) return
    setError('')

    // Tear down any existing hls.js instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    try {
      const token = getToken()
      const res = await fetch(`/api/stream/${mediaFileId}/hls?quality=${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      const { m3u8Url } = await res.json()

      if (Hls.isSupported()) {
        const hls = new Hls({
          xhrSetup: (xhr: XMLHttpRequest) => {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`)
          },
        })
        hlsRef.current = hls
        hls.loadSource(m3u8Url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
        hls.on(Hls.Events.ERROR, (_: unknown, data: any) => {
          if (data.fatal) setError('Playback failed. The file may not be supported.')
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = m3u8Url
      } else {
        setError('HLS is not supported in this browser.')
      }
    } catch (err) {
      setError('Transcoding failed. Please try direct play.')
      console.error(err)
    }
  }

  // ── Quality switching ────────────────────────────────────────────────────
  function switchQuality(q: HlsQuality) {
    setQuality(q)
    if (mode === 'hls') startHls(q)
  }

  // ── Subtitle track management ────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video || subtitleTracks.length === 0) return

    // Remove old tracks and revoke any blob URLs
    Array.from(video.querySelectorAll('track')).forEach((t) => {
      const src = (t as HTMLTrackElement).src
      if (src.startsWith('blob:')) URL.revokeObjectURL(src)
      t.remove()
    })

    // Fetch each subtitle file as a blob so we don't need auth headers on <track>
    subtitleTracks.forEach((track) => {
      fetch(`${track.url}?quality=original`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }).then((r) => {
        if (!r.ok) return
        return r.blob()
      }).then((blob) => {
        if (!blob || !video) return
        const el = document.createElement('track')
        el.kind = 'subtitles'
        el.label = track.label
        el.srclang = 'auto'
        el.src = URL.createObjectURL(blob)
        video.appendChild(el)
      }).catch(() => {})
    })
  }, [subtitleTracks]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    Array.from(video.textTracks).forEach((t, i) => {
      t.mode = i === activeSubtitle ? 'showing' : 'disabled'
    })
  }, [activeSubtitle])

  // ── Chromecast init ──────────────────────────────────────────────────────
  useEffect(() => {
    function initCast() {
      if (!window.cast?.framework) return

      const ctx = window.cast.framework.CastContext.getInstance()
      ctx.setOptions({
        receiverApplicationId: CAST_APP_ID,
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      })
      ctx.addEventListener(
        window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        (ev: any) => {
          const ss = window.cast.framework.SessionState
          switch (ev.sessionState) {
            case ss.SESSION_STARTED:
            case ss.SESSION_RESUMED:
              setCastState('connected')
              setCastDeviceName(ctx.getCurrentSession()?.getCastDevice()?.friendlyName ?? '')
              break
            case ss.SESSION_ENDED:
              setCastState('available')
              setCastDeviceName('')
              break
          }
        }
      )
      setCastState('available')
    }

    // SDK may already be loaded, or will call __onGCastApiAvailable when ready
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) initCast()
    }
    // Try immediately in case it loaded before this component mounted
    if (window.cast?.framework) initCast()
  }, [])

  // ── Cast media ───────────────────────────────────────────────────────────
  async function castMedia() {
    if (!mediaFileId || !streamTokenRef.current) return
    setCastState('connecting')
    try {
      const ctx = window.cast.framework.CastContext.getInstance()
      await ctx.requestSession()

      const session = ctx.getCurrentSession()
      if (!session) throw new Error('No session')

      const directUrl = `${window.location.protocol}//${window.location.host}/api/stream/${mediaFileId}?streamToken=${streamTokenRef.current}`
      const currentTime = videoRef.current?.currentTime ?? 0
      videoRef.current?.pause()

      const mediaInfo = new window.chrome.cast.media.MediaInfo(directUrl, 'video/mp4')
      const request = new window.chrome.cast.media.LoadRequest(mediaInfo)
      request.currentTime = currentTime

      await session.loadMedia(request)
      setCastState('connected')
      setCastDeviceName(session.getCastDevice()?.friendlyName ?? '')
    } catch (err) {
      setCastState('available')
      setError('Casting failed.')
      console.error(err)
    }
  }

  const handleBack = () => {
    const video = videoRef.current
    if (video && mediaFileId) {
      playbackApi.save(Number(mediaFileId), video.currentTime, video.duration || 0).catch(() => {})
    }
    navigate(-1)
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center gap-4 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={handleBack} className="text-white hover:text-gray-300 text-sm flex-shrink-0">
          ← Back
        </button>

        <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
          {/* Mode buttons */}
          <button
            onClick={() => {
              setMode('direct')
              if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
              if (videoRef.current) videoRef.current.src = `/api/stream/${mediaFileId}?streamToken=${streamTokenRef.current}`
            }}
            className={`text-xs px-2 py-1 rounded ${mode === 'direct' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Direct
          </button>
          <button
            onClick={() => { setMode('hls'); startHls(quality) }}
            className={`text-xs px-2 py-1 rounded ${mode === 'hls' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Transcode
          </button>

          {/* Quality pills — only in HLS mode */}
          {mode === 'hls' && (
            <div className="flex gap-1 border-l border-white/20 pl-2 ml-1">
              {QUALITIES.map((q) => (
                <button
                  key={q}
                  onClick={() => switchQuality(q)}
                  className={`text-xs px-2 py-1 rounded ${quality === q ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Subtitle picker */}
          {subtitleTracks.length > 0 && (
            <div className="border-l border-white/20 pl-2 ml-1">
              <select
                value={activeSubtitle ?? ''}
                onChange={(e) => setActiveSubtitle(e.target.value === '' ? null : Number(e.target.value))}
                className="text-xs bg-white/10 text-white rounded px-2 py-1 border-0 outline-none cursor-pointer"
              >
                <option value="">Subtitles off</option>
                {subtitleTracks.map((t) => (
                  <option key={t.index} value={t.index}>{t.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Cast button */}
          {castState !== 'unavailable' && (
            <button
              onClick={castMedia}
              disabled={castState === 'connecting'}
              className={`text-xs px-2 py-1 rounded border-l border-white/20 pl-2 ml-1 ${
                castState === 'connected'
                  ? 'text-blue-400'
                  : castState === 'connecting'
                    ? 'text-gray-500 cursor-wait'
                    : 'text-gray-400 hover:text-white'
              }`}
              title={castState === 'connected' ? `Casting to ${castDeviceName}` : 'Cast to device'}
            >
              {castState === 'connected' ? `⊞ ${castDeviceName || 'Casting'}` : '⊞ Cast'}
            </button>
          )}
        </div>
      </div>

      {/* Video */}
      <video
        ref={videoRef}
        className="w-full h-full"
        controls
        autoPlay
        playsInline
        crossOrigin="anonymous"
      />

      {error && (
        <div className="absolute bottom-16 inset-x-0 flex justify-center">
          <div className="bg-red-900/80 text-white text-sm px-4 py-2 rounded-lg">{error}</div>
        </div>
      )}
    </div>
  )
}

