export const COLS = 10
export const ROWS = 10
export const CELL = 45
export const BOARD_WIDTH = COLS * CELL
export const BOARD_HEIGHT = ROWS * CELL

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Point {
  x: number
  y: number
}

export interface StepResult {
  ate: boolean
  dead: boolean
}

export const DELTAS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
}

export function opposite(a: Direction, b: Direction): boolean {
  return (
    (a === 'up' && b === 'down') ||
    (a === 'down' && b === 'up') ||
    (a === 'left' && b === 'right') ||
    (a === 'right' && b === 'left')
  )
}

export class SnakeEngine {
  snake: Point[] = []
  direction: Direction = 'right'
  queued: Direction[] = []
  food: Point = { x: 0, y: 0 }
  obstacles: Point[] = []
  score = 0
  tickMs = 155
  alive = true

  constructor() {
    this.reset()
  }

  reset(): void {
    const y = Math.floor(ROWS / 2)
    const x = Math.floor(COLS / 2)
    this.snake = [
      { x, y },
      { x: x - 1, y },
      { x: x - 2, y }
    ]
    this.direction = 'right'
    this.queued = []
    this.score = 0
    this.tickMs = 155
    this.alive = true
    this.obstacles = []
    this.food = this.spawnFood()
  }

  get head(): Point {
    return this.snake[0]!
  }

  queue(direction: Direction): boolean {
    if (!this.alive) return false
    const last = this.queued.at(-1) ?? this.direction
    if (direction === last || opposite(direction, last)) return false
    if (this.queued.length >= 3) return false
    this.queued.push(direction)
    return true
  }

  step(): StepResult {
    if (!this.alive) return { ate: false, dead: true }

    const nextDirection = this.queued.shift()
    if (nextDirection) this.direction = nextDirection

    const delta = DELTAS[this.direction]
    const head = this.head
    const next = { x: head.x + delta.x, y: head.y + delta.y }

    if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) {
      this.alive = false
      return { ate: false, dead: true }
    }

    if (this.obstacles.some((obstacle) => obstacle.x === next.x && obstacle.y === next.y)) {
      this.alive = false
      return { ate: false, dead: true }
    }

    const willEat = next.x === this.food.x && next.y === this.food.y
    const bodyLimit = willEat ? this.snake.length : this.snake.length - 1
    for (let index = 0; index < bodyLimit; index += 1) {
      const segment = this.snake[index]
      if (segment && segment.x === next.x && segment.y === next.y) {
        this.alive = false
        return { ate: false, dead: true }
      }
    }

    this.snake.unshift(next)
    if (!willEat) {
      this.snake.pop()
      return { ate: false, dead: false }
    }

    this.score += 1
    this.tickMs = Math.max(95, 155 - this.score * 2.4)
    this.spawnObstacle()
    this.food = this.spawnFood()
    return { ate: true, dead: false }
  }

  private spawnObstacle(): void {
    const occupied = new Set(
      [...this.snake, ...this.obstacles, this.food].map((segment) => `${segment.x},${segment.y}`)
    )
    const free: Point[] = []
    const preferred: Point[] = []
    const head = this.head

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (occupied.has(`${x},${y}`)) continue
        const point = { x, y }
        free.push(point)
        if (Math.abs(x - head.x) + Math.abs(y - head.y) >= 2) {
          preferred.push(point)
        }
      }
    }

    const pool = preferred.length > 0 ? preferred : free
    const chosen = pool[Math.floor(Math.random() * pool.length)]
    if (chosen) this.obstacles.push(chosen)
  }

  private spawnFood(): Point {
    const occupied = new Set(
      [...this.snake, ...this.obstacles].map((segment) => `${segment.x},${segment.y}`)
    )
    const free: Point[] = []
    const preferred: Point[] = []
    const head = this.head ?? { x: 0, y: 0 }

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (occupied.has(`${x},${y}`)) continue
        const point = { x, y }
        free.push(point)
        if (Math.abs(x - head.x) + Math.abs(y - head.y) >= 6) {
          preferred.push(point)
        }
      }
    }

    const pool = preferred.length > 0 ? preferred : free
    return pool[Math.floor(Math.random() * pool.length)] ?? { x: 1, y: 1 }
  }
}
