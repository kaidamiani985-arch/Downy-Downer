#!/usr/bin/env node
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const binDir = path.join(root, 'vendor', 'bin')
const licenseDir = path.join(root, 'vendor', 'licenses')
const tmpDir = path.join(root, 'vendor', '.downloads')
const versionsFile = path.join(binDir, 'versions.json')

const YTDLP_VERSION = '2026.10.26'
const DENO_VERSION = '2.9.8'
const FFMPEG_VERSION = 'b6.1.1'

const versions = {
  ytdlp: YTDLP_VERSION,
  deno: DENO_VERSION,
  ffmpeg: FFMPEG_VERSION
}

const files = {
  ytdlp: path.join(binDir, 'yt-dlp'),
  denoArm: path.join(binDir, 'deno-arm64'),
  denoX64: path.join(binDir, 'deno-x64'),
  ffmpegArm: path.join(binDir, 'ffmpeg-arm64'),
  ffmpegX64: path.join(binDir, 'ffmpeg-x64'),
  ffprobeArm: path.join(binDir, 'ffprobe-arm64'),
  ffprobeX64: path.join(binDir, 'ffprobe-x64')
}

function log(message) {
  process.stdout.write(`[binaries] ${message}\n`)
}

async function download(url, destination) {
  log(`download ${url}`)
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status} ${response.statusText}): ${url}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
  const size = statSync(destination).size
  if (size < 100_000) throw new Error(`Downloaded file is suspiciously small: ${destination}`)
  return destination
}

async function downloadText(url) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`Fetch failed (${response.status}): ${url}`)
  return response.text()
}

function sha256(file) {
  const hash = crypto.createHash('sha256')
  hash.update(readFileSync(file))
  return hash.digest('hex')
}

function expectedHash(sumsText, filename) {
  const line = sumsText
    .split(/\r?\n/)
    .find((entry) => entry.trim().split(/\s+/).at(-1) === filename)
  return line?.trim().split(/\s+/)[0]?.toLowerCase()
}

function verify(file, expected, label) {
  if (!expected) throw new Error(`No checksum found for ${label}`)
  const actual = sha256(file)
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${label}\n  expected ${expected}\n  actual   ${actual}`)
  }
  log(`verified ${label}`)
}

async function gunzipTo(source, destination) {
  await pipeline(
    Readable.fromWeb((await fetch(source, { redirect: 'follow' })).body),
    createGunzip(),
    createWriteStream(destination)
  )
  chmodSync(destination, 0o755)
}

async function fetchYtdlp() {
  const base = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}`
  const sums = await downloadText(`${base}/SHA2-256SUMS`)
  const archive = await download(`${base}/yt-dlp_macos`, files.ytdlp)
  verify(archive, expectedHash(sums, 'yt-dlp_macos'), 'yt-dlp_macos')
  chmodSync(files.ytdlp, 0o755)
}

async function fetchDeno() {
  const base = `https://github.com/denoland/deno/releases/download/v${DENO_VERSION}`
  const targets = [
    ['deno-aarch64-apple-darwin.zip', files.denoArm],
    ['deno-x86_64-apple-darwin.zip', files.denoX64]
  ]

  for (const [asset, destination] of targets) {
    const sumText = await downloadText(`${base}/${asset}.sha256sum`)
    const expected = sumText.trim().split(/\s+/)[0]
    const zipPath = path.join(tmpDir, asset)
    await download(`${base}/${asset}`, zipPath)
    verify(zipPath, expected, asset)

    const outDir = path.join(tmpDir, asset.replace('.zip', ''))
    rmSync(outDir, { recursive: true, force: true })
    mkdirSync(outDir, { recursive: true })
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', outDir])
    const extracted = path.join(outDir, 'deno')
    if (!existsSync(extracted)) throw new Error(`Deno binary missing from ${asset}`)
    execFileSync('cp', [extracted, destination])
    chmodSync(destination, 0o755)
  }
}

async function fetchFfmpeg() {
  const base = `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_VERSION}`
  const targets = [
    ['ffmpeg-darwin-arm64.gz', files.ffmpegArm],
    ['ffmpeg-darwin-x64.gz', files.ffmpegX64],
    ['ffprobe-darwin-arm64.gz', files.ffprobeArm],
    ['ffprobe-darwin-x64.gz', files.ffprobeX64]
  ]

  for (const [asset, destination] of targets) {
    await gunzipTo(`${base}/${asset}`, destination)
    log(`unpacked ${asset}`)
  }
}

async function fetchLicenses() {
  mkdirSync(licenseDir, { recursive: true })
  const ytBase = `https://raw.githubusercontent.com/yt-dlp/yt-dlp/${YTDLP_VERSION}`
  const denoBase = `https://raw.githubusercontent.com/denoland/deno/v${DENO_VERSION}`
  const ffBase = `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_VERSION}`

  const jobs = [
    [`${ytBase}/LICENSE`, 'yt-dlp-LICENSE.txt'],
    [`${ytBase}/THIRD_PARTY_LICENSES.txt`, 'yt-dlp-THIRD_PARTY_LICENSES.txt'],
    [`${denoBase}/LICENSE.md`, 'deno-LICENSE.md'],
    [`${ffBase}/darwin-arm64.LICENSE`, 'ffmpeg-LICENSE.txt'],
    [`${ffBase}/darwin-x64.LICENSE`, 'ffmpeg-x64-LICENSE.txt']
  ]

  for (const [url, filename] of jobs) {
    try {
      const content = await downloadText(url)
      writeFileSync(path.join(licenseDir, filename), content)
    } catch (error) {
      log(`license fetch skipped (${filename}): ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

function upToDate() {
  if (!existsSync(versionsFile)) return false
  try {
    const saved = JSON.parse(readFileSync(versionsFile, 'utf8'))
    if (saved.ytdlp !== versions.ytdlp || saved.deno !== versions.deno || saved.ffmpeg !== versions.ffmpeg) {
      return false
    }
    return Object.values(files).every((file) => existsSync(file) && statSync(file).size > 100_000)
  } catch {
    return false
  }
}

async function main() {
  mkdirSync(binDir, { recursive: true })
  mkdirSync(tmpDir, { recursive: true })

  if (upToDate() && process.env.FORCE_BINARIES !== '1') {
    log('bundled tools are already present and pinned')
    return
  }

  log(`fetching yt-dlp ${YTDLP_VERSION}, Deno ${DENO_VERSION}, FFmpeg ${FFMPEG_VERSION}`)
  await Promise.all([fetchYtdlp(), fetchDeno(), fetchFfmpeg(), fetchLicenses()])
  writeFileSync(versionsFile, `${JSON.stringify(versions, null, 2)}\n`)

  for (const [name, file] of Object.entries(files)) {
    const info = statSync(file)
    log(`${name}: ${(info.size / 1024 / 1024).toFixed(1)} MB`)
  }
  rmSync(tmpDir, { recursive: true, force: true })
  log('all bundled tools are ready')
}

main().catch((error) => {
  console.error(`[binaries] ${error instanceof Error ? error.stack : String(error)}`)
  process.exitCode = 1
})
