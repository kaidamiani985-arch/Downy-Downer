#!/usr/bin/env node
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const binDir = path.join(root, 'vendor', 'win-bin')
const licenseDir = path.join(root, 'vendor', 'licenses')

const YTDLP_VERSION = '2026.10.26'
const DENO_VERSION = '2.9.8'

const downloadUrls = {
  ytdlp: `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp.exe`,
  deno: `https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-x86_64-pc-windows-msvc.zip`,
  ffmpeg: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
}

const hashes = {
  'yt-dlp.exe': 'f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d',
  'deno-x64.exe': '924397800533d3eb0ed0c889b20ad70e18b970d93acd8135bc043f425e528266',
  'ffmpeg-x64.exe': 'ed8f66cb877087a96f5bbb40a2944f0e764f2ad8870d5cb647360d912e62bc07',
  'ffprobe-x64.exe': 'df0199f606faa88e9ad192732a7c3987acfb647663534c297772e17730611a08'
}

function log(message) {
  process.stdout.write(`[win-binaries] ${message}\n`)
}

function sha256(file) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(file))
  return hash.digest('hex')
}

async function download(url, destination) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    log(`downloading ${url}${attempt > 1 ? ` (attempt ${attempt})` : ''}`)
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Downy-Downloader-build' }
      })
      if (!response.ok || !response.body) {
        throw new Error(`Download failed (${response.status}) for ${url}`)
      }
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination))
      return
    } catch (error) {
      if (attempt === 4) throw error
      log(`download interrupted: ${error instanceof Error ? error.message : String(error)}`)
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt))
    }
  }
}

async function extractZip(zipFile, destination) {
  await fsp.rm(destination, { recursive: true, force: true })
  await fsp.mkdir(destination, { recursive: true })
  execFileSync('tar', ['-xf', zipFile, '-C', destination], { stdio: 'ignore' })
}

async function findFile(rootDir, fileName) {
  const queue = [rootDir]
  while (queue.length) {
    const current = queue.shift()
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) queue.push(full)
      else if (entry.name.toLowerCase() === fileName.toLowerCase()) return full
    }
  }
  return null
}

async function main() {
  await fsp.mkdir(binDir, { recursive: true })
  await fsp.mkdir(licenseDir, { recursive: true })
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'downy-win-bin-'))

  try {
    const ytdlp = path.join(binDir, 'yt-dlp.exe')
    if (!fs.existsSync(ytdlp) || fs.statSync(ytdlp).size < 1_000_000) {
      await download(downloadUrls.ytdlp, ytdlp)
    }

    if (!fs.existsSync(path.join(binDir, 'deno-x64.exe'))) {
      const denoZip = path.join(temp, 'deno.zip')
      await download(downloadUrls.deno, denoZip)
      const denoDir = path.join(temp, 'deno')
      await extractZip(denoZip, denoDir)
      const deno = await findFile(denoDir, 'deno.exe')
      if (!deno) throw new Error('deno.exe was not found in the Deno archive.')
      await fsp.copyFile(deno, path.join(binDir, 'deno-x64.exe'))
    }

    const ffmpegZip = path.join(temp, 'ffmpeg.zip')
    await download(downloadUrls.ffmpeg, ffmpegZip)
    const ffmpegDir = path.join(temp, 'ffmpeg')
    await extractZip(ffmpegZip, ffmpegDir)

    const ffmpeg = await findFile(ffmpegDir, 'ffmpeg.exe')
    const ffprobe = await findFile(ffmpegDir, 'ffprobe.exe')
    if (!ffmpeg || !ffprobe) throw new Error('ffmpeg.exe or ffprobe.exe was not found in the FFmpeg archive.')
    await fsp.copyFile(ffmpeg, path.join(binDir, 'ffmpeg-x64.exe'))
    await fsp.copyFile(ffprobe, path.join(binDir, 'ffprobe-x64.exe'))

    for (const [name, expected] of Object.entries(hashes)) {
      const file = path.join(binDir, name)
      const stat = await fsp.stat(file)
      if (stat.size < 1_000_000) throw new Error(`${name} looks too small (${stat.size} bytes).`)
      const digest = sha256(file)
      if (expected && digest !== expected) {
        throw new Error(`${name} checksum mismatch.\nexpected ${expected}\nactual   ${digest}`)
      }
      log(`${name}: ${(stat.size / 1024 / 1024).toFixed(1)} MB  sha256=${digest}`)
    }

    await fsp.writeFile(
      path.join(binDir, 'README.txt'),
      `Windows tools for Downy Downloader\n\nyt-dlp ${YTDLP_VERSION}\nDeno ${DENO_VERSION}\nFFmpeg essentials build\n`
    )
    log('Windows binaries are ready in vendor/win-bin')
  } finally {
    await fsp.rm(temp, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
