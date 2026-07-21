import { describe, expect, test } from 'vitest'
import { f32 } from '../../src/core/column'
import { component } from '../../src/core/component'
import { set, World } from '../../src/core/world'
import { bindWorld, Query, System, type QueryResult } from '../../src/core/system'

const Position = component(class { @f32 x = 0; @f32 y = 0 })
const Velocity = component(class { @f32 x = 0; @f32 y = 0 })

@System()
class MovementSystem {
  @Query(Position, Velocity) entities!: QueryResult

  update(dt: number) {
    for (const e of this.entities) {
      Position.x[e] += Velocity.x[e] * dt
      Position.y[e] += Velocity.y[e] * dt
    }
  }
}

describe('@System y @Query', () => {
  test('la query resuelve las entidades del world inyectado', () => {
    const world = new World()
    const e = world.spawn(set(Position, { x: 0, y: 0 }), set(Velocity, { x: 2, y: 3 }))
    const sys = new MovementSystem()
    bindWorld(sys, world)
    expect([...sys.entities]).toEqual([e])
  })

  test('update opera sobre las entidades de la query', () => {
    const world = new World()
    const e = world.spawn(set(Position, { x: 0, y: 0 }), set(Velocity, { x: 2, y: 3 }))
    const sys = new MovementSystem()
    bindWorld(sys, world)
    sys.update(0.5)
    expect(Position.x[e]).toBeCloseTo(1)
    expect(Position.y[e]).toBeCloseTo(1.5)
  })

  test('la query es perezosa: ve entidades creadas despues del bind', () => {
    const world = new World()
    const sys = new MovementSystem()
    bindWorld(sys, world)
    expect([...sys.entities]).toHaveLength(0)
    const e = world.spawn(set(Position, { x: 1, y: 1 }), set(Velocity, { x: 0, y: 0 }))
    expect([...sys.entities]).toEqual([e])
  })

  test('length refleja el conteo actual', () => {
    const world = new World()
    const sys = new MovementSystem()
    bindWorld(sys, world)
    world.spawn(set(Position, { x: 0, y: 0 }), set(Velocity, { x: 0, y: 0 }))
    expect(sys.entities.length).toBe(1)
  })

  test('iterar antes del bind lanza un error claro', () => {
    const sys = new MovementSystem()
    expect(() => [...sys.entities]).toThrow(/sin world/)
  })
})
