#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as PELibrary from 'pe-library'
import * as ResEdit from 'resedit'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = String(packageJson.version)
const parts = version.split('.').map((part) => Number.parseInt(part, 10) || 0)

const exePath = process.argv[2] ?? path.join(root, 'release', 'win-build', 'win-unpacked', 'Downy Downloader.exe')
const iconPath = process.argv[3] ?? path.join(root, 'build', 'icon.ico')

if (!fs.existsSync(exePath)) throw new Error(`Windows executable not found: ${exePath}`)
if (!fs.existsSync(iconPath)) throw new Error(`Windows icon not found: ${iconPath}`)

const exe = PELibrary.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true })
const resources = PELibrary.NtExecutableResource.from(exe)
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath))
const icons = iconFile.icons.map((item) => item.data)

const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries)
if (groups.length === 0) {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 101, 1033, icons)
} else {
  for (const group of groups) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icons)
  }
}

for (const info of ResEdit.Resource.VersionInfo.fromEntries(resources.entries)) {
  const language = typeof info.lang === 'number' ? info.lang : 1033
  info.setFileVersion(parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, 0, language)
  info.setProductVersion(parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, 0, language)
  info.setStringValues(
    { lang: language, codepage: 1200 },
    {
      FileDescription: 'Downy Downloader',
      ProductName: 'Downy Downloader',
      CompanyName: 'Kai Damiani',
      LegalCopyright: 'Copyright (C) 2026 Kai Damiani',
      OriginalFilename: 'Downy Downloader.exe',
      InternalName: 'Downy Downloader',
      Comments: 'https://github.com/kaidamiani985-arch/Downy-Downer'
    }
  )
  info.outputToResourceEntries(resources.entries)
}

resources.outputResource(exe)
const output = Buffer.from(exe.generate())
fs.writeFileSync(exePath, output)
process.stdout.write(`[win-exe] patched ${path.relative(root, exePath)} (icon + version ${version})\n`)
