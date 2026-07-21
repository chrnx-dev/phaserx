import { beforeEach, describe, expect, test, vi } from 'vitest'
import { component } from '../../src/core/component'
import { set, World } from '../../src/core/world'
import {
  attachSprites,
  entityOf,
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

describe('bridge: Sprite exige Position', () => {
  function makeFactory() {
    const creados: ReturnType<typeof fakeSprite>[] = []
    const factory = (key: string, x: number, y: number) => {
      const s = fakeSprite(key, x, y)
      creados.push(s)
      return s as unknown as SpriteLike
    }
    return { creados, factory }
  }

  test('spawn de sprite() sin Position lanza', () => {
    const world = new World()
    const { creados, factory } = makeFactory()
    attachSprites(world, factory)
    expect(() => world.spawn(sprite({ key: 'hero' }))).toThrow(/Position/)
    expect(creados).toHaveLength(0)
  })

  test('un eid reciclado no hereda la posicion del ocupante anterior', () => {
    const world = new World()
    const { creados, factory } = makeFactory()
    attachSprites(world, factory)

    const e1 = world.spawn(set(Position, { x: 777, y: 888 }), sprite({ key: 'a' }))
    world.destroy(e1)

    expect(() => world.spawn(sprite({ key: 'b' }))).toThrow(/Position/)
    expect(creados.filter(s => s.x === 777 || s.y === 888)).toHaveLength(1)
  })
})

describe('bridge: preSync no pisa el movimiento de Phaser', () => {
  function makeFactory() {
    const creados: ReturnType<typeof fakeSprite>[] = []
    const factory = (key: string, x: number, y: number) => {
      const s = fakeSprite(key, x, y)
      creados.push(s)
      return s as unknown as SpriteLike
    }
    return { creados, factory }
  }

  test('un tween que mueve el GameObject no es pisado por preSync', () => {
    const world = new World()
    const { creados, factory } = makeFactory()
    attachSprites(world, factory)
    const e = world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))

    world.runPreSync()
    world.runPostSync()

    // "Tween": Phaser mueve el GameObject entre frames.
    creados[0].x = 250
    world.runPreSync()
    expect(creados[0].x).toBe(250)

    world.runPostSync()
    expect(Position.x[e]).toBe(250)

    // Y sigue sin pisarlo en el frame siguiente.
    creados[0].x = 260
    world.runPreSync()
    expect(creados[0].x).toBe(260)
  })

  test('escribir Position desde un system si mueve el GameObject', () => {
    const world = new World()
    const { creados, factory } = makeFactory()
    attachSprites(world, factory)
    world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))

    world.runPreSync()
    world.runPostSync()

    const e = world.query(Sprite, Position)[0]
    Position.x[e] = 999
    world.runPreSync()
    expect(creados[0].x).toBe(999)

    // Sin nuevas escrituras, un tween posterior sobrevive.
    world.runPostSync()
    creados[0].x = 1000
    world.runPreSync()
    expect(creados[0].x).toBe(1000)
  })
})

describe('attachSprites: segunda llamada', () => {
  function makeFactory() {
    const creados: ReturnType<typeof fakeSprite>[] = []
    const factory = (key: string, x: number, y: number) => {
      const s = fakeSprite(key, x, y)
      creados.push(s)
      return s as unknown as SpriteLike
    }
    return { creados, factory }
  }

  test('la segunda llamada devuelve un detach que desengancha de verdad', () => {
    const world = new World()
    const { creados, factory } = makeFactory()
    attachSprites(world, factory)
    const detach = attachSprites(world, factory)

    detach()
    world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    expect(creados).toHaveLength(0)
  })

  test('la segunda llamada con otra factory lanza', () => {
    const world = new World()
    const { factory } = makeFactory()
    const { factory: otra } = makeFactory()
    attachSprites(world, factory)
    expect(() => attachSprites(world, otra)).toThrow(/factory/)
  })

  test('detach de la segunda llamada permite volver a enganchar con otra factory', () => {
    const world = new World()
    const { factory } = makeFactory()
    const otra = makeFactory()
    attachSprites(world, factory)()
    attachSprites(world, otra.factory)
    world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    expect(otra.creados).toHaveLength(1)
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

describe('bridge: mapeo GameObject -> entidad', () => {
  test('la factory recibe el entity id de la entidad que se esta creando', () => {
    const world = new World()
    const recibidos: number[] = []
    attachSprites(world, (key, x, y, entity) => {
      recibidos.push(entity)
      return fakeSprite(key, x, y) as unknown as SpriteLike
    })
    const a = world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    const b = world.spawn(set(Position, { x: 1, y: 1 }), sprite({ key: 'hero' }))
    expect(recibidos).toEqual([a, b])
  })

  test('la factory puede consultar el world con el eid que recibe', () => {
    const world = new World()
    const Marca = component(class {})
    let marcada: boolean | undefined
    attachSprites(world, (key, x, y, entity) => {
      marcada = world.has(entity, Marca)
      return fakeSprite(key, x, y) as unknown as SpriteLike
    })
    world.spawn(set(Position, { x: 0, y: 0 }), Marca, sprite({ key: 'hero' }))
    expect(marcada).toBe(true)
  })

  test('entityOf devuelve la entidad duena del GameObject', () => {
    const world = new World()
    const creados: ReturnType<typeof fakeSprite>[] = []
    attachSprites(world, (key, x, y) => {
      const s = fakeSprite(key, x, y)
      creados.push(s)
      return s as unknown as SpriteLike
    })
    const e = world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    expect(entityOf(creados[0])).toBe(e)
  })

  test('entityOf devuelve undefined para un GameObject ajeno al bridge', () => {
    expect(entityOf(fakeSprite('x', 0, 0))).toBeUndefined()
  })

  test('destruir la entidad rompe el mapeo del GameObject', () => {
    const world = new World()
    const creados: ReturnType<typeof fakeSprite>[] = []
    attachSprites(world, (key, x, y) => {
      const s = fakeSprite(key, x, y)
      creados.push(s)
      return s as unknown as SpriteLike
    })
    const e = world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    world.destroy(e)
    expect(entityOf(creados[0])).toBeUndefined()
  })

  test('un eid reciclado no deja el GameObject viejo apuntando a la entidad nueva', () => {
    const world = new World()
    const creados: ReturnType<typeof fakeSprite>[] = []
    attachSprites(world, (key, x, y) => {
      const s = fakeSprite(key, x, y)
      creados.push(s)
      return s as unknown as SpriteLike
    })
    const e = world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    world.destroy(e)
    world.spawn(set(Position, { x: 5, y: 5 }), sprite({ key: 'hero' }))
    expect(entityOf(creados[0])).toBeUndefined()
    expect(creados).toHaveLength(2)
  })
})

describe('attachSprites: limpieza por teardown del world', () => {
  test('world.teardown() desengancha el bridge', () => {
    const world = new World()
    const creados: ReturnType<typeof fakeSprite>[] = []
    const factory = (key: string, x: number, y: number) => {
      const s = fakeSprite(key, x, y)
      creados.push(s)
      return s as unknown as SpriteLike
    }
    attachSprites(world, factory)
    world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    world.teardown()

    expect(creados[0].destroyed).toBe(true)
    world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    expect(creados).toHaveLength(1)
  })

  test('tras el teardown el world admite una factory distinta', () => {
    const world = new World()
    const otros: ReturnType<typeof fakeSprite>[] = []
    attachSprites(world, (k, x, y) => fakeSprite(k, x, y) as unknown as SpriteLike)
    world.teardown()
    expect(() =>
      attachSprites(world, (k, x, y) => {
        const s = fakeSprite(k, x, y)
        otros.push(s)
        return s as unknown as SpriteLike
      }),
    ).not.toThrow()
    world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    expect(otros).toHaveLength(1)
  })

  test('un detach manual previo no deja el hook de teardown colgado', () => {
    const world = new World()
    const detach = attachSprites(world, (k, x, y) => fakeSprite(k, x, y) as unknown as SpriteLike)
    detach()
    const segundos: ReturnType<typeof fakeSprite>[] = []
    attachSprites(world, (k, x, y) => {
      const s = fakeSprite(k, x, y)
      segundos.push(s)
      return s as unknown as SpriteLike
    })
    world.clear()
    // El teardown del world no debe llevarse puesto el enganche nuevo salvo
    // por su propio hook: tras teardown el bridge nuevo queda desenganchado.
    world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    expect(segundos).toHaveLength(1)
    world.teardown()
    world.spawn(set(Position, { x: 0, y: 0 }), sprite({ key: 'hero' }))
    expect(segundos).toHaveLength(1)
  })
})
