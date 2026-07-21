import { beforeEach, describe, expect, test, vi } from 'vitest'
import { set, World } from '../../src/core/world'
import {
  attachSprites,
  Position,
  postSync,
  preSync,
  Sprite,
  sprite,
  Velocity,
  type SpriteLike,
} from '../../src/bridge/index'

function fakeSprite(key: string, x: number, y: number) {
  return {
    key,
    x,
    y,
    destroyed: false,
    body: { velocity: { x: 0, y: 0 } },
    destroy() {
      this.destroyed = true
    },
  }
}

describe('bridge', () => {
  let world: World
  let creados: ReturnType<typeof fakeSprite>[]

  beforeEach(() => {
    world = new World()
    creados = []
    attachSprites(world, (key, x, y) => {
      const s = fakeSprite(key, x, y)
      creados.push(s)
      return s as unknown as SpriteLike
    })
  })

  test('spawn con sprite() crea el GameObject en la posicion de la entidad', () => {
    const e = world.spawn(set(Position, { x: 100, y: 50 }), sprite({ key: 'hero' }))
    expect(creados).toHaveLength(1)
    expect(creados[0].key).toBe('hero')
    expect(creados[0].x).toBe(100)
    expect(creados[0].y).toBe(50)
    expect(Sprite.go[e]).toBe(creados[0])
  })

  test('destruir la entidad destruye el GameObject', () => {
    const e = world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    world.destroy(e)
    expect(creados[0].destroyed).toBe(true)
  })

  test('destruir la entidad libera la referencia al GameObject', () => {
    const e = world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    world.destroy(e)
    expect(Sprite.go[e]).toBeUndefined()
  })

  test('preSync copia velocity del ECS al body de Phaser', () => {
    const e = world.spawn(
      set(Position, { x: 0, y: 0 }),
      set(Velocity, { x: 3, y: -4 }),
      sprite({ key: 'hero' }),
    )
    preSync(world)
    expect(creados[0].body.velocity.x).toBe(3)
    expect(creados[0].body.velocity.y).toBe(-4)
    void e
  })

  test('postSync copia la posicion resuelta de Phaser al ECS', () => {
    const e = world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    creados[0].x = 42
    creados[0].y = 24
    postSync(world)
    expect(Position.x[e]).toBe(42)
    expect(Position.y[e]).toBe(24)
  })

  test('el sync ignora entidades sin Sprite', () => {
    const e = world.spawn(set(Position, { x: 7, y: 7 }))
    preSync(world)
    postSync(world)
    expect(Position.x[e]).toBe(7)
  })

  test('preSync no falla si el GameObject no tiene body', () => {
    const e = world.spawn(set(Position, { x: 0, y: 0 }), set(Velocity, { x: 1, y: 1 }))
    const sinBody = { x: 0, y: 0, body: null, destroy: vi.fn() }
    Sprite.go[e] = sinBody as unknown as Phaser.GameObjects.Sprite
    expect(() => preSync(world)).not.toThrow()
  })
})
