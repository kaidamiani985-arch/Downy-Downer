import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { calculateQuote } from '../shared/pricing'
import type {
  ActiveDownload,
  AppSnapshot,
  Container,
  ItemOptionsPatch,
  ItemStatus,
  MediaKind,
  PersistedState,
  PlaylistGroup,
  Quality,
  QueueItem,
  Settings,
  WalletSnapshot,
  WalletTransaction
} from '../shared/types'
import type { FetchedPlaylist, FetchedVideo } from './ytdlp'

const TRANSACTION_LIMIT = 120

export class Store {
  readonly file: string
  data: PersistedState
  private readonly appVersion: string
  private readonly downloadsDir: string
  private saveTimer: NodeJS.Timeout | null = null

  constructor(userDataDir: string, downloadsDir: string, appVersion: string) {
    this.downloadsDir = downloadsDir
    this.appVersion = appVersion
    this.file = path.join(userDataDir, 'state.json')
    fs.mkdirSync(userDataDir, { recursive: true })
    this.data = this.load()
    this.reconcileInterrupted()
  }

  private load(): PersistedState {
    const defaults = this.defaultState()
    if (!fs.existsSync(this.file)) return defaults

    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<PersistedState>
      return {
        schemaVersion: 1,
        wallet: { ...defaults.wallet, ...(parsed.wallet ?? {}) },
        settings: { ...defaults.settings, ...(parsed.settings ?? {}) },
        queue: Array.isArray(parsed.queue) ? parsed.queue.map((item) => this.normalizeItem(item)) : [],
        playlists: Array.isArray(parsed.playlists)
          ? parsed.playlists
              .filter((playlist): playlist is PlaylistGroup => Boolean(playlist?.id))
              .map((playlist) => ({ ...playlist, itemIds: Array.isArray(playlist.itemIds) ? playlist.itemIds : [] }))
          : [],
        charges: parsed.charges && typeof parsed.charges === 'object' ? parsed.charges : {}
      }
    } catch (error) {
      try {
        fs.renameSync(this.file, `${this.file}.corrupt-${Date.now()}`)
      } catch {
        // Ignore backup failures; a fresh state is still better than a crash.
      }
      console.error('Could not read saved state:', error)
      return defaults
    }
  }

  private defaultState(): PersistedState {
    return {
      schemaVersion: 1,
      wallet: {
        balance: 0,
        lifetimeEarned: 0,
        lifetimeSpent: 0,
        bestRunTokens: 0,
        transactions: []
      },
      settings: {
        outputDir: this.downloadsDir,
        hasChosenOutputDir: false,
        defaultKind: 'video',
        defaultQuality: '1080',
        defaultContainer: 'mp4',
        defaultAudioFormat: 'mp3',
        defaultAudioBitrate: 'best',
        soundEnabled: true,
        revealWhenDone: false,
        cookiesBrowser: 'none',
        autoCheckYtdlp: true,
        lastYtdlpCheck: null
      },
      queue: [],
      playlists: [],
      charges: {}
    }
  }

  private normalizeItem(raw: QueueItem): QueueItem {
    return {
      ...raw,
      status: raw.status ?? 'queued',
      progress: Number.isFinite(raw.progress) ? raw.progress : 0,
      phase: raw.phase ?? null,
      speed: raw.speed ?? null,
      eta: raw.eta ?? null,
      downloadedLabel: raw.downloadedLabel ?? null,
      error: raw.error ?? null,
      outputPath: raw.outputPath ?? null,
      charge: raw.charge ?? null,
      playlistId: raw.playlistId ?? null,
      completedAt: raw.completedAt ?? null,
      addedAt: raw.addedAt ?? Date.now(),
      kind: raw.kind ?? 'video',
      quality: raw.quality ?? '1080',
      container: raw.container ?? 'mp4',
      audioFormat: raw.audioFormat ?? 'mp3',
      audioBitrate: raw.audioBitrate ?? 'best',
      channel: raw.channel ?? 'YouTube',
      duration: Number.isFinite(raw.duration) ? raw.duration : 0,
      thumbnail: raw.thumbnail ?? ''
    }
  }

  private reconcileInterrupted(): void {
    let changed = false
    for (const [itemId, charge] of Object.entries(this.data.charges)) {
      this.refundRaw(charge.amount, `Interrupted download refund`, itemId)
      const item = this.findItem(itemId)
      if (item) {
        item.status = 'interrupted'
        item.error = 'The app closed while this download was running. Your tokens were refunded.'
        item.progress = 0
        item.phase = null
        item.speed = null
        item.eta = null
        item.charge = null
      }
      changed = true
    }
    this.data.charges = {}

    for (const item of this.data.queue) {
      if (item.status === 'downloading' || item.status === 'processing') {
        item.status = 'interrupted'
        item.error = 'The app closed while this download was running.'
        item.progress = 0
        item.phase = null
        item.speed = null
        item.eta = null
        item.charge = null
        changed = true
      }
    }

    if (changed) this.saveNow()
  }

  snapshot(active: ActiveDownload | null): AppSnapshot {
    return {
      wallet: structuredClone(this.data.wallet),
      settings: { ...this.data.settings },
      queue: this.data.queue.map((item) => ({ ...item })),
      playlists: this.data.playlists.map((playlist) => ({ ...playlist, itemIds: [...playlist.itemIds] })),
      active,
      version: this.appVersion
    }
  }

  walletSnapshot(): WalletSnapshot {
    return structuredClone(this.data.wallet)
  }

  findItem(id: string): QueueItem | undefined {
    return this.data.queue.find((item) => item.id === id)
  }

  findDuplicate(videoId: string): QueueItem | undefined {
    return this.data.queue.find((item) => item.videoId === videoId)
  }

  getPlaylist(id: string): PlaylistGroup | undefined {
    return this.data.playlists.find((playlist) => playlist.id === id)
  }

  hasActiveItemInPlaylist(playlistId: string, activeItemId: string | null): boolean {
    const playlist = this.getPlaylist(playlistId)
    if (!playlist) return false
    return Boolean(activeItemId && playlist.itemIds.includes(activeItemId))
  }

  addVideo(video: FetchedVideo, playlistId: string | null): QueueItem {
    const settings = this.data.settings
    const item: QueueItem = {
      id: crypto.randomUUID(),
      videoId: video.videoId,
      url: video.url,
      title: video.title,
      channel: video.channel,
      duration: video.duration,
      thumbnail: video.thumbnail,
      playlistId,
      status: 'queued',
      kind: settings.defaultKind,
      quality: settings.defaultQuality,
      container: settings.defaultContainer,
      audioFormat: settings.defaultAudioFormat,
      audioBitrate: settings.defaultAudioBitrate,
      progress: 0,
      phase: null,
      speed: null,
      eta: null,
      downloadedLabel: null,
      error: null,
      outputPath: null,
      charge: null,
      addedAt: Date.now(),
      completedAt: null
    }
    this.data.queue.push(item)
    this.scheduleSave()
    return item
  }

  addPlaylist(playlist: FetchedPlaylist, videos: FetchedVideo[]): PlaylistGroup {
    const group: PlaylistGroup = {
      id: crypto.randomUUID(),
      title: playlist.title,
      channel: playlist.channel,
      url: playlist.url,
      thumbnail: playlist.thumbnail,
      itemIds: [],
      addedAt: Date.now()
    }

    for (const video of videos) {
      const item = this.addVideo(video, group.id)
      group.itemIds.push(item.id)
    }

    this.data.playlists.push(group)
    this.saveNow()
    return group
  }

  updateItemOptions(id: string, patch: ItemOptionsPatch): QueueItem {
    const item = this.findItem(id)
    if (!item) throw new Error('That queue item no longer exists.')
    if (item.status === 'downloading' || item.status === 'processing') {
      throw new Error('Wait for this download to finish before changing its options.')
    }

    if (patch.kind) item.kind = patch.kind
    if (patch.quality) item.quality = patch.quality
    if (patch.container) item.container = patch.container
    if (patch.audioFormat) item.audioFormat = patch.audioFormat
    if (patch.audioBitrate) item.audioBitrate = patch.audioBitrate


    this.scheduleSave()
    return item
  }

  removeItem(id: string): void {
    const index = this.data.queue.findIndex((item) => item.id === id)
    if (index === -1) return
    const [item] = this.data.queue.splice(index, 1)
    if (item?.playlistId) {
      const playlist = this.getPlaylist(item.playlistId)
      if (playlist) {
        playlist.itemIds = playlist.itemIds.filter((itemId) => itemId !== id)
        if (playlist.itemIds.length === 0) {
          this.data.playlists = this.data.playlists.filter((entry) => entry.id !== playlist.id)
        }
      }
    }
    this.scheduleSave()
  }

  removePlaylist(id: string): void {
    const playlist = this.getPlaylist(id)
    if (!playlist) return
    const ids = new Set(playlist.itemIds)
    this.data.queue = this.data.queue.filter((item) => !ids.has(item.id))
    this.data.playlists = this.data.playlists.filter((entry) => entry.id !== id)
    this.scheduleSave()
  }

  clearCompleted(): number {
    const completedIds = new Set(
      this.data.queue.filter((item) => item.status === 'completed').map((item) => item.id)
    )
    if (completedIds.size === 0) return 0
    this.data.queue = this.data.queue.filter((item) => !completedIds.has(item.id))
    for (const playlist of this.data.playlists) {
      playlist.itemIds = playlist.itemIds.filter((id) => !completedIds.has(id))
    }
    this.data.playlists = this.data.playlists.filter((playlist) => playlist.itemIds.length > 0)
    this.scheduleSave()
    return completedIds.size
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const next: Settings = { ...this.data.settings }
    if (typeof patch.outputDir === 'string' && patch.outputDir.trim()) next.outputDir = patch.outputDir
    if (typeof patch.hasChosenOutputDir === 'boolean') next.hasChosenOutputDir = patch.hasChosenOutputDir
    if (isMediaKind(patch.defaultKind)) next.defaultKind = patch.defaultKind
    if (isQuality(patch.defaultQuality)) next.defaultQuality = patch.defaultQuality
    if (patch.defaultContainer === 'mp4' || patch.defaultContainer === 'mkv') {
      next.defaultContainer = patch.defaultContainer
    }
    if (patch.defaultAudioFormat === 'mp3' || patch.defaultAudioFormat === 'm4a' || patch.defaultAudioFormat === 'opus') {
      next.defaultAudioFormat = patch.defaultAudioFormat
    }
    if (
      patch.defaultAudioBitrate === 'best' ||
      patch.defaultAudioBitrate === '320' ||
      patch.defaultAudioBitrate === '192' ||
      patch.defaultAudioBitrate === '128'
    ) {
      next.defaultAudioBitrate = patch.defaultAudioBitrate
    }
    if (typeof patch.soundEnabled === 'boolean') next.soundEnabled = patch.soundEnabled
    if (typeof patch.revealWhenDone === 'boolean') next.revealWhenDone = patch.revealWhenDone
    if (
      patch.cookiesBrowser === 'none' ||
      patch.cookiesBrowser === 'chrome' ||
      patch.cookiesBrowser === 'safari' ||
      patch.cookiesBrowser === 'firefox' ||
      patch.cookiesBrowser === 'brave' ||
      patch.cookiesBrowser === 'edge'
    ) {
      next.cookiesBrowser = patch.cookiesBrowser
    }
    if (typeof patch.autoCheckYtdlp === 'boolean') next.autoCheckYtdlp = patch.autoCheckYtdlp
    if (typeof patch.lastYtdlpCheck === 'number' || patch.lastYtdlpCheck === null) {
      next.lastYtdlpCheck = patch.lastYtdlpCheck
    }
    this.data.settings = next
    this.scheduleSave()
    return { ...next }
  }

  resetSave(): void {
    const settings = { ...this.data.settings }
    this.data = {
      schemaVersion: 1,
      wallet: {
        balance: 0,
        lifetimeEarned: 0,
        lifetimeSpent: 0,
        bestRunTokens: 0,
        transactions: []
      },
      settings,
      queue: [],
      playlists: [],
      charges: {}
    }
    this.saveNow()
  }

  quote(ids: string[]) {
    return calculateQuote(this.data.queue, this.data.playlists, ids)
  }

  beginItem(id: string, amount: number, batchId: string): QueueItem {
    const item = this.findItem(id)
    if (!item) throw new Error('That queue item no longer exists.')
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Invalid token charge.')
    if (this.data.wallet.balance < amount) throw new Error('Not enough download tokens.')

    this.data.wallet.balance -= amount
    this.data.wallet.lifetimeSpent += amount
    this.data.charges[id] = { amount, batchId, at: Date.now() }
    this.addTransaction({
      type: 'spend',
      amount,
      reason: `Download — ${truncate(item.title, 70)}`,
      itemId: id
    })

    item.status = 'downloading'
    item.progress = 0
    item.phase = 'preparing'
    item.speed = null
    item.eta = null
    item.downloadedLabel = null
    item.error = null
    item.outputPath = null
    item.charge = amount
    item.completedAt = null
    this.scheduleSave()
    return item
  }

  updateProgress(
    id: string,
    patch: {
      progress?: number
      phase?: QueueItem['phase']
      speed?: string | null
      eta?: string | null
      downloadedLabel?: string | null
    }
  ): void {
    const item = this.findItem(id)
    if (!item) return
    if (patch.progress !== undefined) item.progress = Math.max(0, Math.min(100, patch.progress))
    if (patch.phase !== undefined) item.phase = patch.phase
    if (patch.speed !== undefined) item.speed = patch.speed
    if (patch.eta !== undefined) item.eta = patch.eta
    if (patch.downloadedLabel !== undefined) item.downloadedLabel = patch.downloadedLabel
  }

  completeItem(id: string, outputPath: string | null): QueueItem | undefined {
    const item = this.findItem(id)
    if (!item) return undefined
    delete this.data.charges[id]
    item.status = 'completed'
    item.progress = 100
    item.phase = 'done'
    item.speed = null
    item.eta = null
    item.error = null
    item.outputPath = outputPath
    item.charge = null
    item.completedAt = Date.now()
    this.scheduleSave()
    return item
  }

  failItem(id: string, status: 'failed' | 'cancelled' | 'interrupted', error: string): number {
    const item = this.findItem(id)
    const charge = this.data.charges[id]
    if (!item) {
      if (!charge) return 0
      this.refundRaw(charge.amount, 'Refund — removed download', id)
      delete this.data.charges[id]
      this.scheduleSave()
      return charge.amount
    }
    let refunded = 0
    if (charge) {
      refunded = charge.amount
      this.refundRaw(charge.amount, `Refund — ${truncate(item.title, 60)}`, id)
      delete this.data.charges[id]
    }
    item.status = status
    item.error = error
    item.phase = null
    item.speed = null
    item.eta = null
    item.charge = null
    if (status === 'cancelled' || status === 'interrupted') item.progress = 0
    this.scheduleSave()
    return refunded
  }

  earnTokens(amount: number, reason: string): WalletSnapshot {
    if (!Number.isInteger(amount) || amount <= 0 || amount > 100_000) {
      throw new Error('Invalid token amount.')
    }
    this.data.wallet.balance += amount
    this.data.wallet.lifetimeEarned += amount

    const latest = this.data.wallet.transactions[0]
    if (
      reason === 'Snake run' &&
      latest &&
      latest.type === 'earn' &&
      latest.reason === 'Snake run' &&
      Date.now() - latest.at < 60_000
    ) {
      latest.amount += amount
      latest.at = Date.now()
    } else {
      this.addTransaction({ type: 'earn', amount, reason })
    }

    this.scheduleSave()
    return this.walletSnapshot()
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.saveNow()
  }

  saveNow(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    try {
      const temp = `${this.file}.tmp-${process.pid}`
      fs.writeFileSync(temp, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
      fs.renameSync(temp, this.file)
    } catch (error) {
      console.error('Could not save Downy state:', error)
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.saveNow()
    }, 120)
  }

  private refundRaw(amount: number, reason: string, itemId?: string): void {
    if (amount <= 0) return
    this.data.wallet.balance += amount
    this.data.wallet.lifetimeSpent = Math.max(0, this.data.wallet.lifetimeSpent - amount)
    this.addTransaction({ type: 'refund', amount, reason, itemId })
  }

  private addTransaction(transaction: Omit<WalletTransaction, 'id' | 'at'>): void {
    this.data.wallet.transactions.unshift({
      id: crypto.randomUUID(),
      at: Date.now(),
      ...transaction
    })
    if (this.data.wallet.transactions.length > TRANSACTION_LIMIT) {
      this.data.wallet.transactions.length = TRANSACTION_LIMIT
    }
  }
}

function truncate(value: string, length: number): string {
  if (value.length <= length) return value
  return `${value.slice(0, length - 1)}…`
}

function isMediaKind(value: unknown): value is MediaKind {
  return value === 'video' || value === 'audio'
}

function isQuality(value: unknown): value is Quality {
  return ['best', '2160', '1440', '1080', '720', '480', '360'].includes(String(value))
}

function isContainer(value: unknown): value is Container {
  return value === 'mp4' || value === 'mkv'
}

function isStatus(value: unknown): value is ItemStatus {
  return ['queued', 'downloading', 'processing', 'completed', 'failed', 'cancelled', 'interrupted'].includes(
    String(value)
  )
}
