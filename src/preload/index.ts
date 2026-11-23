import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from '../shared/api'
import type { DownyApi } from '../shared/api'
import type { AppSnapshot, ProgressUpdate, ToastPayload } from '../shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: DownyApi = {
  getState: () => ipcRenderer.invoke(CHANNELS.getState),
  addUrl: (url: string) => ipcRenderer.invoke(CHANNELS.addUrl, url),
  updateItem: (id, patch) => ipcRenderer.invoke(CHANNELS.updateItem, id, patch),
  removeItem: (id) => ipcRenderer.invoke(CHANNELS.removeItem, id),
  removePlaylist: (id) => ipcRenderer.invoke(CHANNELS.removePlaylist, id),
  clearCompleted: () => ipcRenderer.invoke(CHANNELS.clearCompleted),
  chooseOutputDir: () => ipcRenderer.invoke(CHANNELS.chooseOutputDir),
  updateSettings: (patch) => ipcRenderer.invoke(CHANNELS.updateSettings, patch),
  resetSave: () => ipcRenderer.invoke(CHANNELS.resetSave),
  startDownloads: (ids) => ipcRenderer.invoke(CHANNELS.startDownloads, ids),
  cancelDownloads: () => ipcRenderer.invoke(CHANNELS.cancelDownloads),
  earnTokens: (runTokens) => ipcRenderer.invoke(CHANNELS.earnTokens, runTokens),
  revealPath: (path) => ipcRenderer.invoke(CHANNELS.revealPath, path),
  openExternal: (url) => ipcRenderer.invoke(CHANNELS.openExternal, url),
  getTools: () => ipcRenderer.invoke(CHANNELS.getTools),
  checkYtdlpUpdate: () => ipcRenderer.invoke(CHANNELS.checkYtdlpUpdate),
  updateYtdlp: () => ipcRenderer.invoke(CHANNELS.updateYtdlp),
  onState: (callback) => subscribe<AppSnapshot>(CHANNELS.stateChanged, callback),
  onProgress: (callback) => subscribe<ProgressUpdate>(CHANNELS.progressChanged, callback),
  onToast: (callback) => subscribe<ToastPayload>(CHANNELS.toast, callback),
  onOpenSettings: (callback) => {
    const listener = () => callback()
    ipcRenderer.on(CHANNELS.openSettings, listener)
    return () => ipcRenderer.removeListener(CHANNELS.openSettings, listener)
  }
}

contextBridge.exposeInMainWorld('downy', api)
