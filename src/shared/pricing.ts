import type { PlaylistGroup, Quote, QueueItem } from './types'

export const COST_PER_ITEM = 5
export const PLAYLIST_DISCOUNT = 2

/**
 * Prices a selection. A playlist group gets the half-price deal only when every
 * item in that group is selected. The discounted total is distributed across
 * the items as whole tokens so refunds can be exact.
 */
export function calculateQuote(
  queue: QueueItem[],
  playlists: PlaylistGroup[],
  selectedIds: Iterable<string>
): Quote {
  const itemById = new Map(queue.map((item) => [item.id, item]))
  const selected = new Set([...selectedIds].filter((id) => itemById.has(id)))
  const perItem: Record<string, number> = {}
  const discountedPlaylistIds: string[] = []
  const consumed = new Set<string>()

  for (const playlist of playlists) {
    const ids = playlist.itemIds.filter((id) => {
      const item = itemById.get(id)
      if (!item) return false
      return item.status !== 'completed' && item.status !== 'downloading' && item.status !== 'processing'
    })
    if (ids.length < 2) continue
    if (!ids.every((id) => selected.has(id))) continue

    const total = Math.ceil((COST_PER_ITEM * ids.length) / PLAYLIST_DISCOUNT)
    const base = Math.floor(total / ids.length)
    const extra = total % ids.length

    ids.forEach((id, index) => {
      perItem[id] = base + (index < extra ? 1 : 0)
      consumed.add(id)
    })
    discountedPlaylistIds.push(playlist.id)
  }

  for (const id of selected) {
    if (consumed.has(id)) continue
    perItem[id] = COST_PER_ITEM
  }

  const total = Object.values(perItem).reduce((sum, value) => sum + value, 0)
  return { perItem, total, discountedPlaylistIds }
}

export function isPlaylistDiscounted(
  queue: QueueItem[],
  playlists: PlaylistGroup[],
  selectedIds: Iterable<string>,
  playlistId: string
): boolean {
  return calculateQuote(queue, playlists, selectedIds).discountedPlaylistIds.includes(playlistId)
}

export const DEFAULT_SELECTABLE_STATUSES = new Set([
  'queued',
  'failed',
  'cancelled',
  'interrupted'
])
