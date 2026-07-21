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
    expect(Sprite.key[e]).toBeUndefined()
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
    // La entidad debe tener DE VERDAD el componente Sprite: si solo se le
    // asigna Sprite.go a mano, la query nunca la incluye y el guard `go?.body`
    // queda sin cobertura.
    const e = world.spawn(
      set(Position, { x: 0, y: 0 }),
      set(Velocity, { x: 1, y: 1 }),
      sprite({ key: 'hero' }),
    )
    const sinBody = { x: 0, y: 0, body: null, destroy: vi.fn() }
    Sprite.go[e] = sinBody as unknown as SpriteLike
    expect(() => preSync(world)).not.toThrow()
  })

  test('preSync copia Position al GameObject', () => {
    const e = world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    Position.x[e] = 999
    Position.y[e] = -12
    preSync(world)
    expect(creados[0].x).toBe(999)
    expect(creados[0].y).toBe(-12)
  })

  test('preSync copia Position aunque la entidad no tenga Velocity', () => {
    const e = world.spawn(set(Position, { x: 1, y: 1 }), sprite({ key: 'hero' }))
    expect(world.has(e, Velocity)).toBe(false)
    Position.x[e] = 33
    preSync(world)
    expect(creados[0].x).toBe(33)
  })
})

describe('attachSprites: idempotencia', () => {
  function makeFactory() {
    const creados: ReturnType<typeof fakeSprite>[] = []
    const factory = (key: string, x: number, y: number) => {
      const s = fakeSprite(key, x, y)
      creados.push(s)
      return s as unknown as SpriteLike
    }
    return { creados, factory }
  }

  test('llamarlo dos veces sobre el mismo world crea un solo GameObject por entidad', () => {
    const world = new World()
    const { creados, factory } = makeFactory()
    attachSprites(world, factory)
    attachSprites(world, factory)

    const e = world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    expect(creados).toHaveLength(1)

    world.destroy(e)
    expect(creados[0].destroyed).toBe(true)
  })

  test('llamarlo dos veces no corre preSync ni postSync dos veces por frame', () => {
    const world = new World()
    const { creados, factory } = makeFactory()
    attachSprites(world, factory)
    attachSprites(world, factory)

    const e = world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    let lecturas = 0
    Object.defineProperty(creados[0], 'x', {
      get: () => {
        lecturas++
        return 7
      },
      set: () => {},
      configurable: true,
    })
    world.runPostSync()
    expect(lecturas).toBe(1)
    expect(Position.x[e]).toBe(7)
  })

  test('detach() desengancha observers y hooks', () => {
    const world = new World()
    const { creados, factory } = makeFactory()
    const detach = attachSprites(world, factory)

    world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    expect(creados).toHaveLength(1)

    detach()
    const spy = vi.fn()
    world.onPostSync(spy)
    world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'otro' }))
    expect(creados).toHaveLength(1)

    world.runPostSync()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test('despues de detach() se puede volver a enganchar', () => {
    const world = new World()
    const { creados, factory } = makeFactory()
    attachSprites(world, factory)()
    attachSprites(world, factory)
    world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    expect(creados).toHaveLength(1)
  })
})

describe('bridge: worlds simultaneos', () => {
  test('cada world mantiene su propio GameObject y su propio destroy', () => {
    const creadosA: ReturnType<typeof fakeSprite>[] = []
    const creadosB: ReturnType<typeof fakeSprite>[] = []
    const wA = new World()
    const wB = new World()
    attachSprites(wA, (k, x, y) => {
      const s = fakeSprite(k, x, y)
      creadosA.push(s)
      return s as unknown as SpriteLike
    })
    attachSprites(wB, (k, x, y) => {
      const s = fakeSprite(k, x, y)
      creadosB.push(s)
      return s as unknown as SpriteLike
    })

    const ea = wA.spawn(set(Position, { x: 10, y: 10 }), sprite({ key: 'a' }))
    const eb = wB.spawn(set(Position, { x: 20, y: 20 }), sprite({ key: 'b' }))

    expect(ea).not.toBe(eb)
    expect(Sprite.go[ea]).toBe(creadosA[0])
    expect(Sprite.go[eb]).toBe(creadosB[0])

    wA.destroy(ea)
    expect(creadosA[0].destroyed).toBe(true)
    expect(creadosB[0].destroyed).toBe(false)
    expect(Sprite.go[eb]).toBe(creadosB[0])

    creadosB[0].x = 77
    postSync(wB)
    expect(Position.x[eb]).toBe(77)
  })
})
