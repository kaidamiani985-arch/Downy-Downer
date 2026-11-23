import { Download, FolderOpen, Square } from 'lucide-react'
import { calculateQuote } from '@shared/pricing'
import { formatTokenCount } from '@shared/youtube'
import { isSelectable, useAppStore } from '../store'
import { phaseLabel } from '../lib/options'
import { TokenCoin } from './icons'

export function FooterBar() {
  const snapshot = useAppStore((state) => state.snapshot)
  const selected = useAppStore((state) => state.selected)
  const chooseFolder = useAppStore((state) => state.chooseFolder)
  const startIds = useAppStore((state) => state.startIds)
  const cancelDownloads = useAppStore((state) => state.cancelDownloads)
  const openTokenPrompt = useAppStore((state) => state.openTokenPrompt)

  if (!snapshot) return null

  const active = snapshot.active
  const activeItem = active?.currentItemId
    ? snapshot.queue.find((item) => item.id === active.currentItemId)
    : undefined
  const selectedIds = selected.filter((id) => {
    const item = snapshot.queue.find((entry) => entry.id === id)
    return item ? isSelectable(item) : false
  })
  const quote = calculateQuote(snapshot.queue, snapshot.playlists, selectedIds)
  const selectedCount = Object.keys(quote.perItem).length
  const balance = snapshot.wallet.balance
  const shortfall = Math.max(0, quote.total - balance)
  const folderName = snapshot.settings.outputDir.split('/').filter(Boolean).at(-1) || snapshot.settings.outputDir

  return (
    <footer className="footer-bar">
      <button
        type="button"
        className={`folder-button ${!snapshot.settings.hasChosenOutputDir ? 'needs-folder' : ''}`}
        onClick={chooseFolder}
        title={snapshot.settings.outputDir}
      >
        <span className="folder-icon">
          <FolderOpen size={17} />
        </span>
        <span className="folder-copy">
          <strong>{folderName}</strong>
        </span>
      </button>

      {active ? (
        <>
          <div className="footer-active">
            <div className="footer-active-top">
              <span className="footer-active-kicker">
                {Math.min(active.currentIndex + 1, active.total)} of {active.total}
              </span>
              <span className="footer-active-title" title={activeItem?.title}>
                {activeItem?.title ?? 'Preparing…'}
              </span>
            </div>
            <div className="footer-active-progress">
              <div className="progress-track">
                <span
                  style={{
                    width: `${
                      activeItem && activeItem.phase !== 'merge' && activeItem.phase !== 'convert'
                        ? Math.max(2, activeItem.progress)
                        : 100
                    }%`
                  }}
                />
              </div>
              <span>{activeItem ? phaseLabel(activeItem.phase) : 'Working'}…</span>
            </div>
          </div>
          <button type="button" className="btn btn-danger" onClick={cancelDownloads}>
            <Square size={13} fill="currentColor" />
            Stop
          </button>
        </>
      ) : (
        <>
          <div className="footer-summary">
            <div className="footer-summary-main">
              <span>
                <strong>{selectedCount}</strong> selected
              </span>
            </div>
            {selectedCount > 0 && (
              <div className="footer-cost">
                <TokenCoin size={16} />
                <strong>{formatTokenCount(quote.total)}</strong>
                <span>tokens</span>
              </div>
            )}
          </div>

          <div className="footer-actions">
            {selectedCount === 0 ? (
              <button type="button" className="btn btn-gold footer-primary" disabled>
                <Download size={16} />
                Download
              </button>
            ) : shortfall > 0 ? (
              <button
                type="button"
                className="btn btn-gold footer-primary"
                onClick={() => openTokenPrompt(quote.total, balance)}
              >
                <TokenCoin size={17} />
                Need {shortfall} more token{shortfall === 1 ? '' : 's'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-gold footer-primary"
                onClick={() => startIds(selectedIds)}
              >
                <Download size={16} />
                Download {selectedCount} · {formatTokenCount(quote.total)} tokens
              </button>
            )}
          </div>
        </>
      )}
    </footer>
  )
}
