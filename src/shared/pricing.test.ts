import { describe, expect, it } from 'vitest'
import { calculateQuote } from './pricing'
import type { ItemStatus, PlaylistGroup, QueueItem } from './types'

let counter = 0

function item(status: ItemStatus = 'queued'): QueueItem {
  counter += 1
  return {
    id: `item-${counter}`,
    videoId: `vid${counter}`,
    url: `https://www.youtube.com/watch?v=vid${counter}`,
    title: `Video ${counter}`,
    channel: 'Channel',
    duration: 60,
    thumbnail: '',
    playlistId: null,
    status,
    kind: 'video',
    quality: '1080',
    container: 'mp4',
    audioFormat: 'mp3',
    audioBitrate: 'best',
    progress: 0,
    phase: null,
    speed: null,
    eta: null,
    downloadedLabel: null,
    error: null,
    outputPath: null,
    charge: null,
    addedAt: counter,
    completedAt: null
  }
}

function playlist(ids: string[]): PlaylistGroup {
  return {
    id: 'playlist',
    title: 'Playlist',
    channel: 'Channel',
    url: 'https://www.youtube.com/playlist?list=PL1234567890',
    thumbnail: '',
    itemIds: ids,
    addedAt: 1
  }
}

describe('calculateQuote', () => {
  it('charges five for a normal video', () => {
    const queue = [item()]
    expect(calculateQuote(queue, [], [queue[0]!.id])).toMatchObject({
      total: 5,
      perItem: { [queue[0]!.id]: 5 },
      discountedPlaylistIds: []
    })
  })

  it('applies the playlist deal only to a complete group', () => {
    const queue = [item(), item(), item()]
    const group = playlist(queue.map((entry) => entry.id))
    const quote = calculateQuote(queue, [group], group.itemIds)
    expect(quote.total).toBe(8)
    expect(quote.discountedPlaylistIds).toEqual(['playlist'])
    expect(Object.values(quote.perItem).sort()).toEqual([2, 3, 3])
  })

  it('does not discount a partial playlist selection', () => {
    const queue = [item(), item(), item()]
    const group = playlist(queue.map((entry) => entry.id))
    const quote = calculateQuote(queue, [group], [queue[0]!.id, queue[1]!.id])
    expect(quote.total).toBe(10)
    expect(quote.discountedPlaylistIds).toEqual([])
  })

  it('ignores completed videos when pricing the rest of a playlist', () => {
    const queue = [item('completed'), item(), item(), item(), item()]
    const group = playlist(queue.map((entry) => entry.id))
    const pending = queue.slice(1).map((entry) => entry.id)
    const quote = calculateQuote(queue, [group], pending)
    expect(quote.total).toBe(10)
    expect(quote.discountedPlaylistIds).toEqual(['playlist'])
  })

  it('allocates the exact discounted total across ten videos', () => {
    const queue = Array.from({ length: 10 }, () => item())
    const group = playlist(queue.map((entry) => entry.id))
    const quote = calculateQuote(queue, [group], group.itemIds)
    expect(quote.total).toBe(25)
    expect(Object.values(quote.perItem).reduce((sum, value) => sum + value, 0)).toBe(25)
    expect(Object.values(quote.perItem).sort((a, b) => a - b)).toEqual([2, 2, 2, 2, 2, 3, 3, 3, 3, 3])
  })

  it('combines normal videos with a discounted playlist', () => {
    const queue = [item(), item(), item(), item()]
    const group = playlist([queue[2]!.id, queue[3]!.id])
    const quote = calculateQuote(queue, [group], queue.map((entry) => entry.id))
    expect(quote.total).toBe(15)
    expect(quote.discountedPlaylistIds).toEqual(['playlist'])
  })
})
