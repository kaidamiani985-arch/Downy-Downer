#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.join(root, 'release')
const winBuildDir = path.join(releaseDir, 'win-build')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = String(packageJson.version)
const appDir = path.join(winBuildDir, 'win-unpacked')
const exePath = path.join(appDir, 'Downy Downloader.exe')
const installerPath = path.join(releaseDir, `Downy-Downloader-${version}-windows-x64-setup.exe`)

function log(message) {
  process.stdout.write(`[package-win] ${message}\n`)
}

function run(command, args, options = {}) {
  log(`${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...(options.env ?? {}) }
  })
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`)
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`)
  }
  return `${result.stdout}${result.stderr}`.trim()
}

function sha256(file) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(file))
  return hash.digest('hex')
}

if (!fs.existsSync(path.join(root, 'out', 'main', 'index.js'))) {
  throw new Error('Compiled app is missing. Run npm run build first.')
}
if (!fs.existsSync(path.join(root, 'vendor', 'win-bin', 'yt-dlp.exe'))) {
  throw new Error('Windows binaries are missing. Run npm run fetch:win-binaries.')
}
if (!fs.existsSync(path.join(root, 'build', 'icon.ico'))) {
  throw new Error('Windows icon is missing. Run npm run make:win-icon.')
}

fs.rmSync(winBuildDir, { recursive: true, force: true })
fs.rmSync(installerPath, { force: true })

run('npx', ['electron-builder', '--win', 'dir', '--x64', '--config', 'electron-builder-win.yml'])
if (!fs.existsSync(exePath)) {
  throw new Error(`Expected Windows app at ${exePath}`)
}

run('node', ['scripts/patch-win-exe.mjs', exePath, path.join(root, 'build', 'icon.ico')])

log('building the Windows installer')
const scriptsDir = path.join(root, 'scripts')
const appDirFromScripts = path.relative(scriptsDir, appDir).split(path.sep).join('/')
const installerFromScripts = path.relative(scriptsDir, installerPath).split(path.sep).join('/')
run('makensis', [
  `-DVERSION=${version}`,
  `-DVERSION4=${version}.0`,
  `-DAPP_DIR=${appDirFromScripts}`,
  `-DOUTFILE=${installerFromScripts}`,
  'scripts/windows-installer.nsi'
])

if (!fs.existsSync(installerPath)) {
  throw new Error('makensis did not produce the installer.')
}

const size = fs.statSync(installerPath).size
const digest = sha256(installerPath)
fs.writeFileSync(
  path.join(releaseDir, 'SHA256SUMS-windows.txt'),
  `${digest}  ${path.basename(installerPath)}\n`,
  'utf8'
)

log(`installer: ${installerPath}`)
log(`sha256: ${digest}`)
log(`size: ${(size / 1024 / 1024).toFixed(1)} MB`)
try {
  log(`exe format: ${capture('file', [exePath]).split(':').at(-1)?.trim() ?? 'unknown'}`)
} catch {
  log('exe format check skipped')
}
