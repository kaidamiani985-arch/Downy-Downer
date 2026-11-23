import { useState } from 'react'
import { ChevronDown, ChevronRight, Download, ListVideo, Trash2 } from 'lucide-react'
import type { PlaylistGroup, QueueItem } from '@shared/types'
import { formatLongDuration, formatTokenCount } from '@shared/youtube'
import { isSelectable, useAppStore } from '../store'
import { TokenCoin } from './icons'
import { Checkbox, IconButton } from './ui'
import { QueueItemRow } from './QueueItemRow'

export function PlaylistGroupCard({
  group,
  items,
  selected
}: {
  group: PlaylistGroup
  items: QueueItem[]
  selected: string[]
}) {
  const [expanded, setExpanded] = useState(group.itemIds.length <= 14)
  const [coverFailed, setCoverFailed] = useState(false)
  const activeId = useAppStore((state) => state.snapshot?.active?.currentItemId ?? null)
  const togglePlaylist = useAppStore((state) => state.togglePlaylist)
  const startIds = useAppStore((state) => state.startIds)
  const removePlaylist = useAppStore((state) => state.removePlaylist)

  if (items.length === 0) return null

  const pending = items.filter(isSelectable)
  const completed = items.filter((item) => item.status === 'completed')
  const totalDuration = items.reduce((sum, item) => sum + item.duration, 0)
  const selectedSet = new Set(selected)
  const allSelected = pending.length > 0 && pending.every((item) => selectedSet.has(item.id))
  const someSelected = pending.some((item) => selectedSet.has(item.id))
  const discount = pending.length >= 2
  const cost = pending.length < 2 ? pending.length * 5 : Math.ceil((5 * pending.length) / 2)
  const activeInGroup = Boolean(activeId && items.some((item) => item.id === activeId))

  return (
    <section className={`playlist-group ${allSelected ? 'is-selected' : ''}`}>
      <div className="playlist-head">
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onChange={() => togglePlaylist(group.id)}
          disabled={pending.length === 0}
          label={`Select all ${group.title} videos`}
        />

        <div className="playlist-cover">
          {!coverFailed && group.thumbnail ? (
            <img
              src={group.thumbnail}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <span className="thumb-fallback">
              <ListVideo size={18} />
            </span>
          )}
        </div>

        <div className="playlist-info">
          <h3 title={group.title}>{group.title}</h3>
          <div className="playlist-meta">
            <span>{group.channel}</span>
            <span>{items.length} videos</span>
            <span>{formatLongDuration(totalDuration)}</span>
            {completed.length > 0 && <span className="playlist-saved">{completed.length} saved</span>}
          </div>
        </div>

        <div className="playlist-deal">
          {pending.length > 0 ? (
            <>
              <div className="playlist-price">
                <TokenCoin size={16} />
                <strong>{formatTokenCount(cost)}</strong>
                <span>tokens</span>
              </div>
              {discount && <span className="deal-badge">50% off</span>}
            </>
          ) : (
            <span className="deal-badge deal-done">All saved</span>
          )}
        </div>

        <div className="playlist-actions">
          {pending.length > 0 && (
            <button
              type="button"
              className="btn btn-soft btn-small"
              disabled={Boolean(activeId)}
              onClick={() => startIds(pending.map((item) => item.id))}
            >
              <Download size={14} />
              {pending.length === items.length ? 'Download playlist' : 'Download remaining'}
            </button>
          )}
          <IconButton
            label={expanded ? 'Collapse playlist' : 'Expand playlist'}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          </IconButton>
          <IconButton
            label={`Remove ${group.title} from queue`}
            onClick={() => removePlaylist(group.id)}
            disabled={activeInGroup}
            className="danger-hover"
          >
            <Trash2 size={16} />
          </IconButton>
        </div>
      </div>

      {expanded && (
        <div className="playlist-children">
          {items.map((item) => (
            <QueueItemRow
              key={item.id}
              item={item}
              selected={selectedSet.has(item.id)}
              onToggle={() => useAppStore.getState().toggleSelected(item.id)}
              mode="playlist"
            />
          ))}
        </div>
      )}
    </section>
  )
}
