// ─── Enums ────────────────────────────────────────────────────────────────────

export type MediaStatus = 'wanted' | 'downloading' | 'downloaded' | 'missing' | 'unmonitored';
export type DownloadType = 'torrent' | 'usenet';
export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'importing' | 'verifying';
export type IndexerType = 'torznab' | 'newznab';
export type UserRole = 'admin' | 'user';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginRequest { email: string; password: string; }
export interface RegisterRequest { email: string; password: string; name: string; }
export interface AuthResponse { token: string; user: UserDto; }
export interface UserDto { id: number; email: string; name: string; role: UserRole; }

// ─── Movies ───────────────────────────────────────────────────────────────────

export interface MovieDto {
  id: number;
  tmdbId: number;
  imdbId: string | null;
  title: string;
  year: number | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  runtime: number | null;
  rating: number | null;
  status: MediaStatus;
  monitored: boolean;
  qualityProfileId: number | null;
  added: string;
  mediaFiles: MediaFileDto[];
}

export interface AddMovieRequest {
  tmdbId: number;
  qualityProfileId?: number;
  monitored?: boolean;
}

// ─── Shows ────────────────────────────────────────────────────────────────────

export interface ShowDto {
  id: number;
  tmdbId: number;
  tvdbId: number | null;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  status: MediaStatus;
  monitored: boolean;
  qualityProfileId: number | null;
  added: string;
  seasons: SeasonDto[];
}

export interface SeasonDto {
  id: number;
  showId: number;
  seasonNumber: number;
  episodeCount: number;
  posterPath: string | null;
  episodes: EpisodeDto[];
}

export interface EpisodeDto {
  id: number;
  showId: number;
  seasonId: number;
  episodeNumber: number;
  title: string | null;
  overview: string | null;
  airDate: string | null;
  status: MediaStatus;
  monitored: boolean;
  mediaFiles: MediaFileDto[];
}

export interface AddShowRequest {
  tmdbId: number;
  qualityProfileId?: number;
  monitored?: boolean;
}

// ─── Media Files ──────────────────────────────────────────────────────────────

export interface MediaFileDto {
  id: number;
  path: string;
  size: number;
  codec: string | null;
  resolution: string | null;
  container: string | null;
  duration: number | null;
  addedAt: string;
}

// ─── Downloads ────────────────────────────────────────────────────────────────

export interface DownloadDto {
  id: number;
  type: DownloadType;
  title: string;
  status: DownloadStatus;
  progress: number;
  size: number | null;
  speed: number | null;
  eta: number | null;
  error: string | null;
  movieId: number | null;
  episodeId: number | null;
  infoHash: string | null;
  queuePos: number;
  connections: number | null;
  addedAt: string;
}

export interface AddTorrentRequest {
  magnetOrUrl: string;
  movieId?: number;
  episodeId?: number;
}

export interface AddNzbRequest {
  nzbUrl: string;
  movieId?: number;
  episodeId?: number;
}

// ─── Indexers ─────────────────────────────────────────────────────────────────

export interface IndexerDto {
  id: number;
  name: string;
  type: IndexerType;
  url: string;
  apiKey: string;
  enabled: boolean;
  priority: number;
}

export interface CreateIndexerRequest {
  name: string;
  type: IndexerType;
  url: string;
  apiKey: string;
  enabled?: boolean;
  priority?: number;
}

export interface IndexerSearchResult {
  title: string;
  size: number;
  seeders: number;
  leechers: number;
  link: string;
  magnetUrl: string | null;
  infoHash: string | null;
  indexerId: number;
  publishDate: string | null;
}

// ─── Quality Profiles ─────────────────────────────────────────────────────────

export interface QualityItem {
  resolution: '480p' | '720p' | '1080p' | '2160p';
  sources: Array<'cam' | 'telesync' | 'dvd' | 'webrip' | 'webdl' | 'bluray'>;
  minScore: number;
}

export interface QualityProfileDto {
  id: number;
  name: string;
  items: QualityItem[];
  upgradeAllowed: boolean;
  minScore: number;
}

export interface CreateQualityProfileRequest {
  name: string;
  items: QualityItem[];
  upgradeAllowed?: boolean;
  minScore?: number;
}

// ─── Usenet Servers ───────────────────────────────────────────────────────────

export interface UsenetServerDto {
  id: number;
  name: string;
  host: string;
  port: number;
  ssl: boolean;
  username: string;
  maxConnections: number;
  enabled: boolean;
}

export interface CreateUsenetServerRequest {
  name: string;
  host: string;
  port: number;
  ssl: boolean;
  username: string;
  password: string;
  maxConnections: number;
}

// ─── TMDB Search ──────────────────────────────────────────────────────────────

export interface TmdbMovieResult {
  tmdbId: number;
  title: string;
  year: number | null;
  overview: string | null;
  posterPath: string | null;
  rating: number | null;
}

export interface TmdbShowResult {
  tmdbId: number;
  title: string;
  year: number | null;
  overview: string | null;
  posterPath: string | null;
  rating: number | null;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface SettingDto { key: string; value: string; }

// ─── Playback ─────────────────────────────────────────────────────────────────

export interface PlaybackPositionDto {
  mediaFileId: number;
  position: number;
  duration: number;
  updatedAt: string;
}
