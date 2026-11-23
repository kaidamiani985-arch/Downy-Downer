import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { CHANNELS } from '../shared/api'
import { parseYouTubeUrl } from '../shared/youtube'
import type {
  AddUrlResult,
  AppSnapshot,
  ItemOptionsPatch,
  Settings,
  StartResult,
  UpdateCheck
} from '../shared/types'
import { checkForAppUpdate, installAppUpdate } from './updater'
import type { BinaryManager } from './binaries'
import type { DownloadManager } from './downloads'
import type { Store } from './store'
import type { FetchedVideo, YtDlpService } from './ytdlp'

interface IpcContext {
  win: BrowserWindow
  store: Store
  binaries: BinaryManager
  ytdlp: YtDlpService
  downloads: DownloadManager
  getSnapshot: () => AppSnapshot
  broadcastState: () => void
}

export function registerIpc(context: IpcContext): void {
  const { win, store, binaries, ytdlp, downloads, getSnapshot, broadcastState } = context

  ipcMainHandle(CHANNELS.getState, () => getSnapshot())

  ipcMainHandle(CHANNELS.addUrl, async (_event, rawUrl: string): Promise<AddUrlResult> => {
    const parsed = parseYouTubeUrl(String(rawUrl ?? ''))
    if (!parsed.ok) {
      return failure(parsed.message)
    }

    try {
      const fetched = await ytdlp.fetch(parsed)
      if (fetched.kind === 'video') {
        const duplicate = store.findDuplicate(fetched.video.videoId)
        if (duplicate) {
          return {
            ok: false,
            kind: 'video',
            message: 'That video is already in your queue.',
            addedItemIds: [],
            addedCount: 0,
            skippedCount: 1
          }
        }
        const item = store.addVideo(fetched.video, null)
        broadcastState()
        return {
          ok: true,
          kind: 'video',
          message: 'Added to queue.',
          addedItemIds: [item.id],
          addedCount: 1,
          skippedCount: 0
        }
      }

      const seen = new Set<string>()
      const videos: FetchedVideo[] = []
      let skipped = fetched.playlist.skipped
      for (const video of fetched.playlist.entries) {
        if (seen.has(video.videoId) || store.findDuplicate(video.videoId)) {
          skipped += 1
          continue
        }
        seen.add(video.videoId)
        videos.push(video)
      }

      if (videos.length === 0) {
        return {
          ok: false,
          kind: 'playlist',
          message: 'Every video in that playlist is already in your queue.',
          addedItemIds: [],
          addedCount: 0,
          skippedCount: skipped
        }
      }

      const group = store.addPlaylist(fetched.playlist, videos)
      broadcastState()
      return {
        ok: true,
        kind: 'playlist',
        message: `Added ${videos.length} video${videos.length === 1 ? '' : 's'} from “${fetched.playlist.title}”.`,
        addedItemIds: group.itemIds,
        playlistId: group.id,
        addedCount: videos.length,
        skippedCount: skipped
      }
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Could not read that YouTube link.')
    }
  })

  ipcMainHandle(CHANNELS.updateItem, (_event, id: string, patch: ItemOptionsPatch) => {
    try {
      store.updateItemOptions(id, patch)
      broadcastState()
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not update that item.' }
    }
  })

  ipcMainHandle(CHANNELS.removeItem, (_event, id: string) => {
    if (downloads.getActive()?.currentItemId === id || Boolean(store.data.charges[id])) {
      return { ok: false, message: 'This download is active. Stop it before removing it.' }
    }
    store.removeItem(id)
    broadcastState()
    return { ok: true }
  })

  ipcMainHandle(CHANNELS.removePlaylist, (_event, id: string) => {
    const playlist = store.getPlaylist(id)
    const charged = playlist?.itemIds.some((itemId) => Boolean(store.data.charges[itemId])) ?? false
    if (
      store.hasActiveItemInPlaylist(id, downloads.getActive()?.currentItemId ?? null) ||
      charged
    ) {
      return { ok: false, message: 'A download in this playlist is active. Stop it first.' }
    }
    store.removePlaylist(id)
    broadcastState()
    return { ok: true }
  })

  ipcMainHandle(CHANNELS.clearCompleted, () => {
    const removed = store.clearCompleted()
    broadcastState()
    return {
      ok: true,
      message: removed > 0 ? `Cleared ${removed} completed item${removed === 1 ? '' : 's'}.` : 'No completed items to clear.'
    }
  })

  ipcMainHandle(CHANNELS.chooseOutputDir, async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose where Downy saves downloads',
      defaultPath: store.data.settings.outputDir,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    store.updateSettings({ outputDir: result.filePaths[0], hasChosenOutputDir: true })
    broadcastState()
    return result.filePaths[0]
  })

  ipcMainHandle(CHANNELS.updateSettings, (_event, patch: Partial<Settings>) => {
    store.updateSettings(patch)
    broadcastState()
    return getSnapshot()
  })

  ipcMainHandle(CHANNELS.resetSave, async () => {
    if (downloads.getActive()) {
      return { ok: false, message: 'Stop the active download before resetting your save.' }
    }

    const result = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Cancel', 'Reset save'],
      defaultId: 0,
      cancelId: 0,
      title: 'Reset save',
      message: 'Reset your save?',
      detail:
        'This clears your queue and playlists, resets your download tokens to 0, and removes your activity history. Your settings and output folder are kept.'
    })

    if (result.response !== 1) {
      return { ok: false, canceled: true }
    }

    store.resetSave()
    broadcastState()
    return { ok: true }
  })

  ipcMainHandle(CHANNELS.startDownloads, (_event, ids: string[]): StartResult => {
    return downloads.start(Array.isArray(ids) ? ids : [])
  })

  ipcMainHandle(CHANNELS.cancelDownloads, () => {
    downloads.cancel()
    return true
  })

  ipcMainHandle(CHANNELS.earnTokens, (_event, runTokens: number) => {
    const amount = Math.floor(Number(runTokens))
    if (!Number.isFinite(amount) || amount <= 0) {
      return store.walletSnapshot()
    }
    if (amount > 10_000) {
      throw new Error('That snake run was suspiciously long.')
    }
    store.earnTokens(amount, 'Snake run')
    broadcastState()
    return store.walletSnapshot()
  })

  ipcMainHandle(CHANNELS.revealPath, (_event, target: string) => {
    if (typeof target !== 'string' || !target) return false
    const resolved = path.resolve(target)
    if (!fs.existsSync(resolved)) return false
    if (fs.statSync(resolved).isDirectory()) {
      shell.openPath(resolved)
    } else {
      shell.showItemInFolder(resolved)
    }
    return true
  })

  ipcMainHandle(CHANNELS.openExternal, async (_event, rawUrl: string) => {
    try {
      const url = new URL(String(rawUrl))
      const allowed =
        url.protocol === 'https:' &&
        (url.hostname === 'github.com' || url.hostname === 'www.github.com' || url.hostname === 'yt-dlp.github.io')
      if (!allowed) return false
      await shell.openExternal(url.toString())
      return true
    } catch {
      return false
    }
  })

  ipcMainHandle(CHANNELS.getTools, () => binaries.getVersions())

  ipcMainHandle(CHANNELS.checkYtdlpUpdate, async (): Promise<UpdateCheck> => {
    const result = await binaries.checkForUpdate()
    store.updateSettings({ lastYtdlpCheck: Date.now() })
    broadcastState()
    return result
  })

  ipcMainHandle(CHANNELS.updateYtdlp, async (): Promise<UpdateCheck> => {
    const result = await binaries.updateYtdlp()
    store.updateSettings({ lastYtdlpCheck: Date.now() })
    broadcastState()
    return result
  })

  ipcMainHandle(CHANNELS.checkAppUpdate, (_event, force: unknown) => {
    return checkForAppUpdate(force === true)
  })

  ipcMainHandle(CHANNELS.installAppUpdate, async (event) => {
    if (downloads.getActive()) {
      return { ok: false, message: 'Finish or stop the active download before updating Downy.' }
    }
    return installAppUpdate((progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(CHANNELS.appUpdateProgress, progress)
      }
    })
  })
}

function failure(message: string): AddUrlResult {
  return {
    ok: false,
    kind: 'none',
    message,
    addedItemIds: [],
    addedCount: 0,
    skippedCount: 0
  }
}

function ipcMainHandle(channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any): void {
  ipcMain.handle(channel, listener)
}
