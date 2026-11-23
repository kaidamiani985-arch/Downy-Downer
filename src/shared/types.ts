export type MediaKind = 'video' | 'audio'
export type Quality = 'best' | '2160' | '1440' | '1080' | '720' | '480' | '360'
export type Container = 'mp4' | 'mkv'
export type AudioFormat = 'mp3' | 'm4a' | 'opus'
export type AudioBitrate = 'best' | '320' | '192' | '128'
export type ItemStatus =
  | 'queued'
  | 'downloading'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
export type DownloadPhase = 'preparing' | 'video' | 'audio' | 'merge' | 'convert' | 'done'
export type CookiesBrowser = 'none' | 'chrome' | 'safari' | 'firefox' | 'brave' | 'edge'

export interface QueueItem {
  id: string
  videoId: string
  url: string
  title: string
  channel: string
  duration: number
  thumbnail: string
  playlistId: string | null
  status: ItemStatus
  kind: MediaKind
  quality: Quality
  container: Container
  audioFormat: AudioFormat
  audioBitrate: AudioBitrate
  progress: number
  phase: DownloadPhase | null
  speed: string | null
  eta: string | null
  downloadedLabel: string | null
  error: string | null
  outputPath: string | null
  charge: number | null
  addedAt: number
  completedAt: number | null
}

export interface PlaylistGroup {
  id: string
  title: string
  channel: string
  url: string
  thumbnail: string
  itemIds: string[]
  addedAt: number
}

export interface WalletTransaction {
  id: string
  type: 'earn' | 'spend' | 'refund'
  amount: number
  reason: string
  at: number
  itemId?: string
  runTokens?: number
}

export interface WalletSnapshot {
  balance: number
  lifetimeEarned: number
  lifetimeSpent: number
  bestRunTokens: number
  transactions: WalletTransaction[]
}

export interface Settings {
  outputDir: string
  hasChosenOutputDir: boolean
  defaultKind: MediaKind
  defaultQuality: Quality
  defaultContainer: Container
  defaultAudioFormat: AudioFormat
  defaultAudioBitrate: AudioBitrate
  soundEnabled: boolean
  revealWhenDone: boolean
  cookiesBrowser: CookiesBrowser
  autoCheckYtdlp: boolean
  lastYtdlpCheck: number | null
}

export interface ActiveDownload {
  batchId: string
  currentItemId: string | null
  currentIndex: number
  total: number
  startedAt: number
  completed: number
  failed: number
}

export interface AppSnapshot {
  wallet: WalletSnapshot
  settings: Settings
  queue: QueueItem[]
  playlists: PlaylistGroup[]
  active: ActiveDownload | null
  version: string
}

export interface Quote {
  perItem: Record<string, number>
  total: number
  discountedPlaylistIds: string[]
}

export interface ItemOptionsPatch {
  kind?: MediaKind
  quality?: Quality
  container?: Container
  audioFormat?: AudioFormat
  audioBitrate?: AudioBitrate
}

export interface AddUrlResult {
  ok: boolean
  kind: 'video' | 'playlist' | 'none'
  message: string
  addedItemIds: string[]
  playlistId?: string
  addedCount: number
  skippedCount: number
}

export interface StartResult {
  ok: boolean
  message?: string
  code?: 'INSUFFICIENT_TOKENS' | 'BUSY' | 'NO_OUTPUT' | 'INVALID' | 'ERROR'
  quote?: Quote
  balance?: number
  total?: number
  shortfall?: number
}

export interface ActionResult {
  ok: boolean
  message?: string
}

export interface ResetSaveResult {
  ok: boolean
  canceled?: boolean
  message?: string
}

export interface ProgressUpdate {
  itemId: string
  progress: number
  phase: DownloadPhase | null
  speed: string | null
  eta: string | null
  downloadedLabel: string | null
}

export interface ToolVersions {
  ytdlp: string
  deno: string
  ffmpeg: string
}

export interface ToolsInfo {
  versions: ToolVersions
  paths: {
    ytdlp: string
    deno: string
    ffmpeg: string
  }
  error?: string
}

export interface UpdateCheck {
  ok: boolean
  current?: string
  latest?: string
  updateAvailable?: boolean
  message?: string
}

export interface ToastPayload {
  type: 'info' | 'success' | 'error'
  message: string
}

export interface PersistedState {
  schemaVersion: 1
  wallet: WalletSnapshot
  settings: Settings
  queue: QueueItem[]
  playlists: PlaylistGroup[]
  charges: Record<string, { amount: number; batchId: string; at: number }>
}
