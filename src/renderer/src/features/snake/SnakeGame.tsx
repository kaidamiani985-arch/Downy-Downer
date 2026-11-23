import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, SkipForward, X } from 'lucide-react'
import { formatTokenCount } from '@shared/youtube'
import { useAppStore } from '../../store'
import { BrandMark, TokenCoin } from '../../components/icons'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CELL,
  COLS,
  DELTAS,
  ROWS,
  SnakeEngine,
  type Direction,
  type Point
} from './engine'
import { soundCoin, soundDeath, soundPause, soundStart, unlockAudio } from './sound'

type Phase = 'idle' | 'countdown' | 'playing' | 'paused' | 'dead'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

export function SnakeGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<SnakeEngine | null>(null)
  if (!engineRef.current) engineRef.current = new SnakeEngine()
  const engine = engineRef.current

  const [phase, setPhase] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')

  const prevSnakeRef = useRef<Point[]>(engine.snake.map((segment) => ({ ...segment })))
  const prevDirectionRef = useRef<Direction>(engine.direction)
  const particlesRef = useRef<Particle[]>([])
  const lastStepRef = useRef(0)
  const countdownEndRef = useRef(0)
  const lastFrameRef = useRef(0)
  const animationRef = useRef(0)

  const balance = useAppStore((state) => state.snapshot?.wallet.balance ?? 0)
  const soundEnabled = useAppStore((state) => state.snapshot?.settings.soundEnabled ?? true)
  const earnSnakeCoin = useAppStore((state) => state.earnSnakeCoin)

  const updatePhase = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const spawnCoinParticles = useCallback((point: Point) => {
    const cx = point.x * CELL + CELL / 2
    const cy = point.y * CELL + CELL / 2
    for (let index = 0; index < 10; index += 1) {
      const angle = (Math.PI * 2 * index) / 10 + Math.random() * 0.35
      const speed = 1 + Math.random() * 1.9
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.7,
        life: 1,
        maxLife: 1,
        size: 1.5 + Math.random() * 2.4,
        color: Math.random() > 0.35 ? '#FFC300' : '#FFFFFF'
      })
    }
  }, [])

  const die = useCallback(() => {
    if (phaseRef.current === 'dead') return
    updatePhase('dead')
    if (soundEnabled) soundDeath()
  }, [soundEnabled, updatePhase])

  const pause = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    updatePhase('paused')
    if (soundEnabled) soundPause()
  }, [soundEnabled, updatePhase])

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return
    lastStepRef.current = performance.now()
    updatePhase('playing')
    if (soundEnabled) soundStart()
  }, [soundEnabled, updatePhase])

  const startRun = useCallback(() => {
    unlockAudio()
    engine.reset()
    prevSnakeRef.current = engine.snake.map((segment) => ({ ...segment }))
    prevDirectionRef.current = engine.direction
    particlesRef.current = []
    lastStepRef.current = performance.now()
    countdownEndRef.current = performance.now() + 1_200
    updatePhase('countdown')
  }, [engine, updatePhase])

  const endRun = useCallback(() => {
    updatePhase('dead')
  }, [updatePhase])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = BOARD_WIDTH * dpr
    canvas.height = BOARD_HEIGHT * dpr
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    const loop = (now: number) => {
      const activeEngine = engineRef.current!
      const dt = Math.min(32, now - (lastFrameRef.current || now))
      lastFrameRef.current = now

      if (phaseRef.current === 'countdown' && now >= countdownEndRef.current) {
        updatePhase('playing')
        lastStepRef.current = now
        if (soundEnabled) soundStart()
      }

      if (phaseRef.current === 'playing') {
        let steps = 0
        while (now - lastStepRef.current >= activeEngine.tickMs && steps < 4) {
          prevSnakeRef.current = activeEngine.snake.map((segment) => ({ ...segment }))
          prevDirectionRef.current = activeEngine.direction
          const eaten = { ...activeEngine.food }
          const result = activeEngine.step()
          lastStepRef.current += activeEngine.tickMs
          steps += 1

          if (result.dead) {
            die()
            break
          }

          if (result.ate) {
            spawnCoinParticles(eaten)
            void earnSnakeCoin()
            if (soundEnabled) soundCoin()
          }
        }
      }

      updateParticles(particlesRef.current, dt)
      drawBoard(
        context,
        activeEngine,
        prevSnakeRef.current,
        prevDirectionRef.current,
        particlesRef.current,
        now,
        phaseRef.current,
        lastStepRef.current
      )
      animationRef.current = requestAnimationFrame(loop)
    }

    animationRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animationRef.current)
  }, [die, earnSnakeCoin, soundEnabled, spawnCoinParticles, updatePhase])

  useEffect(() => {
    const keyDirections: Record<string, Direction> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      w: 'up',
      a: 'left',
      s: 'down',
      d: 'right',
      W: 'up',
      A: 'left',
      S: 'down',
      D: 'right'
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const direction = keyDirections[event.key]
      if (direction) {
        if (phaseRef.current === 'playing' || phaseRef.current === 'countdown') {
          event.preventDefault()
          engineRef.current?.queue(direction)
        }
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        if (phaseRef.current === 'playing') pause()
        else if (phaseRef.current === 'paused') resume()
        else if (phaseRef.current === 'idle' || phaseRef.current === 'dead') startRun()
        return
      }

      if (event.key === 'Escape') {
        if (phaseRef.current === 'playing') {
          event.preventDefault()
          pause()
        } else if (phaseRef.current === 'idle' || phaseRef.current === 'dead') {
          event.preventDefault()
          handleClose()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleClose, pause, resume, startRun])

  useEffect(() => {
    const onBlur = () => pause()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause()
    }
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [pause])

  return (
    <div className="snake-layer">
      <div className="snake-panel">
        <header className="snake-head">
          <div className="snake-brand">
            <BrandMark size={30} />
            <div className="snake-brand-title">TOKEN SNAKE</div>
          </div>
          <div className="snake-head-actions">
            <div className="snake-wallet-pill">
              <TokenCoin size={16} />
              <strong>{formatTokenCount(balance)}</strong>
            </div>
            <button type="button" className="icon-button snake-close" aria-label="Close snake game" onClick={handleClose}>
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="snake-body">
          <div className="snake-canvas-stage">
            <canvas ref={canvasRef} className="snake-canvas" aria-label="Token Snake game board" />

            {phase === 'idle' && (
              <div className="snake-state-overlay">
                <div className="snake-state-card">
                  <div className="snake-start-coin">
                    <TokenCoin size={54} />
                  </div>
                  <h2>Eat coins. Earn tokens.</h2>
                  <button type="button" className="btn btn-gold snake-start-button" onClick={startRun} autoFocus>
                    <Play size={17} fill="currentColor" />
                    Start run
                  </button>
                </div>
              </div>
            )}

            {phase === 'countdown' && (
              <div className="snake-state-overlay snake-countdown-overlay">
                <div className="snake-get-ready">Get ready</div>
              </div>
            )}

            {phase === 'paused' && (
              <div className="snake-state-overlay">
                <div className="snake-state-card snake-pause-card">
                  <Pause size={30} />
                  <h2>Paused.</h2>
                  <div className="snake-state-actions">
                    <button type="button" className="btn btn-gold" onClick={resume}>
                      <Play size={16} fill="currentColor" /> Resume
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={endRun}>
                      <SkipForward size={15} /> End run
                    </button>
                  </div>
                </div>
              </div>
            )}

            {phase === 'dead' && (
              <div className="snake-state-overlay">
                <div className="snake-state-card">
                  <h2>Run over.</h2>
                  <div className="snake-state-actions">
                    <button type="button" className="btn btn-gold" onClick={startRun}>
                      <Play size={16} fill="currentColor" /> Play again
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={handleClose}>
                      Back
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function updateParticles(particles: Particle[], dt: number): void {
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index]!
    particle.x += particle.vx * (dt / 16.67)
    particle.y += particle.vy * (dt / 16.67)
    particle.vy += 0.055 * (dt / 16.67)
    particle.life -= 0.025 * (dt / 16.67)
    if (particle.life <= 0) particles.splice(index, 1)
  }
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  engine: SnakeEngine,
  prevSnake: Point[],
  prevDirection: Direction,
  particles: Particle[],
  now: number,
  phase: Phase,
  lastStep: number
): void {
  ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
  ctx.fillStyle = '#080808'
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= COLS; x += 1) {
    const px = x * CELL + 0.5
    ctx.moveTo(px, 0)
    ctx.lineTo(px, BOARD_HEIGHT)
  }
  for (let y = 0; y <= ROWS; y += 1) {
    const py = y * CELL + 0.5
    ctx.moveTo(0, py)
    ctx.lineTo(BOARD_WIDTH, py)
  }
  ctx.stroke()

  for (const obstacle of engine.obstacles) {
    drawObstacle(ctx, obstacle.x * CELL, obstacle.y * CELL)
  }

  const foodX = engine.food.x * CELL + CELL / 2
  const foodY = engine.food.y * CELL + CELL / 2
  drawCoin(ctx, foodX, foodY)

  const elapsed = phase === 'playing' ? Math.min(1, (now - lastStep) / Math.max(1, engine.tickMs)) : 1
  const points = engine.snake.map((segment, index) => {
    const previous = prevSnake[index] ?? segment
    const x = previous.x + (segment.x - previous.x) * elapsed
    const y = previous.y + (segment.y - previous.y) * elapsed
    return { x: x * CELL + CELL / 2, y: y * CELL + CELL / 2 }
  })

  drawSnake(ctx, points, prevDirection, engine.direction, elapsed, engine.alive)

  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, particle.life)
    ctx.fillStyle = particle.color
    ctx.beginPath()
    ctx.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawSnake(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  previousDirection: Direction,
  direction: Direction,
  elapsed: number,
  alive: boolean
): void {
  if (points.length === 0) return
  const head = points[0]!

  const ordered = [...points].reverse()
  const body = new Path2D()
  body.moveTo(ordered[0]!.x, ordered[0]!.y)
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const before = ordered[index - 1] ?? ordered[index]!
    const current = ordered[index]!
    const next = ordered[index + 1]!
    const after = ordered[index + 2] ?? next
    const controlOneX = current.x + (next.x - before.x) / 6
    const controlOneY = current.y + (next.y - before.y) / 6
    const controlTwoX = next.x - (after.x - current.x) / 6
    const controlTwoY = next.y - (after.y - current.y) / 6
    body.bezierCurveTo(controlOneX, controlOneY, controlTwoX, controlTwoY, next.x, next.y)
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = CELL * 0.6
  ctx.stroke(body)

  ctx.beginPath()
  ctx.arc(head.x, head.y, CELL * 0.48, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()

  const eyeDirection = interpolateDirection(previousDirection, direction, elapsed)
  const perpendicular = { x: -eyeDirection.y, y: eyeDirection.x }
  const forward = CELL * 0.15
  const side = CELL * 0.16
  const eyes = [
    {
      x: head.x + eyeDirection.x * forward + perpendicular.x * side,
      y: head.y + eyeDirection.y * forward + perpendicular.y * side
    },
    {
      x: head.x + eyeDirection.x * forward - perpendicular.x * side,
      y: head.y + eyeDirection.y * forward - perpendicular.y * side
    }
  ]

  for (const eye of eyes) {
    if (alive) {
      ctx.beginPath()
      ctx.arc(eye.x, eye.y, CELL * 0.1, 0, Math.PI * 2)
      ctx.fillStyle = '#0A0A0A'
      ctx.fill()
    } else {
      ctx.strokeStyle = '#0A0A0A'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(eye.x - 2.4, eye.y - 2.4)
      ctx.lineTo(eye.x + 2.4, eye.y + 2.4)
      ctx.moveTo(eye.x + 2.4, eye.y - 2.4)
      ctx.lineTo(eye.x - 2.4, eye.y + 2.4)
      ctx.stroke()
    }
  }
}

function interpolateDirection(previous: Direction, next: Direction, t: number): Point {
  const from = DELTAS[previous]
  const to = DELTAS[next]
  const fromAngle = Math.atan2(from.y, from.x)
  const toAngle = Math.atan2(to.y, to.x)
  let delta = toAngle - fromAngle
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  const angle = fromAngle + delta * t
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

function drawObstacle(ctx: CanvasRenderingContext2D, cellX: number, cellY: number): void {
  const pad = CELL * 0.13
  const size = CELL - pad * 2
  ctx.fillStyle = '#FFC300'
  ctx.fillRect(cellX + pad, cellY + pad, size, size)
  ctx.strokeStyle = 'rgba(10, 10, 10, 0.28)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(cellX + pad + 0.75, cellY + pad + 0.75, size - 1.5, size - 1.5)
}

function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const radius = CELL * 0.4
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = '#FFC300'
  ctx.fill()

  ctx.beginPath()
  ctx.arc(x, y, radius - 3.2, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(10, 10, 10, 0.24)'
  ctx.lineWidth = 1
  ctx.stroke()

  const scale = radius / 11.5
  ctx.beginPath()
  ctx.moveTo(x - 3.6 * scale, y - 4.8 * scale)
  ctx.lineTo(x + 3.6 * scale, y - 4.8 * scale)
  ctx.lineTo(x + 3.6 * scale, y - 1 * scale)
  ctx.lineTo(x + 5.2 * scale, y - 1 * scale)
  ctx.lineTo(x, y + 5 * scale)
  ctx.lineTo(x - 5.2 * scale, y - 1 * scale)
  ctx.lineTo(x - 3.6 * scale, y - 1 * scale)
  ctx.closePath()
  ctx.fillStyle = '#0A0A0A'
  ctx.fill()
}
