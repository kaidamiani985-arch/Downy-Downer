#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'build', 'icon.png')
const target = path.join(root, 'build', 'icon.ico')

if (!fs.existsSync(source)) {
  throw new Error('build/icon.png is missing. Run npm run make:icons first.')
}

const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = await Promise.all(
  sizes.map((size) => sharp(source).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer())
)

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)

const entries = Buffer.alloc(16 * images.length)
let offset = header.length + entries.length

images.forEach((image, index) => {
  const size = sizes[index]
  const entry = index * 16
  entries.writeUInt8(size === 256 ? 0 : size, entry)
  entries.writeUInt8(size === 256 ? 0 : size, entry + 1)
  entries.writeUInt8(0, entry + 2)
  entries.writeUInt8(0, entry + 3)
  entries.writeUInt16LE(1, entry + 4)
  entries.writeUInt16LE(32, entry + 6)
  entries.writeUInt32LE(image.length, entry + 8)
  entries.writeUInt32LE(offset, entry + 12)
  offset += image.length
})

fs.writeFileSync(target, Buffer.concat([header, entries, ...images]))
process.stdout.write(`[icons] wrote ${path.relative(root, target)} (${sizes.join(', ')})\n`)
