import { create } from 'zustand'
import { calculateQuote } from '@shared/pricing'
import type {
  AddUrlResult,
  AppSnapshot,
  ItemOptionsPatch,
  ProgressUpdate,
  QueueItem,
  Settings,
  ToastPayload
} from '@shared/types'

export interface ToastItem {
  id: string
  type: ToastPayload['type']
  message: string
  leaving?: boolean
}

export interface TokenPrompt {
  cost: number
  balance: number
  shortfall: number
}

interface AppStore {
  snapshot: AppSnapshot | null
  ready: boolean
  initError: string | null
  selected: string[]
  adding: boolean
  toasts: ToastItem[]
  settingsOpen: boolean
  walletOpen: boolean
  snakeOpen: boolean
  tokenPrompt: TokenPrompt | null

  init: () => Promise<void>
  addToast: (type: ToastPayload['type'], message: string) => void
  dismissToast: (id: string) => void
  addUrl: (url: string) => Promise<boolean>
  updateItem: (id: string, patch: ItemOptionsPatch) => Promise<void>
  removeItem: (id: string) => Promise<void>
  removePlaylist: (id: string) => Promise<void>
  clearCompleted: () => Promise<void>
  applyOptionsToAll: (sourceId: string) => Promise<void>
  toggleSelected: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
  togglePlaylist: (playlistId: string) => void
  chooseFolder: () => Promise<string | null>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  startIds: (ids: string[]) => Promise<void>
  cancelDownloads: () => Promise<void>
  earnSnakeCoin: () => Promise<void>
  openTokenPrompt: (cost: number, balance: number) => void
  closeTokenPrompt: () => void
  openSnake: () => void
  closeSnake: () => void
  openSettings: () => void
  closeSettings: () => void
  toggleWallet: () => void
  closeWallet: () => void
}

let initialized = false

export const useAppStore = create<AppStore>((set, get) => ({
  snapshot: null,
  ready: false,
  initError: null,
  selected: [],
  adding: false,
  toasts: [],
  settingsOpen: false,
  walletOpen: false,
  snakeOpen: false,
  tokenPrompt: null,

  init: async () => {
    if (initialized) return
    initialized = true
    if (!window.downy) {
      set({ initError: 'The app bridge did not load. Restart Downy Downloader.' })
      return
    }

    const applySnapshot = (snapshot: AppSnapshot) => {
      set((state) => {
        const selectable = new Set(
          snapshot.queue.filter((item) => isSelectable(item)).map((item) => item.id)
        )
        return {
          snapshot,
          ready: true,
          selected: state.selected.filter((id) => selectable.has(id))
        }
      })
    }

    window.downy.onState(applySnapshot)
    window.downy.onProgress((progress: ProgressUpdate) => {
      set((state) => {
        if (!state.snapshot) return state
        return {
          snapshot: {
            ...state.snapshot,
            queue: state.snapshot.queue.map((item) =>
              item.id === progress.itemId
                ? {
                    ...item,
                    progress: progress.progress,
                    phase: progress.phase,
                    speed: progress.speed,
                    eta: progress.eta,
                    downloadedLabel: progress.downloadedLabel
                  }
                : item
            )
          }
        }
      })
    })
    window.downy.onToast((toast) => get().addToast(toast.type, toast.message))
    window.downy.onOpenSettings(() => get().openSettings())

    try {
      const snapshot = await window.downy.getState()
      applySnapshot(snapshot)
    } catch (error) {
      set({
        initError: error instanceof Error ? error.message : 'Could not load the app state.'
      })
    }
  },

  addToast: (type, message) => {
    const id = crypto.randomUUID()
    set((state) => ({
      toasts: [...state.toasts.slice(-3), { id, type, message, leaving: false }]
    }))
    setTimeout(() => get().dismissToast(id), type === 'error' ? 7_000 : 4_500)
  },

  dismissToast: (id) => {
    const toast = get().toasts.find((entry) => entry.id === id)
    if (!toast || toast.leaving) return
    set((state) => ({
      toasts: state.toasts.map((entry) => (entry.id === id ? { ...entry, leaving: true } : entry))
    }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((entry) => entry.id !== id) }))
    }, 260)
  },

  addUrl: async (url) => {
    if (get().adding) return false
    set({ adding: true })
    try {
      const result: AddUrlResult = await window.downy.addUrl(url)
      if (!result.ok) {
        get().addToast('error', result.message)
        return false
      }
      if (result.kind === 'video' && result.addedItemIds.length > 0) {
        set((state) => ({
          selected: [...new Set([...state.selected, ...result.addedItemIds])]
        }))
      }
      const skipped =
        result.skippedCount > 0
          ? ` ${result.skippedCount} unavailable or duplicate${result.skippedCount === 1 ? '' : 's'} skipped.`
          : ''
      get().addToast('success', `${result.message}${skipped}`)
      return true
    } catch (error) {
      get().addToast('error', error instanceof Error ? error.message : 'Could not add that link.')
      return false
    } finally {
      set({ adding: false })
    }
  },

  updateItem: async (id, patch) => {
    set((state) => {
      if (!state.snapshot) return state
      return {
        snapshot: {
          ...state.snapshot,
          queue: state.snapshot.queue.map((item) => {
            if (item.id !== id) return item
            const next: QueueItem = { ...item, ...patch }
            if (next.container === 'mp4' && (next.quality === '2160' || next.quality === '1440')) {
              next.container = 'mkv'
            }
            return next
          })
        }
      }
    })

    try {
      const result = await window.downy.updateItem(id, patch)
      if (!result.ok) get().addToast('error', result.message ?? 'Could not update that item.')
    } catch (error) {
      get().addToast('error', error instanceof Error ? error.message : 'Could not update that item.')
    }
  },

  removeItem: async (id) => {
    try {
      const result = await window.downy.removeItem(id)
      if (!result.ok) get().addToast('error', result.message ?? 'Could not remove that item.')
    } catch (error) {
      get().addToast('error', error instanceof Error ? error.message : 'Could not remove that item.')
    }
  },

  removePlaylist: async (id) => {
    try {
      const result = await window.downy.removePlaylist(id)
      if (!result.ok) get().addToast('error', result.message ?? 'Could not remove that playlist.')
    } catch (error) {
      get().addToast('error', error instanceof Error ? error.message : 'Could not remove that playlist.')
    }
  },

  clearCompleted: async () => {
    try {
      const result = await window.downy.clearCompleted()
      if (result.message) get().addToast('info', result.message)
    } catch (error) {
      get().addToast('error', error instanceof Error ? error.message : 'Could not clear completed items.')
    }
  },

  applyOptionsToAll: async (sourceId) => {
    const snapshot = get().snapshot
    if (!snapshot) return
    const source = snapshot.queue.find((item) => item.id === sourceId)
    if (!source) return
    const patch: ItemOptionsPatch = {
      kind: source.kind,
      quality: source.quality,
      container: source.container,
      audioFormat: source.audioFormat,
      audioBitrate: source.audioBitrate
    }
    const targets = snapshot.queue.filter((item) => item.id !== sourceId && isSelectable(item))
    if (targets.length === 0) {
      get().addToast('info', 'There are no other waiting items to update.')
      return
    }
    await Promise.all(targets.map((item) => window.downy.updateItem(item.id, patch)))
    get().addToast('success', `Applied these options to ${targets.length} item${targets.length === 1 ? '' : 's'}.`)
  },

  toggleSelected: (id) => {
    set((state) => ({
      selected: state.selected.includes(id)
        ? state.selected.filter((entry) => entry !== id)
        : [...state.selected, id]
    }))
  },

  selectAll: () => {
    const snapshot = get().snapshot
    if (!snapshot) return
    const ids = snapshot.queue.filter((item) => isSelectable(item)).map((item) => item.id)
    const allSelected = ids.length > 0 && ids.every((id) => get().selected.includes(id))
    set({ selected: allSelected ? [] : ids })
  },

  clearSelection: () => set({ selected: [] }),

  togglePlaylist: (playlistId) => {
    const snapshot = get().snapshot
    if (!snapshot) return
    const playlist = snapshot.playlists.find((entry) => entry.id === playlistId)
    if (!playlist) return
    const itemIds = playlist.itemIds.filter((id) => {
      const item = snapshot.queue.find((entry) => entry.id === id)
      return item ? isSelectable(item) : false
    })
    if (itemIds.length === 0) return
    const selected = new Set(get().selected)
    const allSelected = itemIds.every((id) => selected.has(id))
    if (allSelected) {
      itemIds.forEach((id) => selected.delete(id))
    } else {
      itemIds.forEach((id) => selected.add(id))
    }
    set({ selected: [...selected] })
  },

  chooseFolder: async () => {
    try {
      const path = await window.downy.chooseOutputDir()
      if (path) get().addToast('info', `Downloads will be saved to ${path}`)
      return path
    } catch (error) {
      get().addToast('error', error instanceof Error ? error.message : 'Could not choose that folder.')
      return null
    }
  },

  updateSettings: async (patch) => {
    try {
      const snapshot = await window.downy.updateSettings(patch)
      set({ snapshot })
    } catch (error) {
      get().addToast('error', error instanceof Error ? error.message : 'Could not save that setting.')
    }
  },

  startIds: async (ids) => {
    const current = get()
    if (!current.snapshot) return
    if (current.snapshot.active) return

    const unique = [...new Set(ids)].filter((id) => {
      const item = current.snapshot?.queue.find((entry) => entry.id === id)
      return item ? isSelectable(item) : false
    })
    if (unique.length === 0) {
      get().addToast('info', 'Select at least one waiting video.')
      return
    }

    if (!current.snapshot.settings.hasChosenOutputDir) {
      const folder = await get().chooseFolder()
      if (!folder) return
    }

    const snapshot = get().snapshot
    if (!snapshot) return
    const quote = calculateQuote(snapshot.queue, snapshot.playlists, unique)
    if (quote.total > snapshot.wallet.balance) {
      get().openTokenPrompt(quote.total, snapshot.wallet.balance)
      return
    }

    try {
      const result = await window.downy.startDownloads(unique)
      if (!result.ok) {
        if (result.code === 'INSUFFICIENT_TOKENS' && result.total !== undefined && result.balance !== undefined) {
          get().openTokenPrompt(result.total, result.balance)
        } else {
          get().addToast('error', result.message ?? 'Could not start downloads.')
        }
        return
      }
      set({ selected: [] })
      get().addToast(
        'info',
        `Started ${unique.length} download${unique.length === 1 ? '' : 's'} · ${quote.total} token${
          quote.total === 1 ? '' : 's'
        } spent.`
      )
    } catch (error) {
      get().addToast('error', error instanceof Error ? error.message : 'Could not start downloads.')
    }
  },

  cancelDownloads: async () => {
    try {
      await window.downy.cancelDownloads()
    } catch (error) {
      get().addToast('error', error instanceof Error ? error.message : 'Could not stop the download.')
    }
  },

  earnSnakeCoin: async () => {
    try {
      await window.downy.earnTokens(1)
    } catch {
      // A single missed coin should not interrupt the run.
    }
  },

  openTokenPrompt: (cost, balance) =>
    set({
      tokenPrompt: { cost, balance, shortfall: Math.max(0, cost - balance) },
      walletOpen: false,
      settingsOpen: false
    }),

  closeTokenPrompt: () => set({ tokenPrompt: null }),

  openSnake: () =>
    set({
      snakeOpen: true,
      walletOpen: false,
      settingsOpen: false,
      tokenPrompt: null
    }),

  closeSnake: () => set({ snakeOpen: false }),

  openSettings: () => set({ settingsOpen: true, walletOpen: false, tokenPrompt: null, snakeOpen: false }),
  closeSettings: () => set({ settingsOpen: false }),

  toggleWallet: () =>
    set((state) => ({
      walletOpen: !state.walletOpen,
      settingsOpen: false,
      tokenPrompt: null
    })),
  closeWallet: () => set({ walletOpen: false })
}))

export function isSelectable(item: QueueItem): boolean {
  return (
    item.status === 'queued' ||
    item.status === 'failed' ||
    item.status === 'cancelled' ||
    item.status === 'interrupted'
  )
}

export function selectableIds(snapshot: AppSnapshot | null): string[] {
  if (!snapshot) return []
  return snapshot.queue.filter((item) => isSelectable(item)).map((item) => item.id)
}
