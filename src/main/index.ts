import { app, BrowserWindow, Menu, dialog, nativeImage, screen, session, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CHANNELS } from '../shared/api'
import type { AppSnapshot, ToastPayload } from '../shared/types'
import { BinaryManager } from './binaries'
import { DownloadManager } from './downloads'
import { registerIpc } from './ipc'
import { Store } from './store'
import { checkForAppUpdate } from './updater'
import { YtDlpService } from './ytdlp'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const isDev = Boolean(process.env.ELECTRON_RENDERER_URL)

app.setName('Downy Downloader')
app.name = 'Downy Downloader'

if (process.platform === 'win32') {
  app.setAppUserModelId('com.kaidamiani.downydownloader')
}

if (!app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', '9333')
  app.commandLine.appendSwitch('remote-allow-origins', '*')
}

let mainWindow: BrowserWindow | null = null
let store: Store | null = null
let downloads: DownloadManager | null = null
let quitting = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    try {
      downloads?.shutdown()
    } catch (error) {
      console.error('Could not shut down downloads cleanly:', error)
    }
    try {
      store?.flush()
    } catch (error) {
      console.error('Could not flush state:', error)
    }
    setTimeout(() => app.quit(), 350)
  })

  app.whenReady().then(bootstrap).catch((error) => {
    console.error(error)
    dialog.showErrorBox('Downy Downloader could not start', error instanceof Error ? error.message : String(error))
    app.quit()
  })
}

async function bootstrap(): Promise<void> {
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: 'Downy Downloader',
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: 'Copyright © 2026 Kai Damiani',
      credits:
        'A small, local YouTube downloader with a token wallet.\n\nBundled tools: yt-dlp, Deno, FFmpeg and FFprobe. See the licenses folder for their notices.'
    })
  }

  if (isDev && app.dock) {
    const devIcon = path.join(process.cwd(), 'build', 'icon.png')
    if (fs.existsSync(devIcon)) {
      app.dock.setIcon(nativeImage.createFromPath(devIcon))
    }
  }

  configureSecurity()

  store = new Store(app.getPath('userData'), app.getPath('downloads'), app.getVersion())
  const binaryManager = new BinaryManager(app.getPath('userData'))
  try {
    binaryManager.install()
  } catch (error) {
    dialog.showErrorBox(
      'Bundled tools are missing',
      `Downy Downloader could not set up its bundled download tools.\n\n${
        error instanceof Error ? error.message : String(error)
      }\n\nIf you are running from source, run: npm run fetch:binaries`
    )
    app.quit()
    return
  }

  const ytdlp = new YtDlpService(binaryManager, () => store!.data.settings)
  mainWindow = createWindow()

  const send = (channel: string, payload?: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload)
    }
  }

  const toast = (payload: ToastPayload) => send(CHANNELS.toast, payload)

  downloads = new DownloadManager(store, binaryManager, ytdlp, mainWindow, {
    onState: () => broadcastState(),
    onProgress: (progress) => send(CHANNELS.progressChanged, progress),
    onToast: toast
  })

  const getSnapshot = (): AppSnapshot => store!.snapshot(downloads!.getActive())

  const broadcastState = () => {
    send(CHANNELS.stateChanged, getSnapshot())
  }

  registerIpc({
    win: mainWindow,
    store,
    binaries: binaryManager,
    ytdlp,
    downloads,
    getSnapshot,
    broadcastState
  })

  buildMenu()

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  await loadWindow(mainWindow)

  setTimeout(() => {
    void maybeAutoCheckYtdlp(binaryManager, toast, broadcastState)
  }, 5_000)

  if (app.isPackaged) {
    setTimeout(() => {
      void maybeAutoCheckAppUpdate(toast)
    }, 9_000)
  }
}

function createWindow(): BrowserWindow {
  const workArea = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(1240, Math.max(900, workArea.width - 48))
  const height = Math.min(830, Math.max(580, workArea.height - 48))

  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(960, width),
    minHeight: Math.min(640, height),
    center: true,
    show: false,
    backgroundColor: '#0a0d0b',
    title: 'Downy Downloader',
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 20 } }
      : { autoHideMenuBar: true }),
    webPreferences: {
      preload: path.join(currentDir, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: true
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalIfAllowed(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    if (url !== current) {
      event.preventDefault()
      void openExternalIfAllowed(url)
    }
  })

  win.on('closed', () => {
    mainWindow = null
  })

  return win
}

async function loadWindow(win: BrowserWindow): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    await win.loadURL(devUrl)
  } else {
    await win.loadFile(path.join(currentDir, '../renderer/index.html'))
  }
}

function configureSecurity(): void {
  if (app.isPackaged) {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://i.ytimg.com https://img.youtube.com",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'none'"
    ].join('; ')

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp]
        }
      })
    })
  }

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
}

function buildMenu(): void {
  const openSettings = () => {
    mainWindow?.show()
    mainWindow?.focus()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(CHANNELS.openSettings)
    }
  }

  const checkForUpdatesItem: Electron.MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => {
      void checkForUpdatesFromMenu(openSettings)
    }
  }

  const settingsItem: Electron.MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: 'CommandOrControl+,',
    click: openSettings
  }

  const helpMenu: Electron.MenuItemConstructorOptions = {
    role: 'help',
    submenu: [
      ...(process.platform === 'darwin' ? [] : [checkForUpdatesItem, { type: 'separator' as const }]),
      {
        label: 'yt-dlp on GitHub',
        click: () => {
          void shell.openExternal('https://github.com/yt-dlp/yt-dlp')
        }
      },
      {
        label: 'Show Data Folder',
        click: () => {
          void shell.openPath(app.getPath('userData'))
        }
      },
      {
        label: 'Show Licenses',
        click: () => {
          const licenses = app.isPackaged
            ? path.join(process.resourcesPath, 'licenses')
            : path.join(process.cwd(), 'vendor', 'licenses')
          void shell.openPath(licenses)
        }
      },
      ...(process.platform === 'darwin'
        ? []
        : ([
            { type: 'separator' },
            {
              label: 'About Downy Downloader',
              click: () => {
                void showMessage({
                  type: 'info',
                  title: 'About Downy Downloader',
                  message: `Downy Downloader ${app.getVersion()}`,
                  detail:
                    'A small, local YouTube downloader with a token wallet.\n\nBundled tools: yt-dlp, Deno, FFmpeg and FFprobe.'
                })
              }
            }
          ] as Electron.MenuItemConstructorOptions[]))
    ]
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              checkForUpdatesItem,
              { type: 'separator' },
              settingsItem,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          } as Electron.MenuItemConstructorOptions
        ]
      : [
          {
            label: 'File',
            submenu: [settingsItem, { type: 'separator' }, { role: 'quit' }]
          } as Electron.MenuItemConstructorOptions
        ]),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...(isDev
          ? ([{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }] as const)
          : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    helpMenu
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function checkForUpdatesFromMenu(openSettings: () => void): Promise<void> {
  mainWindow?.show()
  mainWindow?.focus()

  const result = await checkForAppUpdate(true)
  if (!result.ok) {
    await showMessage({
      type: 'warning',
      title: 'Check for updates',
      message: 'Could not check for updates.',
      detail: result.message ?? 'Try again in a moment.'
    })
    return
  }

  if (!result.updateAvailable) {
    await showMessage({
      type: 'info',
      title: 'Check for updates',
      message: "You're up to date.",
      detail: `Downy ${app.getVersion()} is the latest version.`
    })
    return
  }

  const response = await showMessage({
    type: 'info',
    title: 'Update available',
    message: `Downy ${result.latestVersion} is available.`,
    detail: 'Open Settings → Updates to download and install it.',
    buttons: ['Open Settings', 'Later'],
    defaultId: 0,
    cancelId: 1
  })

  if (response === 0) openSettings()
}

function showMessage(options: Electron.MessageBoxOptions): Promise<number> {
  return mainWindow && !mainWindow.isDestroyed()
    ? dialog.showMessageBox(mainWindow, options).then((result) => result.response)
    : dialog.showMessageBox(options).then((result) => result.response)
}

async function maybeAutoCheckAppUpdate(toast: (payload: ToastPayload) => void): Promise<void> {
  const result = await checkForAppUpdate(false)
  if (result.ok && result.updateAvailable && result.latestVersion) {
    toast({
      type: 'info',
      message: `Downy ${result.latestVersion} is available. Open Settings → Updates to install it.`
    })
  }
}

async function maybeAutoCheckYtdlp(
  binaries: BinaryManager,
  toast: (payload: ToastPayload) => void,
  broadcastState: () => void
): Promise<void> {
  if (!store) return
  const settings = store.data.settings
  if (!settings.autoCheckYtdlp) return
  if (settings.lastYtdlpCheck && Date.now() - settings.lastYtdlpCheck < 3 * 24 * 60 * 60 * 1000) {
    return
  }

  const check = await binaries.checkForUpdate()
  if (!store) return
  store.updateSettings({ lastYtdlpCheck: Date.now() })
  broadcastState()
  if (check.ok && check.updateAvailable) {
    toast({
      type: 'info',
      message: `yt-dlp ${check.latest ?? ''} is available. Update it in Settings → Advanced.`
    })
  }
}

async function openExternalIfAllowed(rawUrl: string): Promise<void> {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') return
    if (
      url.hostname === 'github.com' ||
      url.hostname === 'www.github.com' ||
      url.hostname === 'youtube.com' ||
      url.hostname === 'www.youtube.com' ||
      url.hostname === 'yt-dlp.github.io'
    ) {
      await shell.openExternal(url.toString())
    }
  } catch {
    // Ignore malformed links.
  }
}
