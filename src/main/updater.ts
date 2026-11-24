import { app, net } from 'electron'
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { AppUpdateCheck, AppUpdateProgress } from '../shared/types'

const REPOSITORY = 'kaidamiani985-arch/Downy-Downer'
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`
const API_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`
const CACHE_MS = 10 * 60 * 1000

let cached: { at: number; result: AppUpdateCheck } | null = null
let installing = false

interface GithubAsset {
  name: string
  browser_download_url: string
  size: number
}

interface GithubRelease {
  tag_name?: string
  html_url?: string
  published_at?: string
  body?: string
  assets?: GithubAsset[]
}

export function appVersion(): string {
  return app.getVersion()
}

export async function checkForAppUpdate(force = false): Promise<AppUpdateCheck> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) {
    return cached.result
  }

  const base: AppUpdateCheck = {
    ok: true,
    currentVersion: app.getVersion(),
    updateAvailable: false,
    releaseUrl: RELEASES_URL
  }

  try {
    const response = await net.fetch(API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Downy-Downloader/${app.getVersion()}`
      }
    })

    if (response.status === 403 || response.status === 429) {
      return cache({
        ...base,
        ok: false,
        message: 'GitHub is rate-limiting update checks. Try again later.'
      })
    }

    if (!response.ok) {
      return cache({
        ...base,
        ok: false,
        message: `GitHub returned ${response.status} while checking for updates.`
      })
    }

    const release = (await response.json()) as GithubRelease
    const latest = (release.tag_name ?? '').replace(/^v/i, '').trim()
    if (!latest) {
      return cache({ ...base, ok: false, message: 'The latest release has no version tag.' })
    }

    const assets = Array.isArray(release.assets) ? release.assets : []
    const asset = assets.find((candidate) => {
      if (!candidate.browser_download_url.startsWith('https://')) return false
      const name = candidate.name.toLowerCase()
      if (process.platform === 'darwin') return name.endsWith('.dmg')
      if (process.platform === 'win32') return name.endsWith('.exe') && name.includes('windows')
      return false
    })

    const updateAvailable = compareVersions(latest, app.getVersion()) > 0
    const result: AppUpdateCheck = {
      ...base,
      latestVersion: latest,
      updateAvailable,
      downloadUrl: asset?.browser_download_url ?? null,
      releaseUrl: release.html_url ?? `${RELEASES_URL}/tag/v${latest}`,
      publishedAt: release.published_at ?? undefined,
      message: updateAvailable
        ? `Downy ${latest} is available.`
        : `Downy ${app.getVersion()} is up to date.`
    }

    if (updateAvailable && !asset) {
      result.ok = false
      result.updateAvailable = false
      result.message = `Downy ${latest} is available, but the release has no installer for this platform yet.`
    }

    return cache(result)
  } catch (error) {
    return cache({
      ...base,
      ok: false,
      message: error instanceof Error ? `Could not check for updates: ${error.message}` : 'Could not check for updates.'
    })
  }
}

export async function installAppUpdate(
  onProgress: (progress: AppUpdateProgress) => void
): Promise<{ ok: boolean; message?: string }> {
  if (installing) {
    return { ok: false, message: 'An update is already in progress.' }
  }

  if (!app.isPackaged) {
    return { ok: false, message: 'Updates can only be installed from the installed app.' }
  }
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return { ok: false, message: 'Updates are not supported on this platform yet.' }
  }

  let bundle: string | null = null
  if (process.platform === 'darwin') {
    bundle = currentAppBundle()
    if (!bundle) {
      return { ok: false, message: 'Downy could not find its application folder.' }
    }
    if (bundle.includes('/AppTranslocation/')) {
      return {
        ok: false,
        message: 'macOS is running Downy from a temporary location. Move it to Applications, then try again.'
      }
    }

    const parent = path.dirname(bundle)
    try {
      await fsp.access(parent, fs.constants.W_OK)
    } catch {
      return {
        ok: false,
        message: `Downy cannot write to ${parent}. Move the app to Applications, then try again.`
      }
    }
  }

  const check = await checkForAppUpdate(true)
  if (!check.ok || !check.updateAvailable || !check.downloadUrl) {
    return { ok: false, message: check.message ?? 'There is no update to install.' }
  }

  installing = true
  let downloadPath: string | null = null
  let mountPoint: string | null = null

  try {
    const downloadsDir = path.join(app.getPath('temp'), 'downy-update')
    await fsp.mkdir(downloadsDir, { recursive: true })
    const urlName = path.basename(new URL(check.downloadUrl).pathname)
    const fallbackName =
      process.platform === 'win32'
        ? `Downy-Downloader-${check.latestVersion}-windows-x64-setup.exe`
        : `Downy-${check.latestVersion}.dmg`
    downloadPath = path.join(downloadsDir, urlName || fallbackName)

    onProgress({ phase: 'download', percent: 0, message: `Downloading Downy ${check.latestVersion}…` })
    await downloadFile(check.downloadUrl, downloadPath, (percent) => {
      onProgress({
        phase: 'download',
        percent,
        message: percent > 0 ? `Downloading Downy ${check.latestVersion}… ${percent}%` : `Downloading Downy ${check.latestVersion}…`
      })
    })

    const stat = await fsp.stat(downloadPath)
    if (stat.size < 20 * 1024 * 1024) {
      throw new Error('The update download looks incomplete.')
    }

    if (process.platform === 'win32') {
      onProgress({ phase: 'restart', percent: 100, message: 'Opening the Windows installer…' })
      const installer = spawn(downloadPath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      })
      installer.unref()
      setTimeout(() => app.quit(), 900)
      return { ok: true, message: 'Opening the Windows installer.' }
    }

    mountPoint = await fsp.mkdtemp(path.join(os.tmpdir(), 'downy-mount-'))
    onProgress({ phase: 'install', percent: 100, message: 'Opening the update…' })
    await run('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mountPoint, downloadPath])

    const appName = (await fsp.readdir(mountPoint)).find((entry) => entry.endsWith('.app'))
    if (!appName) {
      throw new Error('The update does not contain a Downy app.')
    }

    const stagingRoot = path.join(os.tmpdir(), 'downy-staged-update')
    await fsp.rm(stagingRoot, { recursive: true, force: true })
    await fsp.mkdir(stagingRoot, { recursive: true })
    const stagedApp = path.join(stagingRoot, appName)
    onProgress({ phase: 'install', percent: 100, message: 'Preparing the new version…' })
    await run('ditto', [path.join(mountPoint, appName), stagedApp])

    const helper = path.join(os.tmpdir(), 'downy-install-update.sh')
    await fsp.writeFile(helper, INSTALL_SCRIPT, { encoding: 'utf8', mode: 0o755 })

    onProgress({ phase: 'restart', percent: 100, message: 'Restarting to finish the update…' })

    const child = spawn('/bin/sh', [helper, bundle!, stagedApp, downloadPath, String(process.pid), mountPoint], {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()

    setTimeout(() => app.quit(), 350)
    return { ok: true, message: 'Restarting to finish the update.' }
  } catch (error) {
    if (mountPoint) {
      await run('hdiutil', ['detach', mountPoint, '-force']).catch(() => undefined)
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The update could not be installed.'
    }
  } finally {
    installing = false
  }
}

const INSTALL_SCRIPT = `#!/bin/sh
set -u
APP="$1"
NEW="$2"
DMG="$3"
PID="$4"
MOUNT="$5"

LOG="$HOME/Library/Logs/DownyUpdater.log"
mkdir -p "$HOME/Library/Logs" 2>/dev/null || true
exec >>"$LOG" 2>&1
echo "[$(date)] Installing Downy update"
echo "app=$APP new=$NEW dmg=$DMG"

# Wait for the running app to close.
while kill -0 "$PID" 2>/dev/null; do
  sleep 0.2
done
sleep 0.4

BACKUP="\${APP}.downy-old"
rm -rf "$BACKUP"

if [ -d "$APP" ]; then
  if ! mv "$APP" "$BACKUP"; then
    echo "Could not move the old app aside"
    /usr/bin/hdiutil detach "$MOUNT" -force >/dev/null 2>&1 || true
    /usr/bin/open "$DMG"
    exit 1
  fi
fi

if /usr/bin/ditto "$NEW" "$APP"; then
  echo "Copy succeeded"
  /usr/bin/xattr -dr com.apple.quarantine "$APP" >/dev/null 2>&1 || true
  rm -rf "$BACKUP"
  rm -rf "$(dirname "$NEW")"
  /usr/bin/hdiutil detach "$MOUNT" -force >/dev/null 2>&1 || true
  rm -f "$DMG"
  /usr/bin/open "$APP"
else
  echo "Copy failed; restoring the old app and opening the DMG"
  rm -rf "$APP"
  mv "$BACKUP" "$APP"
  /usr/bin/open "$APP"
  /usr/bin/open "$DMG"
fi

rm -rf "$MOUNT"
rm -f "$0"
`

function currentAppBundle(): string | null {
  const exe = app.getPath('exe')
  const bundle = path.resolve(path.dirname(exe), '..', '..')
  return bundle.endsWith('.app') ? bundle : null
}

async function downloadFile(
  url: string,
  target: string,
  onProgress: (percent: number) => void
): Promise<void> {
  const response = await net.fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': `Downy-Downloader/${app.getVersion()}` }
  })

  if (!response.ok || !response.body) {
    throw new Error(`The update download failed with status ${response.status}.`)
  }

  const total = Number(response.headers.get('content-length') ?? 0)
  let received = 0
  let lastReport = 0
  const source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  source.on('data', (chunk: Buffer) => {
    received += chunk.length
    const now = Date.now()
    if (now - lastReport > 160) {
      lastReport = now
      onProgress(total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0)
    }
  })

  await pipeline(source, fs.createWriteStream(target))
  onProgress(100)
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve(stdout)
    })
  })
}

function cache(result: AppUpdateCheck): AppUpdateCheck {
  cached = { at: Date.now(), result }
  return result
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}
