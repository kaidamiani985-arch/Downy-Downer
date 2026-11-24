import { useEffect, useRef, useState } from 'react'
import { useAppStore } from './store'
import { AddBar } from './components/AddBar'
import { FooterBar } from './components/FooterBar'
import { BrandMark } from './components/icons'
import { QueueSection } from './components/QueueSection'
import { SettingsModal } from './components/SettingsModal'
import { Toasts } from './components/Toasts'
import { TokenModal } from './components/TokenModal'
import { TopBar } from './components/TopBar'
import { WalletPopover } from './components/WalletPopover'
import { Spinner } from './components/ui'
import { SnakeGame } from './features/snake/SnakeGame'

export default function App() {
  const ready = useAppStore((state) => state.ready)
  const initError = useAppStore((state) => state.initError)
  const snakeOpen = useAppStore((state) => state.snakeOpen)
  const closeSnake = useAppStore((state) => state.closeSnake)
  const snapshot = useAppStore((state) => state.snapshot)
  const hasQueue = (snapshot?.queue.length ?? 0) > 0
  const isWindows = /Windows/i.test(navigator.userAgent)

  const bootAt = useRef(performance.now())
  const [splash, setSplash] = useState<'visible' | 'leaving' | 'done'>('visible')

  useEffect(() => {
    if (!ready) return
    const minimumVisible = 520
    const wait = Math.max(0, minimumVisible - (performance.now() - bootAt.current))
    const timer = setTimeout(() => setSplash('leaving'), wait)
    return () => clearTimeout(timer)
  }, [ready])

  useEffect(() => {
    if (splash !== 'leaving') return
    const timer = setTimeout(() => setSplash('done'), 460)
    return () => clearTimeout(timer)
  }, [splash])

  const reveal = splash !== 'visible'

  if (initError) {
    return (
      <div className="app-shell">
        <div className="startup-screen">
          <BrandMark size={64} />
          <h1>Downy could not load.</h1>
          <p>{initError}</p>
          <button type="button" className="btn btn-gold" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`app-shell ${hasQueue ? 'has-queue' : 'is-empty'} ${reveal ? 'is-ready' : ''} ${
        isWindows ? 'is-windows' : ''
      }`}
    >
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <TopBar />

      <main className="app-main">
        <section className={`liquid-hero ${hasQueue ? 'is-compact' : 'is-empty'}`}>
          <div className="hero-inner">
            <div className="hero-copy">
              <h1>
                Paste. Play.{' '}
                <br />
                <span>Download.</span>
              </h1>
              <p className="hero-sub">5 tokens per video.</p>
              <div className="hero-addbar">
                <AddBar />
              </div>
            </div>
          </div>
        </section>

        <QueueSection />
      </main>

      <FooterBar />
      <WalletPopover />
      <TokenModal />
      <SettingsModal />
      {snakeOpen && <SnakeGame onClose={closeSnake} />}
      <Toasts />

      {splash !== 'done' && (
        <div
          className={`startup-screen ${splash === 'leaving' ? 'is-leaving' : ''}`}
          role="status"
          aria-live="polite"
        >
          <BrandMark size={72} />
          <div className="startup-wordmark">DOWNY</div>
          <div className="startup-loading">
            <Spinner size={16} />
            <span>Loading…</span>
          </div>
        </div>
      )}
    </div>
  )
}
