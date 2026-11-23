import { useRef, useState, type FormEvent } from 'react'
import { Link2, Plus } from 'lucide-react'
import { useAppStore } from '../store'
import { Spinner } from './ui'

export function AddBar() {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const adding = useAppStore((state) => state.adding)
  const addUrl = useAppStore((state) => state.addUrl)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || adding) {
      inputRef.current?.focus()
      return
    }
    const success = await addUrl(trimmed)
    if (success) setValue('')
  }

  return (
    <form className="add-bar" onSubmit={submit}>
      <div className="add-input-wrap">
        <Link2 size={19} className="add-input-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          className="add-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Paste a YouTube link"
          aria-label="YouTube link"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          disabled={adding}
          autoFocus
        />
      </div>
      <button type="submit" className="btn btn-gold add-button" disabled={adding || !value.trim()}>
        {adding ? <Spinner size={16} /> : <Plus size={17} />}
        <span>{adding ? 'Adding…' : 'Add'}</span>
      </button>
    </form>
  )
}
