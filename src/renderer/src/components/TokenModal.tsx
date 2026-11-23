import { Sparkles, X } from 'lucide-react'
import { formatTokenCount } from '@shared/youtube'
import { useAppStore } from '../store'
import { TokenCoin } from './icons'
import { Modal } from './ui'

export function TokenModal() {
  const prompt = useAppStore((state) => state.tokenPrompt)
  const close = useAppStore((state) => state.closeTokenPrompt)
  const openSnake = useAppStore((state) => state.openSnake)

  if (!prompt) return null
  const tokenWord = prompt.shortfall === 1 ? 'token' : 'tokens'

  return (
    <Modal onClose={close} className="token-modal">
      <div className="token-modal-art">
        <span className="token-orbit token-orbit-one" />
        <span className="token-orbit token-orbit-two" />
        <TokenCoin size={82} />
      </div>
      <h2>
        Need {formatTokenCount(prompt.shortfall)} more {tokenWord}.
      </h2>
      <p className="token-modal-copy">
        This download costs <strong>{formatTokenCount(prompt.cost)} tokens</strong>. You have{' '}
        <strong>{formatTokenCount(prompt.balance)}</strong>.
      </p>

      <div className="modal-actions">
        <button
          type="button"
          className="btn btn-gold"
          onClick={() => {
            close()
            openSnake()
          }}
        >
          <Sparkles size={16} />
          Play Token Snake
        </button>
        <button type="button" className="btn btn-ghost" onClick={close}>
          <X size={15} />
          Not now
        </button>
      </div>
    </Modal>
  )
}
