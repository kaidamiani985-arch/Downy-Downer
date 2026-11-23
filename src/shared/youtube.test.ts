import { describe, expect, it } from 'vitest'
import { formatDuration, parseYouTubeUrl } from './youtube'

describe('parseYouTubeUrl', () => {
  it('parses a watch link as a single video', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw')).toMatchObject({
      ok: true,
      kind: 'video',
      videoId: 'jNQXAC9IVRw'
    })
  })

  it('strips playlist parameters from a watch link', () => {
    const result = parseYouTubeUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL1234567890')
    expect(result.ok && result.kind === 'video' && result.videoId).toBe('jNQXAC9IVRw')
  })

  it('parses youtu.be and Shorts links', () => {
    expect(parseYouTubeUrl('https://youtu.be/jNQXAC9IVRw').ok).toBe(true)
    expect(parseYouTubeUrl('https://www.youtube.com/shorts/jNQXAC9IVRw')).toMatchObject({
      ok: true,
      kind: 'video'
    })
  })

  it('parses playlist links', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=PL1234567890')).toMatchObject({
      ok: true,
      kind: 'playlist',
      playlistId: 'PL1234567890'
    })
    expect(parseYouTubeUrl('https://music.youtube.com/playlist?list=PL1234567890').ok).toBe(true)
  })

  it('rejects non-YouTube and channel links', () => {
    expect(parseYouTubeUrl('https://example.com/watch?v=jNQXAC9IVRw').ok).toBe(false)
    expect(parseYouTubeUrl('https://www.youtube.com/@somechannel').ok).toBe(false)
    expect(parseYouTubeUrl('').ok).toBe(false)
  })
})

describe('formatDuration', () => {
  it('formats seconds and hours', () => {
    expect(formatDuration(19)).toBe('0:19')
    expect(formatDuration(125)).toBe('2:05')
    expect(formatDuration(3725)).toBe('1:02:05')
    expect(formatDuration(0)).toBe('—')
  })
})
