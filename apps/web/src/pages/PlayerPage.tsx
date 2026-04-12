import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Hls from 'hls.js'
import { playbackApi, streamApi, logsApi, type HlsQuality, type SubtitleTrack } from '../api/index.ts'

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
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const mediaFileId = (() => {
    if (!slug) return NaN
    if (/^\d+$/.test(slug)) return Number(slug)
    const match = slug.match(/-(\d+)$/)
    return match ? Number(match[1]) : NaN
  })()
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const qualityRef = useRef<HlsQuality>('original')
  const modeRef = useRef<string>('direct')

  const [mode, setMode] = useState<'direct' | 'hls'>('direct')
  const [quality, setQuality] = useState<HlsQuality>('original')
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([])
  const [activeSubtitle, setActiveSubtitle] = useState<number | null>(null)
  const [castState, setCastState] = useState<'unavailable' | 'available' | 'connecting' | 'connected'>('unavailable')
  const [castDeviceName, setCastDeviceName] = useState('')
  const [error, setError] = useState('')
  const [logs, setLogs] = useState<Array<{ ts: string; level: 'info' | 'warn' | 'error'; msg: string }>>([])
  const [showLog, setShowLog] = useState(false)

  // stream token is fetched once on mount and used for all media requests that can't send headers
  const streamTokenRef = useRef('')

  // ── Logging ───────────────────────────────────────────────────────────────
  const addLog = useCallback((level: 'info' | 'warn' | 'error', msg: string) => {
    const ts = new Date().toLocaleTimeString()
    if (level === 'error') console.error(`[Player] ${msg}`)
    else if (level === 'warn') console.warn(`[Player] ${msg}`)
    else console.log(`[Player] ${msg}`)
    setLogs((prev) => [...prev.slice(-199), { ts, level, msg }])
    logsApi.write(level, 'player', msg).catch(() => {})
  }, [])

  // ── Direct play ──────────────────────────────────────────────────────────
  const getToken = useCallback(() => localStorage.getItem('token') ?? '', [])

  useEffect(() => {
    if (!Number.isFinite(mediaFileId)) setError('Invalid player URL')
  }, [mediaFileId])

  useEffect(() => {
    if (!Number.isFinite(mediaFileId) || !videoRef.current) return
    const video = videoRef.current
    let cancelled = false

    async function init() {
      addLog('info', 'Fetching stream token...')
      try {
        const data = await streamApi.token(mediaFileId)
        streamTokenRef.current = data.token
        addLog('info', 'Stream token obtained')
      } catch (e) {
        addLog('error', `Failed to obtain stream token: ${e}`)
        setError('Failed to start player. Please try again.')
        return
      }
      if (cancelled) return

      playbackApi.get(mediaFileId).then((pos) => {
        if (pos.position > 10) {
          video.currentTime = pos.position
          addLog('info', `Restored position to ${pos.position.toFixed(0)}s`)
        }
      }).catch(() => {})

      addLog('info', 'Starting direct play...')
      video.src = `/api/stream/${mediaFileId}?streamToken=${streamTokenRef.current}`

      const onError = () => {
        const ve = video.error
        addLog('error', `Direct play error: code=${ve?.code ?? '?'} msg=${ve?.message ?? 'unknown'}`)
        if (!cancelled) {
          addLog('info', 'Falling back to HLS transcode...')
          setMode('hls')
          startHls('original')
        }
      }
      video.addEventListener('error', onError, { once: true })

      streamApi.subtitles(mediaFileId).then(setSubtitleTracks).catch(() => {})
    }

    init()

    // Periodic position save
    saveTimerRef.current = setInterval(() => {
      if (!video.paused && video.currentTime > 0) {
        playbackApi.save(mediaFileId, video.currentTime, video.duration || 0, modeRef.current, qualityRef.current).catch(() => {})
      }
    }, 5000)

    return () => {
      cancelled = true
      video.removeEventListener('error', () => {})
      if (saveTimerRef.current) clearInterval(saveTimerRef.current)
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      // Stop server-side transcode — use keepalive so the request survives navigation
      if (modeRef.current === 'transcode' && Number.isFinite(mediaFileId)) {
        const token = localStorage.getItem('token') ?? ''
        fetch(`/api/stream/${mediaFileId}/hls?quality=${qualityRef.current}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        }).catch(() => {})
      }
    }
  }, [mediaFileId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── HLS playback ─────────────────────────────────────────────────────────
  async function startHls(q: HlsQuality) {
    const video = videoRef.current
    if (!video || !Number.isFinite(mediaFileId)) return
    setError('')
    qualityRef.current = q
    modeRef.current = 'transcode'

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    addLog('info', `Starting HLS transcode (quality=${q})...`)
    try {
      const token = getToken()
      const res = await fetch(`/api/stream/${mediaFileId}/hls?quality=${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`HTTP ${res.status}: ${body}`)
      }
      const { m3u8Url } = await res.json()
      addLog('info', `Transcode ready, loading ${m3u8Url}`)

      if (Hls.isSupported()) {
        const hls = new Hls({
          xhrSetup: (xhr: XMLHttpRequest) => {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`)
          },
          // Progressive transcode: the manifest is an EVENT stream growing as ffmpeg writes.
          // hls.js defaults to seeking the live edge (end of manifest), which on a fast
          // GPU puts the edge minutes ahead of position 0. Force start at beginning.
          startPosition: 0,
          // Keep live sync point far behind the edge so normal 1x playback never
          // "catches up" to the edge and triggers a live-edge seek.
          liveSyncDurationCount: 10,
          liveMaxLatencyDurationCount: 30,
          // Buffer generously to handle the growing manifest
          maxBufferLength: 60,
          maxMaxBufferLength: 300,
        })
        hlsRef.current = hls
        hls.loadSource(m3u8Url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          addLog('info', 'HLS manifest parsed, starting playback')
          video.play().catch((e) => addLog('warn', `play() rejected: ${e}`))
        })
        hls.on(Hls.Events.ERROR, (_: unknown, data: any) => {
          if (data.fatal) {
            addLog('error', `HLS fatal error: type=${data.type} details=${data.details}`)
            setError(`Playback failed (${data.details}).`)
          } else {
            addLog('warn', `HLS non-fatal: ${data.details}`)
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        addLog('info', 'Using native HLS playback')
        video.src = m3u8Url
      } else {
        addLog('error', 'HLS not supported in this browser')
        setError('HLS is not supported in this browser.')
      }
    } catch (err) {
      addLog('error', `HLS start failed: ${err}`)
      setError(`Transcoding failed: ${err}`)
    }
  }

  // ── Quality switching ────────────────────────────────────────────────────
  function switchQuality(q: HlsQuality) {
    qualityRef.current = q
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
    if (!Number.isFinite(mediaFileId) || !streamTokenRef.current) return
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
    if (video && Number.isFinite(mediaFileId)) {
      playbackApi.save(mediaFileId, video.currentTime, video.duration || 0).catch(() => {})
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
              modeRef.current = 'direct'
              setError('')
              addLog('info', 'Switching to direct play...')
              if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
              // Stop any running server-side transcode
              const token = localStorage.getItem('token') ?? ''
              fetch(`/api/stream/${mediaFileId}/hls?quality=${qualityRef.current}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
                keepalive: true,
              }).catch(() => {})
              const video = videoRef.current
              if (video && streamTokenRef.current) {
                video.src = `/api/stream/${mediaFileId}?streamToken=${streamTokenRef.current}`
                video.load()
                video.play().catch((e) => addLog('warn', `Direct play() rejected: ${e}`))
              }
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

          {/* Log toggle */}
          <button
            onClick={() => setShowLog((v) => !v)}
            className={`text-xs px-2 py-1 rounded border-l border-white/20 pl-2 ml-1 ${
              logs.some((l) => l.level === 'error')
                ? 'text-red-400 hover:text-red-300'
                : showLog ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'
            }`}
            title="Toggle playback log"
          >
            Log{logs.some((l) => l.level === 'error') ? ` (${logs.filter((l) => l.level === 'error').length} err)` : ''}
          </button>

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
        <div className="absolute bottom-16 inset-x-0 flex justify-center pointer-events-none">
          <div className="bg-red-900/80 text-white text-sm px-4 py-2 rounded-lg max-w-xl text-center">{error}</div>
        </div>
      )}

      {showLog && (
        <div className="absolute bottom-0 inset-x-0 h-48 bg-black/90 border-t border-white/10 flex flex-col">
          <div className="flex items-center justify-between px-3 py-1 border-b border-white/10">
            <span className="text-xs font-mono text-gray-400">Playback Log</span>
            <button onClick={() => { setLogs([]); setShowLog(false) }} className="text-xs text-gray-500 hover:text-white">Clear &times;</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-xs" style={{ scrollBehavior: 'smooth' }}>
            {logs.length === 0 ? (
              <p className="text-gray-600">No log entries yet.</p>
            ) : (
              logs.map((l, i) => (
                <div key={i} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-400' : 'text-gray-300'}>
                  <span className="text-gray-600 select-none">{l.ts} </span>
                  <span className="uppercase font-bold mr-1">{l.level === 'error' ? 'ERR' : l.level === 'warn' ? 'WRN' : 'INF'}</span>
                  {l.msg}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

