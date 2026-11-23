import { Sparkles, X } from 'lucide-react'
import { formatTokenCount } from '@shared/youtube'
import { useAppStore } from '../store'
import { TokenCoin } from './icons'

export function WalletPopover() {
  const open = useAppStore((state) => state.walletOpen)
  const close = useAppStore((state) => state.closeWallet)
  const openSnake = useAppStore((state) => state.openSnake)
  const wallet = useAppStore((state) => state.snapshot?.wallet)

  if (!open || !wallet) return null

  return (
    <div className="popover-layer" onMouseDown={close}>
      <div
        className="wallet-popover"
        role="dialog"
        aria-label="Download token wallet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="wallet-popover-head">
          <div>
            <h2>Download tokens</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close wallet" onClick={close}>
            <X size={17} />
          </button>
        </div>

        <div className="wallet-balance-card">
          <TokenCoin size={48} />
          <div>
            <div className="wallet-balance-number">{formatTokenCount(wallet.balance)}</div>
            <div className="wallet-balance-caption">ready to spend</div>
          </div>
          <button type="button" className="btn btn-gold btn-small" onClick={openSnake}>
            <Sparkles size={14} />
            Play
          </button>
        </div>

        <div className="wallet-stats">
          <div>
            <span>Earned</span>
            <strong>{formatTokenCount(wallet.lifetimeEarned)}</strong>
          </div>
          <div>
            <span>Spent</span>
            <strong>{formatTokenCount(wallet.lifetimeSpent)}</strong>
          </div>
        </div>
      </div>
    </div>
  )
}
