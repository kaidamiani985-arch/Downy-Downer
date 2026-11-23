import { describe, expect, it } from 'vitest'
import { SnakeEngine } from './engine'

describe('SnakeEngine obstacles', () => {
  it('spawns one yellow block when eating and keeps food out of it', () => {
    const engine = new SnakeEngine()
    engine.snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 }
    ]
    engine.direction = 'right'
    engine.obstacles = []
    engine.food = { x: 6, y: 5 }

    const result = engine.step()

    expect(result.ate).toBe(true)
    expect(engine.obstacles).toHaveLength(1)
    const obstacle = engine.obstacles[0]!
    expect(engine.snake.some((segment) => segment.x === obstacle.x && segment.y === obstacle.y)).toBe(false)
    expect(engine.food.x === obstacle.x && engine.food.y === obstacle.y).toBe(false)
  })

  it('dies when the snake hits a yellow block', () => {
    const engine = new SnakeEngine()
    engine.snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 }
    ]
    engine.direction = 'right'
    engine.obstacles = [{ x: 6, y: 5 }]
    engine.food = { x: 9, y: 9 }

    expect(engine.step().dead).toBe(true)
    expect(engine.alive).toBe(false)
  })
})
