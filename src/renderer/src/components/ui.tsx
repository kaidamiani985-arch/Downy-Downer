import { useEffect, type ReactNode } from 'react'
import { Check, ChevronDown, Loader2, X } from 'lucide-react'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  className = ''
}: {
  value: T
  options: Array<SelectOption<T>>
  onChange: (value: T) => void
  disabled?: boolean
  ariaLabel: string
  className?: string
}) {
  return (
    <span className={`select-wrap ${className}`}>
      <select
        className="select"
        value={value}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="select-chevron" aria-hidden="true" />
    </span>
  )
}

export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  disabled = false,
  label
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      disabled={disabled}
      className={`checkbox ${checked || indeterminate ? 'is-checked' : ''} ${disabled ? 'is-disabled' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onChange()
      }}
    >
      {indeterminate && !checked ? <span className="checkbox-dash" /> : <Check size={13} strokeWidth={3} />}
    </button>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  )
}

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`spinner ${className}`} aria-hidden="true" />
}

export function Modal({
  onClose,
  children,
  className = ''
}: {
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-layer" onMouseDown={onClose}>
      <div
        className={`modal-card ${className}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          <X size={17} />
        </button>
        {children}
      </div>
    </div>
  )
}

export function IconButton({
  label,
  onClick,
  children,
  disabled = false,
  className = ''
}: {
  label: string
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
