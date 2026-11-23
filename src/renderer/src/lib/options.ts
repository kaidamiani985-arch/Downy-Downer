import type { AudioBitrate, AudioFormat, Container, CookiesBrowser, Quality } from '@shared/types'
import type { SelectOption } from '../components/ui'

export const QUALITY_OPTIONS: Array<SelectOption<Quality>> = [
  { value: 'best', label: 'Best available' },
  { value: '2160', label: '4K · 2160p' },
  { value: '1440', label: '1440p' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' }
]

export const CONTAINER_OPTIONS: Array<SelectOption<Container>> = [
  { value: 'mp4', label: 'MP4' },
  { value: 'mkv', label: 'MKV' }
]

export const AUDIO_FORMAT_OPTIONS: Array<SelectOption<AudioFormat>> = [
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A' },
  { value: 'opus', label: 'Opus' }
]

export const AUDIO_BITRATE_OPTIONS: Array<SelectOption<AudioBitrate>> = [
  { value: 'best', label: 'Best' },
  { value: '320', label: '320 kbps' },
  { value: '192', label: '192 kbps' },
  { value: '128', label: '128 kbps' }
]

export const COOKIE_OPTIONS: Array<SelectOption<CookiesBrowser>> = [
  { value: 'none', label: 'Off — recommended' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'safari', label: 'Safari' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'brave', label: 'Brave' },
  { value: 'edge', label: 'Edge' }
]

export function phaseLabel(phase: string | null): string {
  switch (phase) {
    case 'preparing':
      return 'Preparing'
    case 'video':
      return 'Downloading video'
    case 'audio':
      return 'Downloading audio'
    case 'merge':
      return 'Merging streams'
    case 'convert':
      return 'Converting audio'
    case 'done':
      return 'Finishing up'
    default:
      return 'Downloading'
  }
}

export function qualityLabel(quality: Quality): string {
  if (quality === 'best') return 'Best'
  if (quality === '2160') return '4K'
  return `${quality}p`
}

export function audioLabel(format: AudioFormat, bitrate: AudioBitrate): string {
  return `${format.toUpperCase()}${bitrate === 'best' ? ' · best' : ` · ${bitrate}k`}`
}
