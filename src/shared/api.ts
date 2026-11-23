import type {
  AddUrlResult,
  AppSnapshot,
  ItemOptionsPatch,
  ProgressUpdate,
  Settings,
  StartResult,
  ToastPayload,
  ToolsInfo,
  UpdateCheck,
  WalletSnapshot,
  ActionResult,
  ResetSaveResult
} from './types'

export interface DownyApi {
  getState(): Promise<AppSnapshot>
  addUrl(url: string): Promise<AddUrlResult>
  updateItem(id: string, patch: ItemOptionsPatch): Promise<ActionResult>
  removeItem(id: string): Promise<ActionResult>
  removePlaylist(id: string): Promise<ActionResult>
  clearCompleted(): Promise<ActionResult>
  chooseOutputDir(): Promise<string | null>
  updateSettings(patch: Partial<Settings>): Promise<AppSnapshot>
  resetSave(): Promise<ResetSaveResult>
  startDownloads(ids: string[]): Promise<StartResult>
  cancelDownloads(): Promise<void>
  earnTokens(runTokens: number): Promise<WalletSnapshot>
  revealPath(path: string): Promise<void>
  openExternal(url: string): Promise<void>
  getTools(): Promise<ToolsInfo>
  checkYtdlpUpdate(): Promise<UpdateCheck>
  updateYtdlp(): Promise<UpdateCheck>
  onState(callback: (state: AppSnapshot) => void): () => void
  onProgress(callback: (progress: ProgressUpdate) => void): () => void
  onToast(callback: (toast: ToastPayload) => void): () => void
  onOpenSettings(callback: () => void): () => void
}

export const CHANNELS = {
  getState: 'app:get-state',
  addUrl: 'app:add-url',
  updateItem: 'app:update-item',
  removeItem: 'app:remove-item',
  removePlaylist: 'app:remove-playlist',
  clearCompleted: 'app:clear-completed',
  chooseOutputDir: 'app:choose-output-dir',
  updateSettings: 'app:update-settings',
  resetSave: 'app:reset-save',
  startDownloads: 'app:start-downloads',
  cancelDownloads: 'app:cancel-downloads',
  earnTokens: 'app:earn-tokens',
  revealPath: 'app:reveal-path',
  openExternal: 'app:open-external',
  getTools: 'tools:get',
  checkYtdlpUpdate: 'tools:check-update',
  updateYtdlp: 'tools:update',
  stateChanged: 'state:changed',
  progressChanged: 'progress:changed',
  toast: 'toast:message',
  openSettings: 'ui:open-settings'
} as const
