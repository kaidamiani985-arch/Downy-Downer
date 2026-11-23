import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import type { PlaylistGroup, QueueItem } from '@shared/types'
import { isSelectable, useAppStore } from '../store'
import { PlaylistGroupCard } from './PlaylistGroupCard'
import { QueueItemRow } from './QueueItemRow'

type QueueEntry =
  | { kind: 'playlist'; at: number; group: PlaylistGroup }
  | { kind: 'item'; at: number; item: QueueItem }

export function QueueSection() {
  const snapshot = useAppStore((state) => state.snapshot)
  const selected = useAppStore((state) => state.selected)
  const selectAll = useAppStore((state) => state.selectAll)
  const clearSelection = useAppStore((state) => state.clearSelection)
  const clearCompleted = useAppStore((state) => state.clearCompleted)
  const toggleSelected = useAppStore((state) => state.toggleSelected)

  const { entries, itemsById, selectable, completedCount } = useMemo(() => {
    if (!snapshot) {
      return {
        entries: [] as QueueEntry[],
        itemsById: new Map<string, QueueItem>(),
        selectable: [] as QueueItem[],
        completedCount: 0
      }
    }
    const itemsById = new Map(snapshot.queue.map((item) => [item.id, item]))
    const groupsById = new Map(snapshot.playlists.map((group) => [group.id, group]))
    const entries: QueueEntry[] = [
      ...snapshot.playlists
        .filter((group) => group.itemIds.some((id) => itemsById.has(id)))
        .map((group) => ({ kind: 'playlist' as const, at: group.addedAt, group })),
      ...snapshot.queue
        .filter((item) => !item.playlistId || !groupsById.has(item.playlistId))
        .map((item) => ({ kind: 'item' as const, at: item.addedAt, item }))
    ].sort((a, b) => a.at - b.at)
    return {
      entries,
      itemsById,
      selectable: snapshot.queue.filter((item) => isSelectable(item)),
      completedCount: snapshot.queue.filter((item) => item.status === 'completed').length
    }
  }, [snapshot])

  if (!snapshot?.queue.length) return null

  return (
    <section className="queue-section">
      <div className="queue-toolbar">
        <h2 className="queue-count">
          {snapshot.queue.length} video{snapshot.queue.length === 1 ? '' : 's'}
        </h2>
        <div className="queue-tools">
          {completedCount > 0 && (
            <button type="button" className="text-button" onClick={clearCompleted}>
              <Trash2 size={13} />
              Clear saved
            </button>
          )}
          {selectable.length > 0 && (
            <button
              type="button"
              className="text-button"
              onClick={selected.length > 0 ? clearSelection : selectAll}
            >
              {selected.length > 0 ? 'Clear selection' : 'Select all'}
            </button>
          )}
        </div>
      </div>

      <div className="queue-list">
        {entries.map((entry) => {
          if (entry.kind === 'playlist') {
            const items = entry.group.itemIds
              .map((id) => itemsById.get(id))
              .filter((item): item is QueueItem => Boolean(item))
            return (
              <PlaylistGroupCard
                key={entry.group.id}
                group={entry.group}
                items={items}
                selected={selected}
              />
            )
          }
          return (
            <QueueItemRow
              key={entry.item.id}
              item={entry.item}
              selected={selected.includes(entry.item.id)}
              onToggle={() => toggleSelected(entry.item.id)}
            />
          )
        })}
      </div>
    </section>
  )
}
