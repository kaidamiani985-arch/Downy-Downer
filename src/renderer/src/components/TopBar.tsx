import { Download, Settings, Sparkles } from 'lucide-react'
import { formatTokenCount } from '@shared/youtube'
import { useAppStore } from '../store'
import { BrandMark, TokenCoin } from './icons'

export function TopBar() {
  const snapshot = useAppStore((state) => state.snapshot)
  const toggleWallet = useAppStore((state) => state.toggleWallet)
  const openSettings = useAppStore((state) => state.openSettings)
  const openSnake = useAppStore((state) => state.openSnake)
  const walletOpen = useAppStore((state) => state.walletOpen)
  const balance = snapshot?.wallet.balance ?? 0
  const queued = snapshot?.queue.length ?? 0

  return (
    <header className="topbar">
      <div className="brand">
        <BrandMark size={38} />
        <div className="brand-text">
          <div className="brand-name">DOWNY</div>
        </div>
      </div>

      <div className="topbar-right no-drag">
        {queued > 0 && (
          <div className="topbar-queue-count" title={`${queued} in queue`}>
            <Download size={14} />
            <span>{queued}</span>
          </div>
        )}

        <button
          type="button"
          className={`wallet-pill ${walletOpen ? 'is-open' : ''} ${balance === 0 ? 'is-empty' : ''}`}
          onClick={toggleWallet}
          aria-label={`Wallet: ${balance} download tokens`}
          aria-expanded={walletOpen}
        >
          <TokenCoin size={22} />
          <span className="wallet-amount">{formatTokenCount(balance)}</span>
          <span className="wallet-label">tokens</span>
        </button>

        {queued > 0 && (
          <button type="button" className="btn btn-black btn-small topbar-tokens" onClick={openSnake}>
            <Sparkles size={14} />
            Get Tokens
          </button>
        )}

        <button
          type="button"
          className="icon-button topbar-settings"
          aria-label="Settings"
          title="Settings"
          onClick={openSettings}
        >
          <Settings size={19} />
        </button>
      </div>
    </header>
  )
}
