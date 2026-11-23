import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  Music2,
  RotateCcw,
  Trash2,
  Video
} from 'lucide-react'
import type { QueueItem } from '@shared/types'
import { formatDuration } from '@shared/youtube'
import { isSelectable, useAppStore } from '../store'
import {
  AUDIO_BITRATE_OPTIONS,
  AUDIO_FORMAT_OPTIONS,
  CONTAINER_OPTIONS,
  QUALITY_OPTIONS,
  phaseLabel,
  qualityLabel
} from '../lib/options'
import { Checkbox, SelectField } from './ui'

export function QueueItemRow({
  item,
  selected,
  onToggle,
  mode = 'standalone'
}: {
  item: QueueItem
  selected: boolean
  onToggle: () => void
  mode?: 'standalone' | 'playlist'
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const activeId = useAppStore((state) => state.snapshot?.active?.currentItemId ?? null)
  const updateItem = useAppStore((state) => state.updateItem)
  const removeItem = useAppStore((state) => state.removeItem)
  const startIds = useAppStore((state) => state.startIds)

  const selectable = isSelectable(item)
  const active = activeId === item.id
  const busy = item.status === 'downloading' || item.status === 'processing'
  const indeterminate = item.phase === 'merge' || item.phase === 'convert'

  const handleKind = (kind: 'video' | 'audio') => {
    if (kind === item.kind) return
    updateItem(item.id, { kind })
  }

  const handleQuality = (quality: QueueItem['quality']) => {
    updateItem(item.id, { quality })
  }

  const handleContainer = (container: QueueItem['container']) => {
    updateItem(item.id, { container })
  }

  return (
    <article
      className={`queue-item ${mode === 'playlist' ? 'is-child' : ''} ${selected ? 'is-selected' : ''} ${
        active ? 'is-active' : ''
      } ${item.status === 'completed' ? 'is-complete' : ''}`}
    >
      <div className="queue-item-select">
        <Checkbox
          checked={selected}
          onChange={onToggle}
          disabled={!selectable}
          label={`Select ${item.title}`}
        />
      </div>

      <div className={`thumb ${mode === 'playlist' ? 'thumb-small' : ''}`}>
        {!imageFailed && item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="thumb-fallback">
            {item.kind === 'audio' ? <Music2 size={20} /> : <Video size={20} />}
          </span>
        )}
        <span className="thumb-duration">{formatDuration(item.duration)}</span>
        {item.kind === 'audio' && (
          <span className="thumb-kind" title="Audio only">
            <Music2 size={11} />
          </span>
        )}
        {item.status === 'completed' && (
          <span className="thumb-done" title="Downloaded">
            <CheckCircle2 size={18} />
          </span>
        )}
      </div>

      <div className="queue-item-body">
        <div className="queue-item-title-row">
          <div>
            {mode === 'playlist' ? (
              <h4 className="queue-item-title" title={item.title}>
                {item.title}
              </h4>
            ) : (
              <h3 className="queue-item-title" title={item.title}>
                {item.title}
              </h3>
            )}
            <div className="queue-item-meta">
              <span>{item.channel}</span>
              {mode === 'standalone' && item.playlistId && <span className="meta-dot">Playlist</span>}
            </div>
          </div>
          <div className="queue-item-actions">
            <button
              type="button"
              className="icon-button subtle-action danger-hover"
              title={busy ? 'Wait for the download to finish' : 'Remove'}
              aria-label={`Remove ${item.title} from queue`}
              disabled={busy}
              onClick={() => removeItem(item.id)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {item.status !== 'completed' && (
          <div className="item-options">
            <div className="segmented" role="group" aria-label="Download type">
              <button
                type="button"
                className={item.kind === 'video' ? 'is-active' : ''}
                disabled={!selectable}
                onClick={() => handleKind('video')}
              >
                <Video size={12} />
                Video
              </button>
              <button
                type="button"
                className={item.kind === 'audio' ? 'is-active' : ''}
                disabled={!selectable}
                onClick={() => handleKind('audio')}
              >
                <Music2 size={12} />
                Audio
              </button>
            </div>

            {item.kind === 'video' ? (
              <>
                <SelectField
                  ariaLabel="Video quality"
                  value={item.quality}
                  options={QUALITY_OPTIONS}
                  disabled={!selectable}
                  onChange={handleQuality}
                  className="quality-select"
                />
                <SelectField
                  ariaLabel="Video container"
                  value={item.container}
                  options={CONTAINER_OPTIONS}
                  disabled={!selectable}
                  onChange={handleContainer}
                  className="container-select"
                />
              </>
            ) : (
              <>
                <SelectField
                  ariaLabel="Audio format"
                  value={item.audioFormat}
                  options={AUDIO_FORMAT_OPTIONS}
                  disabled={!selectable}
                  onChange={(audioFormat) => updateItem(item.id, { audioFormat })}
                />
                <SelectField
                  ariaLabel="Audio bitrate"
                  value={item.audioBitrate}
                  options={AUDIO_BITRATE_OPTIONS}
                  disabled={!selectable}
                  onChange={(audioBitrate) => updateItem(item.id, { audioBitrate })}
                />
              </>
            )}
          </div>
        )}

        <ItemStatus item={item} active={active} indeterminate={indeterminate} onRetry={() => startIds([item.id])} />
      </div>

      <div className="queue-item-end">
        {item.status === 'completed' ? (
          <span className="status-chip status-completed">
            <CheckCircle2 size={13} /> Saved
          </span>
        ) : busy ? (
          <span className="status-chip status-downloading">
            {indeterminate ? 'Processing' : `${Math.round(item.progress)}%`}
          </span>
        ) : item.status === 'failed' ? (
          <span className="status-chip status-failed">
            <AlertCircle size={13} /> Failed
          </span>
        ) : item.status === 'cancelled' ? (
          <span className="status-chip status-muted">Cancelled</span>
        ) : item.status === 'interrupted' ? (
          <span className="status-chip status-muted">Interrupted</span>
        ) : null}
      </div>
    </article>
  )
}

function ItemStatus({
  item,
  active,
  indeterminate,
  onRetry
}: {
  item: QueueItem
  active: boolean
  indeterminate: boolean
  onRetry: () => void
}) {
  const busy = item.status === 'downloading' || item.status === 'processing'

  if (busy) {
    return (
      <div className={`item-status ${active ? 'is-live' : ''}`}>
        <div className="progress-head">
          <span>{phaseLabel(item.phase)}</span>
          <span className="progress-percent">
            {indeterminate ? 'working…' : `${Math.round(item.progress)}%`}
          </span>
        </div>
        <div className={`progress-track ${indeterminate ? 'is-indeterminate' : ''}`}>
          <span style={{ width: indeterminate ? '100%' : `${Math.max(2, item.progress)}%` }} />
        </div>
        <div className="progress-sub">
          <span>
            {item.speed ? item.speed : 'Connecting to YouTube'}
            {item.eta ? ` · ETA ${item.eta}` : ''}
          </span>
          {item.downloadedLabel && !indeterminate && <span>{item.downloadedLabel}</span>}
        </div>
      </div>
    )
  }

  if (item.status === 'completed') {
    return (
      <div className="item-status completed-status">
        <span>
          {item.kind === 'audio'
            ? `Saved as ${item.audioFormat.toUpperCase()}`
            : `Saved as ${item.container.toUpperCase()} · ${qualityLabel(item.quality)}`}
        </span>
        {item.outputPath && (
          <button
            type="button"
            className="text-button"
            onClick={() => window.downy.revealPath(item.outputPath!)}
          >
            <FolderOpen size={13} /> Reveal in Finder
          </button>
        )}
      </div>
    )
  }

  if (item.status === 'failed' || item.status === 'cancelled' || item.status === 'interrupted') {
    return (
      <div className="item-status failed-status">
        <span className="item-error" title={item.error ?? undefined}>
          {item.error ?? 'Download did not finish.'}
        </span>
        <button type="button" className="text-button retry-button" onClick={onRetry}>
          <RotateCcw size={13} /> Retry
        </button>
      </div>
    )
  }

  return null
}
