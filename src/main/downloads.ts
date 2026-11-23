import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, Notification, shell } from 'electron'
import { COST_PER_ITEM } from '../shared/pricing'
import type {
  ActiveDownload,
  DownloadPhase,
  ProgressUpdate,
  QueueItem,
  StartResult,
  ToastPayload
} from '../shared/types'
import type { BinaryManager } from './binaries'
import type { Store } from './store'
import { friendlyError } from './ytdlp'
import type { YtDlpService } from './ytdlp'

interface DownloadEvents {
  onState: () => void
  onProgress: (update: ProgressUpdate) => void
  onToast: (toast: ToastPayload) => void
}

interface Batch {
  id: string
  ids: string[]
  index: number
  outputDir: string
  quote: { perItem: Record<string, number>; total: number; discountedPlaylistIds: string[] }
  canceled: boolean
  currentItemId: string | null
  startedAt: number
  completed: number
  failed: number
}

interface ItemRunResult {
  success: boolean
  canceled: boolean
  outputPath: string | null
  error: string | null
}

export class DownloadManager {
  private batch: Batch | null = null
  private child: ChildProcess | null = null
  private shuttingDown = false
  private progressSentAt = 0

  constructor(
    private readonly store: Store,
    private readonly binaries: BinaryManager,
    private readonly ytdlp: YtDlpService,
    private readonly win: BrowserWindow,
    private readonly events: DownloadEvents
  ) {}

  getActive(): ActiveDownload | null {
    if (!this.batch) return null
    return {
      batchId: this.batch.id,
      currentItemId: this.batch.currentItemId,
      currentIndex: this.batch.index,
      total: this.batch.ids.length,
      startedAt: this.batch.startedAt,
      completed: this.batch.completed,
      failed: this.batch.failed
    }
  }

  start(ids: string[]): StartResult {
    if (this.batch) {
      return { ok: false, code: 'BUSY', message: 'A download is already running.' }
    }

    const uniqueIds = [...new Set(ids)].filter((id) => Boolean(this.store.findItem(id)))
    if (uniqueIds.length === 0) {
      return { ok: false, code: 'INVALID', message: 'Select at least one queue item.' }
    }

    const quote = this.store.quote(uniqueIds)
    const balance = this.store.walletSnapshot().balance
    if (quote.total > balance) {
      return {
        ok: false,
        code: 'INSUFFICIENT_TOKENS',
        message: 'Not enough download tokens.',
        quote,
        balance,
        total: quote.total,
        shortfall: quote.total - balance
      }
    }

    const outputDir = this.store.data.settings.outputDir
    try {
      fs.mkdirSync(outputDir, { recursive: true })
      fs.accessSync(outputDir, fs.constants.W_OK)
    } catch {
      return {
        ok: false,
        code: 'NO_OUTPUT',
        message: 'That output folder cannot be written to. Choose another folder.'
      }
    }

    this.batch = {
      id: crypto.randomUUID(),
      ids: uniqueIds,
      index: 0,
      outputDir,
      quote,
      canceled: false,
      currentItemId: null,
      startedAt: Date.now(),
      completed: 0,
      failed: 0
    }

    this.events.onState()
    void this.runBatch()
    return { ok: true, quote, balance, total: quote.total }
  }

  cancel(): void {
    if (!this.batch) return
    this.batch.canceled = true
    this.killCurrent()
    this.events.onToast({ type: 'info', message: 'Stopping download and refunding tokens…' })
  }

  shutdown(): void {
    if (this.shuttingDown) return
    this.shuttingDown = true
    const batch = this.batch
    if (batch) {
      batch.canceled = true
      this.killCurrent()
      if (batch.currentItemId) {
        const item = this.store.findItem(batch.currentItemId)
        if (item && (item.status === 'downloading' || item.status === 'processing')) {
          this.store.failItem(
            batch.currentItemId,
            'interrupted',
            'The app quit while this download was running. Your tokens were refunded.'
          )
        }
      }
      this.batch = null
    }
    this.child = null
    this.store.flush()
    if (!this.win.isDestroyed()) this.win.setProgressBar(-1)
  }

  private async runBatch(): Promise<void> {
    const batch = this.batch
    if (!batch) return

    for (let index = 0; index < batch.ids.length; index += 1) {
      if (!this.batch || this.batch.canceled || this.shuttingDown) break
      const id = batch.ids[index]
      if (!id) continue
      const item = this.store.findItem(id)
      if (!item) continue

      batch.index = index
      batch.currentItemId = id
      const amount = batch.quote.perItem[id] ?? COST_PER_ITEM

      try {
        this.store.beginItem(id, amount, batch.id)
      } catch (error) {
        this.store.failItem(
          id,
          'failed',
          error instanceof Error ? error.message : 'Could not start this download.'
        )
        batch.failed += 1
        this.events.onState()
        this.events.onToast({
          type: 'error',
          message: error instanceof Error ? error.message : 'Could not start this download.'
        })
        continue
      }

      this.events.onState()
      this.setDockProgress(0)

      const result = await this.runItem(item, batch)

      if (this.shuttingDown) break

      if (result.success) {
        const completed = this.store.completeItem(id, result.outputPath)
        batch.completed += 1
        this.events.onState()
        this.setDockProgress(-1)
        if (completed) this.notifyComplete(completed)
      } else {
        const canceled = result.canceled || batch.canceled
        const status = canceled ? 'cancelled' : 'failed'
        const refunded = this.store.failItem(id, status, result.error ?? 'Download failed.')
        if (status === 'failed') batch.failed += 1
        this.events.onState()
        this.setDockProgress(-1)

        if (status === 'failed') {
          this.events.onToast({
            type: 'error',
            message: `${result.error ?? 'Download failed.'}${refunded > 0 ? ` ${refunded} token${refunded === 1 ? '' : 's'} refunded.` : ''}`
          })
        }
      }

      batch.currentItemId = null
      if (batch.canceled) break
    }

    if (!this.batch) return
    const finished = this.batch
    this.batch = null
    this.child = null
    this.setDockProgress(-1)
    this.events.onState()

    if (this.shuttingDown) return
    if (finished.canceled) {
      this.events.onToast({ type: 'info', message: 'Download stopped. Any charged tokens were refunded.' })
      return
    }
    if (finished.failed === 0) {
      this.events.onToast({
        type: 'success',
        message: `Downloaded ${finished.completed} ${finished.completed === 1 ? 'item' : 'items'}.`
      })
    } else if (finished.completed > 0) {
      this.events.onToast({
        type: 'info',
        message: `${finished.completed} downloaded, ${finished.failed} failed. Failed tokens were refunded.`
      })
    }
  }

  private runItem(item: QueueItem, batch: Batch): Promise<ItemRunResult> {
    return new Promise((resolve) => {
      if (batch.canceled || this.shuttingDown) {
        resolve({ success: false, canceled: true, outputPath: null, error: 'Download cancelled.' })
        return
      }

      const args = this.ytdlp.buildDownloadArgs(item, batch.outputDir, this.store.data.settings)
      const startedAt = Date.now()
      const child = spawn(this.binaries.ytdlp, args, {
        cwd: batch.outputDir,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32'
      })
      this.child = child

      let stdoutBuffer = ''
      let stderrBuffer = ''
      const stderrLines: string[] = []
      let outputPath: string | null = null
      let destinationCount = 0
      let phase: DownloadPhase = item.kind === 'audio' ? 'audio' : 'video'
      let progress = 0
      let speed: string | null = null
      let eta: string | null = null
      let sizeLabel: string | null = null
      let settled = false

      const emitProgress = (force = false) => {
        const now = Date.now()
        if (!force && now - this.progressSentAt < 70 && progress < 100) return
        this.progressSentAt = now
        this.store.updateProgress(item.id, { progress, phase, speed, eta, downloadedLabel: sizeLabel })
        this.events.onProgress({
          itemId: item.id,
          progress,
          phase,
          speed,
          eta,
          downloadedLabel: sizeLabel
        })
        this.setDockProgress(progress / 100)
      }

      const setPhase = (next: DownloadPhase) => {
        if (phase === next) return
        phase = next
        emitProgress(true)
      }

      const handleLine = (rawLine: string) => {
        const line = rawLine.replace(/\r$/, '').trimEnd()
        if (!line) return

        if (line.includes('[download] Destination:')) {
          destinationCount += 1
          if (item.kind === 'audio') setPhase('audio')
          else if (destinationCount === 1) setPhase('video')
          else setPhase('audio')
          progress = 0
          emitProgress(true)
          return
        }

        if (line.includes('[Merger]')) {
          const match = line.match(/Merging formats into "(.+)"/)
          if (match?.[1]) outputPath = path.resolve(batch.outputDir, match[1])
          progress = 100
          setPhase('merge')
          emitProgress(true)
          return
        }

        if (line.includes('[ExtractAudio]')) {
          const match = line.match(/\[ExtractAudio\] Destination: (.+)$/)
          if (match?.[1]) outputPath = path.resolve(batch.outputDir, match[1])
          progress = 100
          setPhase('convert')
          emitProgress(true)
          return
        }

        if (line.includes('has already been downloaded')) {
          const match = line.match(/\[download\]\s+(.+?)\s+has already been downloaded/)
          if (match?.[1]) {
            outputPath = path.isAbsolute(match[1]) ? match[1] : path.resolve(batch.outputDir, match[1])
          }
          progress = 100
          setPhase('done')
          emitProgress(true)
          return
        }

        const progressMatch = line.match(
          /\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+\s*[KMGT]?iB)(?:\s+at\s+([\d.]+\s*[KMGT]?iB\/s))?(?:\s+ETA\s+([\d:]+))?/i
        )
        if (progressMatch) {
          progress = Math.max(0, Math.min(100, Number(progressMatch[1])))
          if (progressMatch[2]) sizeLabel = progressMatch[2].replace(/\s+/g, ' ')
          speed = progressMatch[3]?.replace(/\s+/g, ' ') ?? null
          eta = progressMatch[4] ?? null
          if (item.kind !== 'audio' && destinationCount <= 1) phase = 'video'
          emitProgress(progress >= 100)
          return
        }

        const trimmed = line.trim()
        if (path.isAbsolute(trimmed) && fs.existsSync(trimmed)) {
          outputPath = trimmed
          progress = 100
          setPhase('done')
          emitProgress(true)
        }
      }

      const consume = (chunk: Buffer, source: 'stdout' | 'stderr') => {
        if (source === 'stdout') {
          stdoutBuffer += chunk.toString('utf8')
          const lines = stdoutBuffer.split(/\r?\n/)
          stdoutBuffer = lines.pop() ?? ''
          for (const line of lines) handleLine(line)
        } else {
          stderrBuffer += chunk.toString('utf8')
          const lines = stderrBuffer.split(/\r?\n/)
          stderrBuffer = lines.pop() ?? ''
          for (const line of lines) {
            if (line.trim()) stderrLines.push(line)
            if (line.includes('[download]')) handleLine(line)
          }
        }
      }

      child.stdout?.on('data', (chunk: Buffer) => consume(chunk, 'stdout'))
      child.stderr?.on('data', (chunk: Buffer) => consume(chunk, 'stderr'))

      child.on('error', (error) => {
        if (settled) return
        settled = true
        this.child = null
        resolve({
          success: false,
          canceled: false,
          outputPath,
          error: `Could not launch yt-dlp: ${error.message}`
        })
      })

      child.on('close', (code, signal) => {
        if (settled) return
        settled = true
        this.child = null

        if (stdoutBuffer.trim()) handleLine(stdoutBuffer)
        if (stderrBuffer.trim()) {
          stderrLines.push(stderrBuffer)
          if (stderrBuffer.includes('[download]')) handleLine(stderrBuffer)
        }

        if (!outputPath) {
          outputPath = findRecentOutput(batch.outputDir, startedAt)
        }

        const canceled = Boolean(batch.canceled || this.shuttingDown)
        if (code === 0 && !canceled) {
          resolve({ success: true, canceled: false, outputPath, error: null })
          return
        }

        resolve({
          success: false,
          canceled,
          outputPath,
          error: canceled
            ? 'Download cancelled. Your tokens were refunded.'
            : friendlyError(
                { stderr: stderrLines.join('\n'), stdout: '', code },
                'Download failed.'
              )
        })
      })
    })
  }

  private killCurrent(): void {
    const child = this.child
    if (!child || !child.pid) return
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, 'SIGKILL')
      } catch {
        try {
          child.kill('SIGKILL')
        } catch {
          // The process is already gone.
        }
      }
    }, 4_000)
    child.once('close', () => clearTimeout(timer))
  }

  private setDockProgress(progress: number): void {
    if (this.win.isDestroyed()) return
    try {
      this.win.setProgressBar(progress)
    } catch {
      // Non-fatal on platforms without a dock.
    }
  }

  private notifyComplete(item: QueueItem): void {
    if (!Notification.isSupported() || this.win.isFocused()) return
    const notification = new Notification({
      title: 'Download complete',
      body: item.title,
      silent: true
    })
    notification.on('click', () => {
      if (!this.win.isDestroyed()) {
        this.win.show()
        this.win.focus()
      }
      if (item.outputPath) shell.showItemInFolder(item.outputPath)
    })
    notification.show()
  }
}

function findRecentOutput(directory: string, startedAt: number): string | null {
  try {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
    let best: { path: string; mtime: number } | null = null
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (entry.name.startsWith('.')) continue
      if (/\.(part|ytdl|temp)$/i.test(entry.name)) continue
      const fullPath = path.join(directory, entry.name)
      const stat = fs.statSync(fullPath)
      if (stat.mtimeMs < startedAt - 10_000) continue
      if (!best || stat.mtimeMs > best.mtime) best = { path: fullPath, mtime: stat.mtimeMs }
    }
    return best?.path ?? null
  } catch {
    return null
  }
}
