export interface ParsedVideoUrl {
  ok: true
  kind: 'video'
  videoId: string
  canonicalUrl: string
}

export interface ParsedPlaylistUrl {
  ok: true
  kind: 'playlist'
  playlistId: string
  canonicalUrl: string
}

export interface ParsedUrlError {
  ok: false
  message: string
}

export type ParseYouTubeResult = ParsedVideoUrl | ParsedPlaylistUrl | ParsedUrlError

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,128}$/
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be'
])

export function parseYouTubeUrl(raw: string): ParseYouTubeResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, message: 'Paste a YouTube link first.' }
  }

  let candidate = trimmed
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    candidate = `https://${candidate}`
  }

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return { ok: false, message: 'That does not look like a valid link.' }
  }

  const host = url.hostname.toLowerCase()
  if (!YOUTUBE_HOSTS.has(host)) {
    return { ok: false, message: 'Only YouTube video and playlist links are supported.' }
  }

  const path = url.pathname.replace(/\/+$/, '')

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const id = path.split('/').filter(Boolean)[0] ?? ''
    return videoResult(id)
  }

  if (path === '/playlist') {
    const list = url.searchParams.get('list') ?? ''
    return playlistResult(list)
  }

  if (path === '/watch') {
    const videoId = url.searchParams.get('v') ?? ''
    if (videoId) return videoResult(videoId)
    const list = url.searchParams.get('list') ?? ''
    if (list) return playlistResult(list)
    return { ok: false, message: 'That YouTube link has no video attached.' }
  }

  const shorts = path.match(/^\/shorts\/([^/]+)$/)
  if (shorts) return videoResult(shorts[1] ?? '')

  const live = path.match(/^\/live\/([^/]+)$/)
  if (live) return videoResult(live[1] ?? '')

  const embed = path.match(/^\/embed\/([^/]+)$/)
  if (embed) return videoResult(embed[1] ?? '')

  if (path.startsWith('/@') || path.startsWith('/channel') || path.startsWith('/c/')) {
    return {
      ok: false,
      message: 'Channel links are not supported. Paste a video, Shorts, or playlist link.'
    }
  }

  return {
    ok: false,
    message: 'That YouTube link is not a video, Shorts, or playlist link.'
  }
}

function videoResult(id: string): ParseYouTubeResult {
  if (!VIDEO_ID.test(id)) {
    return { ok: false, message: 'That YouTube video ID looks invalid.' }
  }
  return {
    ok: true,
    kind: 'video',
    videoId: id,
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`
  }
}

function playlistResult(id: string): ParseYouTubeResult {
  if (!PLAYLIST_ID.test(id)) {
    return { ok: false, message: 'That YouTube playlist ID looks invalid.' }
  }
  return {
    ok: true,
    kind: 'playlist',
    playlistId: id,
    canonicalUrl: `https://www.youtube.com/playlist?list=${id}`
  }
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (!totalSeconds || totalSeconds <= 0 || !Number.isFinite(totalSeconds)) return '—'
  const seconds = Math.round(totalSeconds)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
  }
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}

export function formatLongDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '—'
  const seconds = Math.round(totalSeconds)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatTokenCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}
