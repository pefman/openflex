import { api } from './client.ts'
import type {
  MovieDto, AddMovieRequest,
  ShowDto, AddShowRequest,
  DownloadDto, AddTorrentRequest, AddNzbRequest,
  IndexerDto, CreateIndexerRequest,
  QualityProfileDto, CreateQualityProfileRequest,
  UsenetServerDto, CreateUsenetServerRequest,
  TmdbMovieResult, TmdbShowResult,
  AuthResponse, LoginRequest, RegisterRequest,
  PlaybackPositionDto, IndexerSearchResult,
} from '@openflex/shared'

export type IndexerSearchResultWithScore = IndexerSearchResult & { score: number }

export interface DiskSpaceDto {
  total: number
  free: number
  used: number
  path: string
}

export interface SchedulerStatusDto {
  intervalMinutes: number
  lastRun: string | null
  running: boolean
}

export interface HealthIndexerDto {
  id: number
  name: string
  type: string
  enabled: boolean
  priority: number
}

export interface HealthUsenetDto {
  id: number
  name: string
  host: string
  port: number
  ssl: boolean
  enabled: boolean
  online: boolean
}

export interface HealthDto {
  disk: DiskSpaceDto | null
  scheduler: SchedulerStatusDto
  indexers: HealthIndexerDto[]
  usenetServers: HealthUsenetDto[]
  transcoding: {
    hwEncoder: 'nvenc' | 'qsv' | 'vaapi' | 'software'
    nvenc: boolean
    qsv: boolean
    vaapi: boolean
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (body: LoginRequest) => api.post<AuthResponse>('/auth/login', body).then(r => r.data),
  register: (body: RegisterRequest) => api.post<AuthResponse>('/auth/register', body).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
}

// ─── Search ───────────────────────────────────────────────────────────────────
export const searchApi = {
  movies: (q: string) => api.get<TmdbMovieResult[]>(`/api/search/movies?q=${encodeURIComponent(q)}`).then(r => r.data),
  shows: (q: string) => api.get<TmdbShowResult[]>(`/api/search/shows?q=${encodeURIComponent(q)}`).then(r => r.data),
}

// ─── Movies ───────────────────────────────────────────────────────────────────
export const moviesApi = {
  list: () => api.get<MovieDto[]>('/api/movies').then(r => r.data),
  get: (id: number) => api.get<MovieDto>(`/api/movies/${id}`).then(r => r.data),
  add: (body: AddMovieRequest) => api.post<MovieDto>('/api/movies', body).then(r => r.data),
  update: (id: number, body: Partial<MovieDto>) => api.patch<MovieDto>(`/api/movies/${id}`, body).then(r => r.data),
  remove: (id: number, deleteFiles = false) => api.delete(`/api/movies/${id}?deleteFiles=${deleteFiles}`),
  bulkUpdate: (ids: number[], data: { monitored?: boolean }) => api.patch<{ updated: number }>('/api/movies/bulk', { ids, ...data }).then(r => r.data),
  bulkRemove: (ids: number[], deleteFiles = false) => api.delete<{ deleted: number }>(`/api/movies/bulk?deleteFiles=${deleteFiles}`, { data: { ids } }).then(r => r.data),
  search: (id: number) => api.get<IndexerSearchResultWithScore[]>(`/api/movies/${id}/search`).then(r => r.data),
  grab: (id: number, release: IndexerSearchResult) => api.post<{ downloadId: number }>(`/api/movies/${id}/grab`, release).then(r => r.data),
}

// ─── Shows ────────────────────────────────────────────────────────────────────
export const showsApi = {
  list: () => api.get<ShowDto[]>('/api/shows').then(r => r.data),
  get: (id: number) => api.get<ShowDto>(`/api/shows/${id}`).then(r => r.data),
  add: (body: AddShowRequest) => api.post<ShowDto>('/api/shows', body).then(r => r.data),
  update: (id: number, body: Partial<ShowDto>) => api.patch<ShowDto>(`/api/shows/${id}`, body).then(r => r.data),
  remove: (id: number) => api.delete(`/api/shows/${id}`),
  bulkUpdate: (ids: number[], data: { monitored?: boolean }) => api.patch<{ updated: number }>('/api/shows/bulk', { ids, ...data }).then(r => r.data),
  bulkRemove: (ids: number[]) => api.delete<{ deleted: number }>('/api/shows/bulk', { data: { ids } }).then(r => r.data),
  updateEpisode: (showId: number, episodeId: number, body: { monitored: boolean }) =>
    api.patch(`/api/shows/${showId}/episodes/${episodeId}`, body).then(r => r.data),
  updateSeason: (showId: number, seasonId: number, body: { monitored: boolean }) =>
    api.patch(`/api/shows/${showId}/seasons/${seasonId}`, body),
  searchEpisode: (showId: number, episodeId: number) =>
    api.get<IndexerSearchResultWithScore[]>(`/api/shows/${showId}/episodes/${episodeId}/search`).then(r => r.data),
  grabEpisode: (showId: number, episodeId: number, release: IndexerSearchResult) =>
    api.post<{ downloadId: number }>(`/api/shows/${showId}/episodes/${episodeId}/grab`, release).then(r => r.data),
  autoGrabEpisode: (showId: number, episodeId: number) =>
    api.post<{ downloadId: number }>(`/api/shows/${showId}/episodes/${episodeId}/auto-grab`).then(r => r.data),
  autoGrabSeason: (showId: number, seasonId: number) =>
    api.post<{ grabbed: number; total: number }>(`/api/shows/${showId}/seasons/${seasonId}/auto-grab`).then(r => r.data),
  autoGrabShow: (showId: number) =>
    api.post<{ grabbed: number; total: number }>(`/api/shows/${showId}/auto-grab`).then(r => r.data),
  deleteEpisodeFile: (showId: number, episodeId: number) =>
    api.delete(`/api/shows/${showId}/episodes/${episodeId}/file`),
  deleteSeasonFiles: (showId: number, seasonId: number) =>
    api.delete(`/api/shows/${showId}/seasons/${seasonId}/files`),
  refresh: (showId: number) => api.post<ShowDto>(`/api/shows/${showId}/refresh`).then(r => r.data),
}

// ─── Downloads ────────────────────────────────────────────────────────────────
export const downloadsApi = {
  list: () => api.get<DownloadDto[]>('/api/downloads').then(r => r.data),
  addTorrent: (body: AddTorrentRequest) => api.post('/api/downloads/torrent', body).then(r => r.data),
  addNzb: (body: AddNzbRequest) => api.post('/api/downloads/nzb', body).then(r => r.data),
  pause: (id: number) => api.post(`/api/downloads/${id}/pause`),
  resume: (id: number) => api.post(`/api/downloads/${id}/resume`),
  retry: (id: number) => api.post(`/api/downloads/${id}/retry`),
  remove: (id: number) => api.delete(`/api/downloads/${id}`),
  clearHistory: () => api.delete('/api/downloads/history'),
  move: (id: number, direction: 'up' | 'down') => api.post(`/api/downloads/${id}/move`, { direction }),
}

// ─── Indexers ─────────────────────────────────────────────────────────────────
export const indexersApi = {
  list: () => api.get<IndexerDto[]>('/api/indexers').then(r => r.data),
  create: (body: CreateIndexerRequest) => api.post<IndexerDto>('/api/indexers', body).then(r => r.data),
  update: (id: number, body: Partial<CreateIndexerRequest>) => api.patch<IndexerDto>(`/api/indexers/${id}`, body).then(r => r.data),
  remove: (id: number) => api.delete(`/api/indexers/${id}`),
  test: (id: number) => api.get<{ success: boolean }>(`/api/indexers/${id}/test`).then(r => r.data),
}

// ─── Quality Profiles ─────────────────────────────────────────────────────────
export const qualityApi = {
  list: () => api.get<QualityProfileDto[]>('/api/quality-profiles').then(r => r.data),
  create: (body: CreateQualityProfileRequest) => api.post<QualityProfileDto>('/api/quality-profiles', body).then(r => r.data),
  update: (id: number, body: Partial<CreateQualityProfileRequest>) => api.patch<QualityProfileDto>(`/api/quality-profiles/${id}`, body).then(r => r.data),
  remove: (id: number) => api.delete(`/api/quality-profiles/${id}`),
}

// ─── Usenet Servers ───────────────────────────────────────────────────────────
export const usenetApi = {
  list: () => api.get<UsenetServerDto[]>('/api/usenet-servers').then(r => r.data),
  create: (body: CreateUsenetServerRequest) => api.post<UsenetServerDto>('/api/usenet-servers', body).then(r => r.data),
  update: (id: number, body: Partial<CreateUsenetServerRequest>) => api.patch<UsenetServerDto>(`/api/usenet-servers/${id}`, body).then(r => r.data),
  remove: (id: number) => api.delete(`/api/usenet-servers/${id}`),
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => api.get<Record<string, string>>('/api/settings').then(r => r.data),
  set: (body: Record<string, string>) => api.put('/api/settings', body),
}

// ─── Playback ─────────────────────────────────────────────────────────────────
export const playbackApi = {
  get: (mediaFileId: number) => api.get<PlaybackPositionDto>(`/api/playback/${mediaFileId}`).then(r => r.data),
  save: (mediaFileId: number, position: number, duration: number, mode = 'direct', quality = 'original') =>
    api.put(`/api/playback/${mediaFileId}`, { position, duration, mode, quality }),
}

// ─── Stream ───────────────────────────────────────────────────────────────────
export type HlsQuality = 'original' | '1080p' | '720p' | '480p'

export interface StreamTokenDto {
  token: string
  directUrl: string
  hlsUrl: string
}

export interface SubtitleTrack {
  index: number
  url: string
  label: string
}

export const streamApi = {
  token: (mediaFileId: number) =>
    api.post<StreamTokenDto>(`/api/stream/${mediaFileId}/token`).then(r => r.data),
  subtitles: (mediaFileId: number) =>
    api.get<SubtitleTrack[]>(`/api/stream/${mediaFileId}/subtitles`).then(r => r.data),
  stopTranscode: (mediaFileId: number, quality: HlsQuality) =>
    api.delete(`/api/stream/${mediaFileId}/hls?quality=${quality}`).catch(() => {}),
}

// ─── Logs ─────────────────────────────────────────────────────────────────────
export interface LogEntry {
  id: number
  ts: string
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
}

export const logsApi = {
  list: (limit = 200) => api.get<LogEntry[]>(`/api/logs?limit=${limit}`).then(r => r.data),
  errorCount: () => api.get<{ count: number }>('/api/logs/error-count').then(r => r.data.count),
  write: (level: LogEntry['level'], source: string, message: string) =>
    api.post('/api/logs', { level, source, message }),
  clear: () => api.delete('/api/logs'),
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
export const schedulerApi = {
  runNow: () => api.post('/api/scheduler/run'),
  restart: () => api.post('/api/scheduler/restart'),
}

// ─── Cleanup Job ──────────────────────────────────────────────────────────────
export interface CleanupJobStatus {
  enabled: boolean
  intervalHours: number
  lastRun: string | null
  running: boolean
}
export interface CleanupRunResult {
  deleted: string[]
  skipped: boolean
}

export const cleanupApi = {
  status: () => api.get<CleanupJobStatus>('/api/scheduler/cleanup').then(r => r.data),
  runNow: () => api.post<CleanupRunResult>('/api/scheduler/cleanup/run').then(r => r.data),
  restart: () => api.post('/api/scheduler/cleanup/restart'),
}

// ─── System ───────────────────────────────────────────────────────────────────
export const systemApi = {
  disk: () => api.get<DiskSpaceDto>('/api/system/disk').then(r => r.data),
  health: () => api.get<HealthDto>('/api/system/health').then(r => r.data),
  version: () => api.get<{ version: string }>('/api/system/version').then(r => r.data),
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export interface WatchHistoryEntry {
  id: number
  watchedAt: string
  durationSec: number
  completed: boolean
  mode: string
  user: { id: number; name: string }
  mediaFile: {
    id: number
    movie: { id: number; title: string; year: number | null; posterPath: string | null } | null
    episode: {
      id: number
      episodeNumber: number
      title: string | null
      show: { id: number; title: string; posterPath: string | null }
      season: { seasonNumber: number }
    } | null
  }
}
export interface NowPlayingEntry {
  userId: number
  userName: string
  mediaFileId: number
  position: number
  duration: number
  mode: string
  quality: string
  lastSeen: number
  mediaFile: {
    id: number
    movie: { id: number; title: string; year: number | null; posterPath: string | null } | null
    episode: {
      id: number
      episodeNumber: number
      title: string | null
      show: { id: number; title: string; posterPath: string | null }
      season: { seasonNumber: number }
    } | null
  } | null
}
export interface StatsDto {
  library: { movies: number; shows: number; episodes: number; mediaFiles: number }
  totalPlays: number
  nowPlaying: NowPlayingEntry[]
  recentHistory: WatchHistoryEntry[]
  topMovies: Array<{ movie: { id: number; title: string; year: number | null; posterPath: string | null }; playCount: number }>
  topShows: Array<{ show: { id: number; title: string; posterPath: string | null }; playCount: number }>
  playsByDay: Array<{ date: string; count: number }>
}
export const statsApi = {
  get: () => api.get<StatsDto>('/api/stats').then(r => r.data),
}

// ─── Users ────────────────────────────────────────────────────────────────────
export interface UserDto {
  id: number
  email: string
  name: string
  role: string
  createdAt: string
}

export const usersApi = {
  list: () => api.get<UserDto[]>('/api/users').then(r => r.data),
  changePassword: (id: number, password: string, currentPassword?: string) =>
    api.patch(`/api/users/${id}`, { password, currentPassword }).then(r => r.data),
  remove: (id: number) => api.delete(`/api/users/${id}`),
}

export interface OptimizationProfile {
  id: number
  name: string
  videoMode: 'copy_always' | 'copy_compatible' | 'reencode'
  videoCodec: 'h264' | 'hevc'
  videoCrf: number
  videoPreset: string
  audioMode: 'copy' | 'reencode'
  audioChannels: number
  audioBitrate: number
  useHwEncoder: boolean
  applyToNew: boolean
  createdAt: string
}

export interface OptimizationJob {
  id: number
  mediaFileId: number
  profileId: number
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  startedAt: string | null
  completedAt: string | null
  error: string | null
  originalSize: number | null
  optimizedSize: number | null
  createdAt: string
  mediaFile: { id: number; path: string; size: number; codec: string | null }
  profile: { id: number; name: string }
}

export const optimizationApi = {
  listProfiles: () =>
    api.get<OptimizationProfile[]>('/api/optimization/profiles').then(r => r.data),
  createProfile: (data: Omit<OptimizationProfile, 'id' | 'createdAt'>) =>
    api.post<OptimizationProfile>('/api/optimization/profiles', data).then(r => r.data),
  updateProfile: (id: number, data: Partial<Omit<OptimizationProfile, 'id' | 'createdAt'>>) =>
    api.patch<OptimizationProfile>(`/api/optimization/profiles/${id}`, data).then(r => r.data),
  deleteProfile: (id: number) =>
    api.delete(`/api/optimization/profiles/${id}`),

  listJobs: (params?: { status?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.limit) qs.set('limit', String(params.limit))
    return api.get<OptimizationJob[]>(`/api/optimization/jobs?${qs}`).then(r => r.data)
  },
  queueJobs: (mediaFileIds: number[], profileId: number) =>
    api.post<{ queued: number }>('/api/optimization/jobs', { mediaFileIds, profileId }).then(r => r.data),
  cancelJob: (id: number) =>
    api.delete(`/api/optimization/jobs/${id}`),
  clearJobs: () =>
    api.delete('/api/optimization/jobs'),

  setMovieProfile: (movieId: number, profileId: number | null) =>
    api.patch(`/api/optimization/movies/${movieId}/profile`, { profileId }).then(r => r.data),
  setShowProfile: (showId: number, profileId: number | null) =>
    api.patch(`/api/optimization/shows/${showId}/profile`, { profileId }).then(r => r.data),
}

// ─── Notifications ────────────────────────────────────────────────────────────
export interface NotificationEndpointDto {
  id: number
  name: string
  type: string
  url: string
  token: string | null
  chatId: string | null
  enabled: boolean
  events: string
}
export const notificationsApi = {
  list: () => api.get<NotificationEndpointDto[]>('/api/notifications').then(r => r.data),
  create: (body: Omit<NotificationEndpointDto, 'id'>) => api.post<NotificationEndpointDto>('/api/notifications', body).then(r => r.data),
  update: (id: number, body: Partial<Omit<NotificationEndpointDto, 'id'>>) => api.patch<NotificationEndpointDto>(`/api/notifications/${id}`, body).then(r => r.data),
  remove: (id: number) => api.delete(`/api/notifications/${id}`),
  test: (id: number) => api.post<{ ok: boolean }>(`/api/notifications/${id}/test`).then(r => r.data),
}

// ─── Backup ───────────────────────────────────────────────────────────────────
export const backupApi = {
  downloadDb: (token: string) => { window.open(`/api/backup/db?token=${encodeURIComponent(token)}`, '_blank') },
  getSettings: () => api.get<Record<string, string>>('/api/backup/settings').then(r => r.data),
  importSettings: (settings: Record<string, string>) => api.post('/api/backup/settings', settings),
}

// ─── Ratings ─────────────────────────────────────────────────────────────────
export interface RatingsMap {
  movies: Record<number, number>
  shows: Record<number, number>
}
export const ratingsApi = {
  get: () => api.get<RatingsMap>('/api/ratings').then(r => r.data),
  rateMovie: (id: number, rating: number) => api.put(`/api/ratings/movie/${id}`, { rating }),
  rateShow: (id: number, rating: number) => api.put(`/api/ratings/show/${id}`, { rating }),
}

// ─── Watchlist ────────────────────────────────────────────────────────────────
export interface WatchlistItemDto {
  id: number
  addedAt: string
  movie: { id: number; title: string; year: number | null; posterPath: string | null; status: string } | null
  show: { id: number; title: string; posterPath: string | null; status: string } | null
}
export const watchlistApi = {
  list: () => api.get<WatchlistItemDto[]>('/api/watchlist').then(r => r.data),
  addMovie: (id: number) => api.post(`/api/watchlist/movie/${id}`),
  removeMovie: (id: number) => api.delete(`/api/watchlist/movie/${id}`),
  addShow: (id: number) => api.post(`/api/watchlist/show/${id}`),
  removeShow: (id: number) => api.delete(`/api/watchlist/show/${id}`),
}

