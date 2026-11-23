import { spawn } from 'node:child_process'
import type { CookiesBrowser, QueueItem, Settings } from '../shared/types'
import type { ParseYouTubeResult } from '../shared/youtube'
import type { BinaryManager } from './binaries'

export interface FetchedVideo {
  videoId: string
  url: string
  title: string
  channel: string
  duration: number
  thumbnail: string
}

export interface FetchedPlaylist {
  title: string
  channel: string
  url: string
  thumbnail: string
  entries: FetchedVideo[]
  skipped: number
}

export type FetchResult =
  | { kind: 'video'; video: FetchedVideo }
  | { kind: 'playlist'; playlist: FetchedPlaylist }

interface CaptureResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  timedOut: boolean
}

interface YtdlpInfo {
  _type?: string
  id?: string
  title?: string
  channel?: string
  uploader?: string
  duration?: number | string | null
  thumbnails?: Array<{ url?: string }>
  entries?: YtdlpInfo[]
  is_live?: boolean
  live_status?: string
  url?: string
  webpage_url?: string
}

export class YtDlpService {
  constructor(
    private readonly binaries: BinaryManager,
    private readonly getSettings: () => Settings
  ) {}

  async fetch(parsed: ParseYouTubeResult): Promise<FetchResult> {
    if (!parsed.ok) throw new Error(parsed.message)

    const args = this.baseArgs()
    args.push('-J', '--socket-timeout', '20')

    if (parsed.kind === 'playlist') {
      args.push('--flat-playlist', '--ignore-errors')
    } else {
      args.push('--no-playlist')
    }
    args.push(parsed.canonicalUrl)

    const result = await runCapture(this.binaries.ytdlp, args, 180_000)
    if (result.timedOut) {
      throw new Error('Timed out while reading that link from YouTube. Try again.')
    }

    const info = parseJsonInfo(result.stdout)
    if (!info || (!info.id && !Array.isArray(info.entries) && !info.title)) {
      throw new Error(friendlyError(result, 'Could not read that YouTube link.'))
    }

    if (parsed.kind === 'video') {
      if (!info.id || info._type === 'playlist') {
        throw new Error('That link resolved to a playlist. Paste the video link instead.')
      }
      if (info.is_live || info.live_status === 'is_live' || info.live_status === 'is_upcoming') {
        throw new Error('Live streams are not supported yet. Try again after the stream ends.')
      }
      return { kind: 'video', video: mapVideo(info) }
    }

    const rawEntries = Array.isArray(info.entries) ? info.entries : []
    const entries: FetchedVideo[] = []
    let skipped = 0

    for (const entry of rawEntries) {
      const video = mapPlaylistEntry(entry)
      if (!video) {
        skipped += 1
        continue
      }
      if (entry.live_status === 'is_live' || entry.live_status === 'is_upcoming' || entry.is_live) {
        skipped += 1
        continue
      }
      entries.push(video)
    }

    if (entries.length === 0) {
      throw new Error(
        rawEntries.length > 0
          ? 'No downloadable videos were found in that playlist.'
          : friendlyError(result, 'That playlist appears to be empty.')
      )
    }

    const playlist: FetchedPlaylist = {
      title: cleanText(info.title) || 'YouTube playlist',
      channel: cleanText(info.channel) || cleanText(info.uploader) || entries[0]?.channel || 'YouTube',
      url: parsed.canonicalUrl,
      thumbnail: thumbnailFor(info.thumbnails, entries[0]?.videoId ?? ''),
      entries,
      skipped
    }

    return { kind: 'playlist', playlist }
  }

  buildDownloadArgs(item: QueueItem, outputDir: string, settings: Settings): string[] {
    const args = this.baseArgs()
    args.push(
      '--no-playlist',
      '--newline',
      '--no-quiet',
      '--no-warnings',
      '--no-mtime',
      '--trim-filenames',
      '150',
      '--retries',
      '3',
      '--socket-timeout',
      '20',
      '--no-simulate',
      '--print',
      'after_move:filepath',
      '--ffmpeg-location',
      this.binaries.binDir,
      '-P',
      outputDir,
      '-o',
      '%(title)s.%(ext)s'
    )

    if (item.kind === 'audio') {
      args.push(
        '-f',
        'bestaudio/best',
        '-x',
        '--audio-format',
        item.audioFormat,
        '--audio-quality',
        item.audioBitrate === 'best' ? '0' : `${item.audioBitrate}K`
      )
    } else if (item.container === 'mp4') {
      if (item.quality === 'best') {
        args.push('-f', 'bestvideo*+bestaudio/best', '--merge-output-format', 'mp4')
      } else {
        const height = Number(item.quality)
        const selector =
          height <= 1080
            ? `bestvideo*[height<=${height}][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo*[height<=${height}]+bestaudio/best[height<=${height}]`
            : `bestvideo*[height<=${height}]+bestaudio/best[height<=${height}]`
        args.push('-f', selector, '--merge-output-format', 'mp4')
      }
    } else {
      const selector =
        item.quality === 'best'
          ? 'bestvideo*+bestaudio/best'
          : `bestvideo*[height<=${item.quality}]+bestaudio/best[height<=${item.quality}]`
      args.push('-f', selector, '--merge-output-format', 'mkv')
    }

    args.push(item.url)
    return args
  }

  private baseArgs(): string[] {
    const settings = this.getSettings()
    const args = ['--js-runtimes', `deno:${this.binaries.deno}`]
    this.addCookieArgs(args, settings)
    return args
  }

  private addCookieArgs(args: string[], settings: Settings): void {
    const browser = settings.cookiesBrowser
    if (browser && browser !== 'none') {
      args.push('--cookies-from-browser', browserForYtdlp(browser))
    }
  }
}

function browserForYtdlp(browser: CookiesBrowser): string {
  return browser
}

function mapVideo(info: YtdlpInfo): FetchedVideo {
  const id = String(info.id ?? '').trim()
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    throw new Error('YouTube did not return a valid video ID for that link.')
  }
  return {
    videoId: id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: cleanText(info.title) || 'Untitled video',
    channel: cleanText(info.channel) || cleanText(info.uploader) || 'YouTube',
    duration: toDuration(info.duration),
    thumbnail: thumbnailFor(info.thumbnails, id)
  }
}

function mapPlaylistEntry(entry: YtdlpInfo): FetchedVideo | null {
  let id = String(entry.id ?? '').trim()
  if (!/^[A-Za-z0-9_-]{11}$/.test(id) && entry.url) {
    try {
      const url = new URL(entry.url)
      id = url.searchParams.get('v') ?? url.pathname.split('/').filter(Boolean).pop() ?? ''
    } catch {
      // Fall through to the invalid check.
    }
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null
  const title = cleanText(entry.title)
  if (!title || /^\[?(private|deleted|unavailable) video\]?$/i.test(title)) return null
  return {
    videoId: id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title,
    channel: cleanText(entry.channel) || cleanText(entry.uploader) || 'YouTube',
    duration: toDuration(entry.duration),
    thumbnail: thumbnailFor(entry.thumbnails, id)
  }
}

function parseJsonInfo(stdout: string): YtdlpInfo | null {
  const trimmed = stdout.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as YtdlpInfo
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as YtdlpInfo
      } catch {
        return null
      }
    }
    return null
  }
}

function cleanText(value: string | undefined | null): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toDuration(value: number | string | null | undefined): number {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function thumbnailFor(thumbnails: Array<{ url?: string }> | undefined, videoId: string): string {
  const valid = Array.isArray(thumbnails)
    ? thumbnails.map((thumbnail) => thumbnail.url).filter((url): url is string => Boolean(url))
    : []
  return valid.at(-1) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

export function friendlyError(result: { stderr: string; stdout: string; code: number | null; timedOut?: boolean }, fallback: string): string {
  if (result.timedOut) return 'Timed out while talking to YouTube. Try again.'
  const combined = `${result.stderr}\n${result.stdout}`.trim()
  const lower = combined.toLowerCase()

  if (lower.includes('sign in to confirm') || lower.includes('not a bot') || lower.includes('confirm you’re not a bot')) {
    return 'YouTube asked for a sign-in check. Open Settings → Advanced and try using cookies from your browser, or update yt-dlp.'
  }
  if (lower.includes('private video') || lower.includes('this video is private')) {
    return 'This video is private.'
  }
  if (lower.includes('members-only') || lower.includes('join this channel')) {
    return 'This video is members-only.'
  }
  if (lower.includes('video unavailable') || lower.includes('this video is unavailable')) {
    return 'This video is unavailable.'
  }
  if (lower.includes('http error 429') || lower.includes('too many requests')) {
    return 'YouTube is rate-limiting downloads. Wait a few minutes, then try again.'
  }
  if (lower.includes('no supported javascript runtime')) {
    return 'The bundled JavaScript runtime did not launch. Try reinstalling the app.'
  }
  if (lower.includes('ffmpeg') && (lower.includes('not found') || lower.includes('not installed'))) {
    return 'The bundled FFmpeg tools could not be found. Try reinstalling the app.'
  }
  if (lower.includes('requested format is not available')) {
    return 'That quality is not available for this video. Choose another quality.'
  }
  if (lower.includes('unsupported url')) {
    return 'That YouTube link is not supported.'
  }
  if (lower.includes('live stream') || lower.includes('is live')) {
    return 'Live streams are not supported yet.'
  }
  if (lower.includes('playlist does not exist') || lower.includes('does not exist')) {
    return 'That playlist could not be found.'
  }
  if (lower.includes('unable to extract')) {
    return 'YouTube changed something or this video is unavailable. Try updating yt-dlp in Settings → Advanced.'
  }
  if (lower.includes('timed out')) {
    return 'The request timed out. Check your connection and try again.'
  }

  const lines = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('[debug]'))

  const errorLine = lines.find((line) => /^error:/i.test(line)) ?? lines.at(-1)
  if (errorLine) {
    return errorLine.replace(/^error:\s*/i, '').replace(/^\[[^\]]+\]\s*/, '').slice(0, 300)
  }
  return `${fallback}${result.code !== null ? ` (yt-dlp exited with code ${result.code})` : ''}`
}

export function runCapture(binary: string, args: string[], timeoutMs: number): Promise<CaptureResult> {
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(killTimer)
      resolve({ code, signal, stdout, stderr, timedOut })
    }

    const killTimer = setTimeout(() => {
      if (!settled) child.kill('SIGKILL')
    }, timeoutMs + 3_000)

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      stderr += `\n${error.message}`
      finish(null, null)
    })
    child.on('close', (code, signal) => {
      finish(code, signal)
    })
  })
}
