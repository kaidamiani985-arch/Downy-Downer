#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.join(root, 'release')
const builtApp = path.join(releaseDir, 'mac-universal', 'Downy Downloader.app')
const finalApp = path.join(releaseDir, 'Downy Downloader.app')
const dmgOutputDir = path.join(releaseDir, 'dmg-build')
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
const finalDmg = path.join(releaseDir, `Downy-Downloader-${packageVersion}-universal.dmg`)

function log(message) {
  process.stdout.write(`[package] ${message}\n`)
}

function run(command, args, options = {}) {
  log(`${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false', ...(options.env ?? {}) }
  })
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`)
  }
  return result
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`)
  }
  return `${result.stdout}${result.stderr}`.trim()
}

function moveYtdlpOutside(appPath, destination) {
  const source = path.join(appPath, 'Contents', 'Resources', 'bin', 'yt-dlp')
  if (!fs.existsSync(source)) throw new Error(`yt-dlp is missing from ${appPath}`)
  fs.renameSync(source, destination)
}

function restoreYtdlp(appPath, source) {
  fs.renameSync(source, path.join(appPath, 'Contents', 'Resources', 'bin', 'yt-dlp'))
}

function findDmg() {
  if (!fs.existsSync(dmgOutputDir)) return null
  const stack = [dmgOutputDir]
  while (stack.length) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.name.endsWith('.dmg')) return full
    }
  }
  return null
}

function sha256(file) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(file))
  return hash.digest('hex')
}

function main() {
  if (!fs.existsSync(path.join(root, 'vendor', 'bin', 'yt-dlp'))) {
    throw new Error('Bundled tools are missing. Run npm run fetch:binaries.')
  }
  if (!fs.existsSync(path.join(root, 'build', 'icon.icns'))) {
    throw new Error('App icon is missing. Run npm run make:icons.')
  }
  if (!fs.existsSync(path.join(root, 'out', 'main', 'index.js'))) {
    throw new Error('Compiled app is missing. Run npm run build.')
  }

  fs.mkdirSync(releaseDir, { recursive: true })
  fs.rmSync(path.join(releaseDir, 'mac-universal'), { recursive: true, force: true })
  fs.rmSync(dmgOutputDir, { recursive: true, force: true })
  fs.rmSync(finalApp, { recursive: true, force: true })
  fs.rmSync(finalDmg, { force: true })

  run('npx', ['electron-builder', '--mac', 'dir', '--universal', '--config', 'electron-builder.yml'])
  if (!fs.existsSync(builtApp)) throw new Error(`Expected app at ${builtApp}`)

  const backup = path.join(releaseDir, '.yt-dlp-unsigned-backup')
  fs.rmSync(backup, { force: true })
  moveYtdlpOutside(builtApp, backup)
  try {
    log('ad-hoc signing nested code')
    run('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', builtApp])
  } finally {
    restoreYtdlp(builtApp, backup)
  }
  log('sealing the outer app bundle')
  run('codesign', ['--force', '--sign', '-', '--timestamp=none', builtApp])
  log('verifying signature')
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', builtApp])
  run(path.join(builtApp, 'Contents', 'Resources', 'bin', 'yt-dlp'), ['--version'])

  const mainExecutable = path.join(builtApp, 'Contents', 'MacOS', 'Downy Downloader')
  const electronFramework = path.join(
    builtApp,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
    'Electron Framework'
  )
  log(`main executable architectures: ${capture('lipo', ['-archs', mainExecutable])}`)
  log(`electron framework architectures: ${capture('lipo', ['-archs', electronFramework])}`)
  log(`yt-dlp architectures: ${capture('lipo', ['-archs', path.join(builtApp, 'Contents', 'Resources', 'bin', 'yt-dlp')])}`)

  fs.renameSync(builtApp, finalApp)

  run('npx', [
    'electron-builder',
    '--mac',
    'dmg',
    '--prepackaged',
    finalApp,
    '--config',
    'electron-builder-dmg.yml'
  ])
  const dmg = findDmg()
  if (!dmg) throw new Error('electron-builder did not produce a DMG')
  fs.copyFileSync(dmg, finalDmg)

  const digest = sha256(finalDmg)
  fs.writeFileSync(
    path.join(releaseDir, 'SHA256SUMS.txt'),
    `${digest}  ${path.basename(finalDmg)}\n`,
    'utf8'
  )

  log(`app: ${finalApp}`)
  log(`dmg: ${finalDmg}`)
  log(`sha256: ${digest}`)
  log(`size: ${(fs.statSync(finalDmg).size / 1024 / 1024).toFixed(1)} MB`)
}

main()
