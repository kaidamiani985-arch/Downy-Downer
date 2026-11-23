import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useAppStore } from '../store'

export function Toasts() {
  const toasts = useAppStore((state) => state.toasts)
  const dismiss = useAppStore((state) => state.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div
          className={`toast toast-${toast.type} ${toast.leaving ? 'is-leaving' : ''}`}
          key={toast.id}
        >
          <span className="toast-icon">
            {toast.type === 'error' ? (
              <AlertCircle size={17} />
            ) : toast.type === 'success' ? (
              <CheckCircle2 size={17} />
            ) : (
              <Info size={17} />
            )}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => dismiss(toast.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
