#!/usr/bin/env node
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'build')
const iconsetDir = path.join(buildDir, 'icon.iconset')

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="lift" cx="0.42" cy="0.32" r="0.8">
      <stop offset="0" stop-color="#1C1C1C"/>
      <stop offset="1" stop-color="#0A0A0A"/>
    </radialGradient>
    <filter id="coinShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="30" stdDeviation="30" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
  </defs>
  <rect x="40" y="40" width="944" height="944" rx="216" fill="url(#lift)"/>
  <rect x="43" y="43" width="938" height="938" rx="213" fill="none" stroke="#FFFFFF" stroke-opacity="0.09" stroke-width="4"/>
  <g filter="url(#coinShadow)">
    <circle cx="512" cy="512" r="300" fill="#FFC300"/>
    <circle cx="512" cy="512" r="300" fill="none" stroke="#FFFFFF" stroke-opacity="0.28" stroke-width="5"/>
    <circle cx="512" cy="512" r="214" fill="none" stroke="#0A0A0A" stroke-opacity="0.16" stroke-width="8"/>
    <path d="M 424 330 H 600 V 506 H 690 L 512 704 L 334 506 H 424 Z" fill="#0A0A0A"/>
  </g>
</svg>
`

const dmgSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="660" height="420" viewBox="0 0 660 420">
  <defs>
    <radialGradient id="warm" cx="0.18" cy="0.15" r="0.65">
      <stop offset="0" stop-color="#FFC300" stop-opacity="0.11"/>
      <stop offset="1" stop-color="#FFC300" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.1" fill="#FFFFFF" opacity="0.055"/>
    </pattern>
    <linearGradient id="line" gradientUnits="userSpaceOnUse" x1="208" y1="212" x2="462" y2="212">
      <stop offset="0" stop-color="#FFC300" stop-opacity="0"/>
      <stop offset="0.3" stop-color="#FFC300" stop-opacity="0.7"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.45"/>
    </linearGradient>
  </defs>
  <rect width="660" height="420" rx="18" fill="#0A0A0A"/>
  <rect width="660" height="420" rx="18" fill="url(#warm)"/>
  <rect width="660" height="420" rx="18" fill="url(#dots)"/>
  <text x="330" y="58" text-anchor="middle" fill="#FFFFFF" font-family="Helvetica Neue, Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="2">DOWNY</text>
  <text x="330" y="82" text-anchor="middle" fill="#FFC300" font-family="Helvetica Neue, Arial, sans-serif" font-size="10" font-weight="600" letter-spacing="4">DOWNLOADER</text>
  <line x1="208" y1="212" x2="454" y2="212" stroke="url(#line)" stroke-width="2" stroke-dasharray="7 8"/>
  <path d="M 446 202 L 462 212 L 446 222 Z" fill="#FFFFFF" opacity="0.8"/>
  <text x="330" y="288" text-anchor="middle" fill="#FFFFFF" font-family="Helvetica Neue, Arial, sans-serif" font-size="16" font-weight="600">Drag into Applications</text>
  <text x="330" y="392" text-anchor="middle" fill="#8A8A8A" font-family="Helvetica Neue, Arial, sans-serif" font-size="11">First launch: right-click the app → Open, or allow it in System Settings → Privacy &amp; Security.</text>
</svg>
`

async function makeIcon() {
  mkdirSync(buildDir, { recursive: true })
  rmSync(iconsetDir, { recursive: true, force: true })
  mkdirSync(iconsetDir, { recursive: true })

  const master = await sharp(Buffer.from(iconSvg), { density: 144 })
    .resize(1024, 1024)
    .png()
    .toBuffer()

  writeFileSync(path.join(buildDir, 'icon.png'), master)
  writeFileSync(path.join(buildDir, 'icon-1024.png'), master)

  const definitions = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024]
  ]

  for (const [filename, size] of definitions) {
    await sharp(master).resize(size, size, { kernel: 'lanczos3' }).png().toFile(path.join(iconsetDir, filename))
  }

  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', path.join(buildDir, 'icon.icns')])

  await sharp(Buffer.from(dmgSvg), { density: 144 })
    .resize(660, 420)
    .png()
    .toFile(path.join(buildDir, 'dmg-background.png'))

  process.stdout.write('[icons] wrote build/icon.icns and build/dmg-background.png\n')
}

makeIcon().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
