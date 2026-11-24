import { app } from 'electron'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import type { ToolsInfo, ToolVersions, UpdateCheck } from '../shared/types'

const execFileAsync = promisify(execFile)

const isWindows = process.platform === 'win32'
const exeSuffix = isWindows ? '.exe' : ''
const YTDLP_RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'

export class BinaryManager {
  readonly sourceDir: string
  readonly binDir: string
  private versionCache: { at: number; value: ToolsInfo } | null = null

  constructor(userDataDir: string) {
    this.sourceDir = app.isPackaged
      ? path.join(process.resourcesPath, 'bin')
      : path.join(process.cwd(), 'vendor', isWindows ? 'win-bin' : 'bin')
    this.binDir = path.join(userDataDir, 'bin')
  }

  get ytdlp(): string {
    return path.join(this.binDir, `yt-dlp${exeSuffix}`)
  }

  get deno(): string {
    return path.join(this.binDir, `deno${exeSuffix}`)
  }

  get ffmpeg(): string {
    return path.join(this.binDir, `ffmpeg${exeSuffix}`)
  }

  get ffprobe(): string {
    return path.join(this.binDir, `ffprobe${exeSuffix}`)
  }

  childEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, PYTHONUNBUFFERED: '1' }
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
    env[pathKey] = `${this.binDir}${path.delimiter}${env[pathKey] ?? ''}`
    return env
  }

  install(): void {
    if (!fs.existsSync(this.sourceDir)) {
      throw new Error(`Bundled tools are missing from ${this.sourceDir}. Run npm run fetch:binaries.`)
    }

    fs.mkdirSync(this.binDir, { recursive: true })

    const archSuffix = process.arch === 'arm64' ? 'arm64' : 'x64'
    const copies: Array<[string, string]> = [
      [path.join(this.sourceDir, `yt-dlp${exeSuffix}`), this.ytdlp],
      [path.join(this.sourceDir, `deno-${archSuffix}${exeSuffix}`), this.deno],
      [path.join(this.sourceDir, `ffmpeg-${archSuffix}${exeSuffix}`), this.ffmpeg],
      [path.join(this.sourceDir, `ffprobe-${archSuffix}${exeSuffix}`), this.ffprobe]
    ]

    for (const [source, destination] of copies) {
      if (!fs.existsSync(source)) {
        throw new Error(`Bundled tool is missing: ${path.basename(source)}`)
      }
      if (!fs.existsSync(destination)) {
        fs.copyFileSync(source, destination)
      }
      if (!isWindows) fs.chmodSync(destination, 0o755)
      this.removeQuarantine(destination)
    }

    fs.writeFileSync(
      path.join(this.binDir, 'README.txt'),
      'These tools were copied from Downy Downloader. They are managed by the app.\n'
    )
  }

  private removeQuarantine(file: string): void {
    if (isWindows) return
    try {
      execFileSyncQuiet('/usr/bin/xattr', ['-d', 'com.apple.quarantine', file])
    } catch {
      // The attribute usually does not exist on locally built copies.
    }
  }

  async getVersions(force = false): Promise<ToolsInfo> {
    if (!force && this.versionCache && Date.now() - this.versionCache.at < 30_000) {
      return this.versionCache.value
    }

    const versions: ToolVersions = {
      ytdlp: 'Unavailable',
      deno: 'Unavailable',
      ffmpeg: 'Unavailable'
    }

    const [ytdlp, deno, ffmpeg] = await Promise.allSettled([
      this.runVersion(this.ytdlp, ['--version']),
      this.runVersion(this.deno, ['--version']),
      this.runVersion(this.ffmpeg, ['-version'])
    ])

    if (ytdlp.status === 'fulfilled') versions.ytdlp = ytdlp.value.split(/\r?\n/)[0]?.trim() || 'Unknown'
    if (deno.status === 'fulfilled') versions.deno = deno.value.split(/\r?\n/)[0]?.trim() || 'Unknown'
    if (ffmpeg.status === 'fulfilled') versions.ffmpeg = ffmpeg.value.split(/\r?\n/)[0]?.trim() || 'Unknown'

    const value: ToolsInfo = {
      versions,
      paths: {
        ytdlp: this.ytdlp,
        deno: this.deno,
        ffmpeg: this.ffmpeg
      },
      error: [ytdlp, deno, ffmpeg].some((result) => result.status === 'rejected')
        ? 'One or more bundled tools could not be launched.'
        : undefined
    }
    this.versionCache = { at: Date.now(), value }
    return value
  }

  async checkForUpdate(): Promise<UpdateCheck> {
    try {
      const tools = await this.getVersions(true)
      const current = tools.versions.ytdlp === 'Unavailable' ? undefined : tools.versions.ytdlp
      const response = await fetch(YTDLP_RELEASE_API, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `Downy-Downloader/${app.getVersion()}`
        }
      })
      if (!response.ok) {
        return { ok: false, message: `GitHub returned ${response.status}.`, current }
      }
      const data = (await response.json()) as { tag_name?: string }
      const latest = data.tag_name?.trim()
      if (!latest) return { ok: false, message: 'Could not read the latest yt-dlp version.', current }
      return {
        ok: true,
        current,
        latest,
        updateAvailable: Boolean(current && latest !== current && latest > current),
        message:
          current && latest === current
            ? 'yt-dlp is up to date.'
            : `A newer yt-dlp is available (${latest}).`
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Could not check for an update.'
      }
    }
  }

  async updateYtdlp(): Promise<UpdateCheck> {
    try {
      const result = await execFileAsync(this.ytdlp, ['-U'], {
        cwd: this.binDir,
        timeout: 180_000,
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true
      })
      const output = `${result.stdout}\n${result.stderr}`.trim()
      this.versionCache = null
      const after = await this.checkForUpdate()
      return {
        ...after,
        ok: true,
        message: after.updateAvailable
          ? after.message
          : output.split(/\r?\n/).filter(Boolean).at(-1) || 'yt-dlp is up to date.'
      }
    } catch (error) {
      this.versionCache = null
      const details =
        error && typeof error === 'object' && 'stdout' in error
          ? String((error as { stdout?: string }).stdout ?? '')
          : ''
      const stderr =
        error && typeof error === 'object' && 'stderr' in error
          ? String((error as { stderr?: string }).stderr ?? '')
          : ''
      const message = `${stderr}\n${details}`.trim() || (error instanceof Error ? error.message : 'Update failed.')
      return { ok: false, message }
    }
  }

  private async runVersion(binary: string, args: string[]): Promise<string> {
    const result = await execFileAsync(binary, args, {
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true
    })
    return `${result.stdout}${result.stderr}`
  }
}

function execFileSyncQuiet(file: string, args: string[]): void {
  execFileSync(file, args, { stdio: 'ignore' })
}
