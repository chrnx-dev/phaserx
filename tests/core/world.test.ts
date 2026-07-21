import { getAllEntities } from 'bitecs'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { f32, i16, ref } from '../../src/core/column'
import { component } from '../../src/core/component'
import { set, World } from '../../src/core/world'

const Position = component(class { @f32 x = 0; @f32 y = 0 })
const Velocity = component(class { @f32 x = 0; @f32 y = 0 })
const Health = component(class { @i16 hp = 0 })
const Label = component(class { @ref text!: string })
const Enemy = component(class {})
const TrickyValues = component(class { @ref values!: string })
const TrickyComponent = component(class { @ref component!: string })

describe('World', () => {
  let world: World

  beforeEach(() => {
    world = new World()
  })

  test('spawn devuelve una entidad y aplica valores', () => {
    const e = world.spawn(set(Position, { x: 10, y: 20 }))
    expect(typeof e).toBe('number')
    expect(Position.x[e]).toBe(10)
    expect(Position.y[e]).toBe(20)
  })

  test('spawn acepta componentes sin valores como tags', () => {
    const e = world.spawn(Enemy)
    expect(world.has(e, Enemy)).toBe(true)
  })

  test('spawn aplica valores parciales y deja el resto intacto', () => {
    const e = world.spawn(set(Position, { x: 5 }))
    expect(Position.x[e]).toBe(5)
  })

  test('spawn escribe campos por referencia', () => {
    const e = world.spawn(set(Label, { text: 'jugador' }))
    expect(Label.text[e]).toBe('jugador')
  })

  test('query devuelve las entidades con todos los componentes pedidos', () => {
    const movil = world.spawn(set(Position, { x: 0, y: 0 }), set(Velocity, { x: 1, y: 0 }))
    world.spawn(set(Position, { x: 9, y: 9 }))
    const found = [...world.query(Position, Velocity)]
    expect(found).toEqual([movil])
  })

  test('destroy quita la entidad de las queries', () => {
    const e = world.spawn(set(Health, { hp: 10 }))
    expect([...world.query(Health)]).toContain(e)
    world.destroy(e)
    expect([...world.query(Health)]).not.toContain(e)
  })

  test('onRemove se dispara al destruir la entidad', () => {
    const spy = vi.fn()
    world.onRemove(Health, spy)
    const e = world.spawn(set(Health, { hp: 1 }))
    world.destroy(e)
    expect(spy).toHaveBeenCalledWith(e)
  })

  test('onAdd se dispara al agregar el componente', () => {
    const spy = vi.fn()
    world.onAdd(Health, spy)
    const e = world.spawn(set(Health, { hp: 1 }))
    expect(spy).toHaveBeenCalledWith(e)
  })

  test('onAdd ve el componente ya inicializado', () => {
    let visto = -1
    world.onAdd(Health, eid => {
      visto = Health.hp[eid]
    })
    world.spawn(set(Health, { hp: 77 }))
    expect(visto).toBe(77)
  })

  test('spawn no confunde un componente con columna "values" o "component" con un Setter', () => {
    // Como componente crudo (tag): no debe entrar en la rama de Setter ni
    // lanzar, aunque el store tenga una clave literalmente llamada 'values'
    // o 'component'.
    const eRawValues = world.spawn(TrickyValues)
    expect(world.has(eRawValues, TrickyValues)).toBe(true)

    const eRawComponent = world.spawn(TrickyComponent)
    expect(world.has(eRawComponent, TrickyComponent)).toBe(true)

    // Envuelto en set(): debe escribir la columna correctamente en vez de
    // confundirse con su propio nombre de columna.
    const eSetValues = world.spawn(set(TrickyValues, { values: 'hola' }))
    expect(TrickyValues.values[eSetValues]).toBe('hola')
    expect(world.has(eSetValues, TrickyValues)).toBe(true)

    const eSetComponent = world.spawn(set(TrickyComponent, { component: 'mundo' }))
    expect(TrickyComponent.component[eSetComponent]).toBe('mundo')
    expect(world.has(eSetComponent, TrickyComponent)).toBe(true)
  })

  test('runPreSync corre los hooks registrados con onPreSync en orden', () => {
    const order: string[] = []
    world.onPreSync(() => order.push('a'))
    world.onPreSync(() => order.push('b'))
    world.runPreSync()
    expect(order).toEqual(['a', 'b'])
  })

  test('runPostSync corre los hooks registrados con onPostSync en orden', () => {
    const order: string[] = []
    world.onPostSync(() => order.push('a'))
    world.onPostSync(() => order.push('b'))
    world.runPostSync()
    expect(order).toEqual(['a', 'b'])
  })

  test('runPreSync y runPostSync no fallan sin hooks registrados', () => {
    expect(() => world.runPreSync()).not.toThrow()
    expect(() => world.runPostSync()).not.toThrow()
  })

  test('onPreSync devuelve una funcion que quita el hook', () => {
    const spy = vi.fn()
    const off = world.onPreSync(spy)
    off()
    world.runPreSync()
    expect(spy).not.toHaveBeenCalled()
  })

  test('onPostSync devuelve una funcion que quita el hook', () => {
    const spy = vi.fn()
    const off = world.onPostSync(spy)
    off()
    world.runPostSync()
    expect(spy).not.toHaveBeenCalled()
  })

  test('onAdd devuelve una funcion que cancela la suscripcion', () => {
    const spy = vi.fn()
    const off = world.onAdd(Health, spy)
    off()
    world.spawn(set(Health, { hp: 1 }))
    expect(spy).not.toHaveBeenCalled()
  })

  test('onRemove devuelve una funcion que cancela la suscripcion', () => {
    const spy = vi.fn()
    const off = world.onRemove(Health, spy)
    const e = world.spawn(set(Health, { hp: 1 }))
    off()
    world.destroy(e)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('World: reciclado de entity ids', () => {
  test('una entidad nueva sobre un eid reciclado no hereda datos del ocupante anterior', () => {
    const world = new World()
    const muerto = world.spawn(set(Position, { x: 500, y: 900 }), set(Velocity, { x: 9, y: 9 }))
    world.destroy(muerto)

    const nuevo = world.spawn(Position, Velocity)
    expect(nuevo).toBe(muerto) // el id se recicla: por eso hace falta el reset
    expect(Position.x[nuevo]).toBe(0)
    expect(Position.y[nuevo]).toBe(0)
    expect(Velocity.x[nuevo]).toBe(0)
    expect(Velocity.y[nuevo]).toBe(0)
  })

  test('un set parcial deja las columnas no especificadas en su default declarado', () => {
    const world = new World()
    const muerto = world.spawn(set(Position, { x: 500, y: 900 }))
    world.destroy(muerto)

    const nuevo = world.spawn(set(Position, { x: 5 }))
    expect(Position.x[nuevo]).toBe(5)
    expect(Position.y[nuevo]).toBe(0)
  })

  test('un componente con default no-cero arranca en su default', () => {
    const Vitality = component(class { @i16 hp = 100 })
    const world = new World()
    const e = world.spawn(Vitality)
    expect(Vitality.hp[e]).toBe(100)

    Vitality.hp[e] = 3
    world.destroy(e)
    const otro = world.spawn(Vitality)
    expect(Vitality.hp[otro]).toBe(100)
  })

  test('un campo por referencia vuelve a undefined al reciclarse el eid', () => {
    const world = new World()
    const muerto = world.spawn(set(Label, { text: 'jugador' }))
    world.destroy(muerto)

    const nuevo = world.spawn(Label)
    expect(Label.text[nuevo]).toBeUndefined()
  })
})

describe('World: hooks que se desregistran durante el run', () => {
  test('runPreSync corre todos los hooks aunque uno quite a un hook anterior', () => {
    const world = new World()
    const orden: string[] = []
    const off = world.onPreSync(() => orden.push('primero'))
    world.onPreSync(() => {
      orden.push('user')
      off()
    })
    world.onPreSync(() => orden.push('despues'))
    world.runPreSync()
    expect(orden).toEqual(['primero', 'user', 'despues'])
  })

  test('runPostSync corre todos los hooks aunque uno quite a un hook anterior', () => {
    const world = new World()
    const orden: string[] = []
    const off = world.onPostSync(() => orden.push('primero'))
    world.onPostSync(() => {
      orden.push('user')
      off()
    })
    world.onPostSync(() => orden.push('despues'))
    world.runPostSync()
    expect(orden).toEqual(['primero', 'user', 'despues'])
  })

  test('un hook que se quita a si mismo no corre en el frame siguiente', () => {
    const world = new World()
    const orden: string[] = []
    const off: (() => void)[] = []
    off.push(
      world.onPreSync(() => {
        orden.push('once')
        off[0]()
      }),
    )
    world.runPreSync()
    world.runPreSync()
    expect(orden).toEqual(['once'])
  })
})

describe('World: capacidad de las columnas', () => {
  // Este archivo ya definio varios componentes module-level (arriba) antes de
  // que este test corra, y desde el arreglo del bloqueante de
  // configureCapacity() eso basta para que la funcion lance: ya no hay forma
  // de reconfigurar la capacidad a mitad de camino, ni siquiera para volver a
  // DEFAULT_CAPACITY despues. vi.resetModules() + import() dinamico de
  // column.ts, component.ts y world.ts consigue un grafo de modulos nuevo,
  // sin componentes definidos todavia, y aislado del entity index compartido
  // de este archivo.
  test('spawn lanza cuando el entity id excede la capacidad del componente', async () => {
    vi.resetModules()
    const column = await import('../../src/core/column')
    const comp = await import('../../src/core/component')
    const worldMod = await import('../../src/core/world')
    comp.configureCapacity(3)
    const Tiny = comp.component(class { @column.f32 x = 0 })
    const world = new worldMod.World()
    let lanzo: unknown
    try {
      for (let i = 0; i < 64; i++) world.spawn(worldMod.set(Tiny, { x: 1 }))
    } catch (err) {
      lanzo = err
    }
    expect(lanzo).toBeInstanceOf(Error)
    expect((lanzo as Error).message).toMatch(/capacidad/)
    expect((lanzo as Error).message).toMatch(/3/)
    // El mensaje nombra la causa real: el espacio de ids del proceso,
    // compartido por todas las escenas. No culpa al usuario de no destruir
    // entidades de un world descartado, que puede no haber pasado nunca.
    expect((lanzo as Error).message).toMatch(/espacio de entity ids/)
    expect((lanzo as Error).message).toMatch(/configureCapacity/)
  })

  test('spawn de un componente con capacidad por defecto no lanza', () => {
    const world = new World()
    expect(() => world.spawn(set(Position, { x: 1, y: 1 }))).not.toThrow()
  })
})

describe('World: spawn es atomico', () => {
  /** Entidades vivas del world, sin depender de que tengan tal componente. */
  function vivas(world: World): number {
    return getAllEntities(world.raw).length
  }

  test('el guard de capacidad no deja la entidad viva', async () => {
    // Mismo aislamiento que el test anterior: configureCapacity() ya no
    // acepta reconfigurar a mitad de camino, asi que necesita un grafo de
    // modulos propio, sin componentes definidos todavia. Al ser un world
    // fresco tambien parte de un entity index propio: bitECS reparte el eid 1
    // (no el 0) en el primer addEntity, asi que con capacidad 2 el primer
    // spawn entra (eid 1 < 2) y el segundo la excede (eid 2 >= 2). La
    // asercion se mueve al segundo spawn para probar lo mismo que antes
    // probaba el primero al apoyarse en ids ya repartidos por otros tests.
    vi.resetModules()
    // bitecs se reimporta tambien: vi.resetModules() vacia TODO el registro
    // (paquetes de node_modules incluidos), asi que el world.ts fresco
    // importado abajo trae su propia instancia de bitecs. Usar el
    // `getAllEntities` estatico de arriba (atado a la instancia vieja) sobre
    // un `world.raw` creado por la instancia nueva no esta garantizado.
    const bitecsFresh = await import('bitecs')
    const column = await import('../../src/core/column')
    const comp = await import('../../src/core/component')
    const worldMod = await import('../../src/core/world')
    comp.configureCapacity(2)
    const Tiny = comp.component(class { @column.f32 x = 0 })
    const world = new worldMod.World()
    function vivasFresh(w: InstanceType<typeof worldMod.World>): number {
      return bitecsFresh.getAllEntities(w.raw).length
    }
    expect(() => world.spawn(worldMod.set(Tiny, { x: 1 }))).not.toThrow()
    expect(() => world.spawn(worldMod.set(Tiny, { x: 1 }))).toThrow(/capacidad/)
    expect(vivasFresh(world)).toBe(1)
  })

  test('una columna inexistente no deja la entidad viva', () => {
    const world = new World()
    expect(() =>
      world.spawn(set(Position, { x: 1, noExiste: 2 } as unknown as { x: number })),
    ).toThrow(/columna 'noExiste'/)
    expect(vivas(world)).toBe(0)
  })

  test('un observer onAdd que lanza no deja la entidad viva ni en las queries', () => {
    const world = new World()
    world.onAdd(Health, () => {
      throw new Error('el observer rechaza la entidad')
    })
    expect(() => world.spawn(set(Position, { x: 1, y: 1 }), set(Health, { hp: 5 }))).toThrow(
      /rechaza/,
    )
    expect(vivas(world)).toBe(0)
    expect(world.query(Position)).toHaveLength(0)
    expect(world.query(Health)).toHaveLength(0)
  })

  test('el rollback corre los onRemove, asi las capas de arriba limpian lo suyo', () => {
    // Es el caso real del bridge: su observer onAdd de Sprite ya creo el
    // GameObject cuando el observer de otro componente lanza. Sin onRemove
    // ese GameObject quedaria vivo y sin dueno.
    const world = new World()
    const destruidos: number[] = []
    world.onRemove(Position, eid => destruidos.push(eid))
    world.onAdd(Health, () => {
      throw new Error('boom')
    })
    let eid = -1
    world.onAdd(Position, e => {
      eid = e
    })
    expect(() => world.spawn(set(Position, { x: 1, y: 1 }), set(Health, { hp: 5 }))).toThrow(/boom/)
    expect(destruidos).toEqual([eid])
  })

  test('el rollback devuelve las columnas ya escritas a su default', () => {
    const world = new World()
    let eid = -1
    world.onAdd(Health, e => {
      eid = e
      throw new Error('boom')
    })
    expect(() => world.spawn(set(Position, { x: 111, y: 222 }), set(Health, { hp: 5 }))).toThrow()
    expect(Position.x[eid]).toBe(0)
    expect(Position.y[eid]).toBe(0)
  })

  test('un spawn fallido no consume el entity id', () => {
    const world = new World()
    const off = world.onAdd(Health, () => {
      throw new Error('boom')
    })
    expect(() => world.spawn(set(Health, { hp: 1 }))).toThrow()
    off()
    // El id vuelve al pool: el siguiente spawn lo reusa en vez de quemarlo.
    const e = world.spawn(set(Health, { hp: 1 }))
    expect(world.has(e, Health)).toBe(true)
  })
})

describe('World: destroy libera las referencias', () => {
  test('destroy libera un campo @ref de un componente cualquiera', () => {
    const Payload = component(class { @ref data!: object })
    const world = new World()
    const grande = { blob: new Array(10).fill('x') }
    const e = world.spawn(set(Payload, { data: grande }))
    expect(Payload.data[e]).toBe(grande)
    world.destroy(e)
    expect(Payload.data[e]).toBeUndefined()
  })

  test('destroy resetea las columnas numericas de la entidad', () => {
    const world = new World()
    const e = world.spawn(set(Position, { x: 123, y: 456 }))
    world.destroy(e)
    expect(Position.x[e]).toBe(0)
    expect(Position.y[e]).toBe(0)
  })

  test('destroy no toca los componentes que la entidad no tiene', () => {
    const world = new World()
    const otro = world.spawn(set(Velocity, { x: 4, y: 4 }))
    const e = world.spawn(set(Position, { x: 1, y: 1 }))
    world.destroy(e)
    expect(Velocity.x[otro]).toBe(4)
  })

  test('destruir una entidad que ya murio sigue siendo un no-op', () => {
    const world = new World()
    const e = world.spawn(set(Position, { x: 1, y: 1 }))
    world.destroy(e)
    expect(() => world.destroy(e)).not.toThrow()
    expect(() => world.destroy(999_999)).not.toThrow()
  })

  test('los observers onRemove ven los datos de la entidad', () => {
    const world = new World()
    let visto = -1
    world.onRemove(Health, eid => {
      visto = Health.hp[eid]
    })
    const e = world.spawn(set(Health, { hp: 42 }))
    world.destroy(e)
    expect(visto).toBe(42)
  })
})

describe('World: aislamiento entre worlds simultaneos', () => {
  test('dos worlds simultaneos no comparten entity ids', () => {
    const a = new World()
    const b = new World()
    const ea = a.spawn(set(Position, { x: 1, y: 1 }))
    const eb = b.spawn(set(Position, { x: 2, y: 2 }))
    expect(ea).not.toBe(eb)
    expect(Position.x[ea]).toBe(1)
    expect(Position.x[eb]).toBe(2)
  })

  test('destruir en un world no afecta a las entidades del otro', () => {
    const a = new World()
    const b = new World()
    const ea = a.spawn(set(Health, { hp: 10 }))
    const eb = b.spawn(set(Health, { hp: 20 }))
    a.destroy(ea)
    expect([...b.query(Health)]).toContain(eb)
    expect(Health.hp[eb]).toBe(20)
  })
})

describe('World.clear', () => {
  test('destruye todas las entidades vivas del world', () => {
    const world = new World()
    world.spawn(set(Position, { x: 1, y: 1 }))
    world.spawn(set(Health, { hp: 5 }))
    world.spawn(Enemy)
    world.clear()
    expect(world.query(Position)).toHaveLength(0)
    expect(world.query(Health)).toHaveLength(0)
    expect(world.query(Enemy)).toHaveLength(0)
  })

  test('alcanza a las entidades sin ningun componente', () => {
    const world = new World()
    const e = world.spawn()
    world.clear()
    expect(world.has(e, Position)).toBe(false)
    // Un eid libre se recicla: el proximo spawn puede volver a tomarlo.
    expect(() => world.destroy(e)).not.toThrow()
  })

  test('dispara los observers onRemove de cada entidad', () => {
    const world = new World()
    const vistos: number[] = []
    world.onRemove(Health, eid => vistos.push(Health.hp[eid]))
    world.spawn(set(Health, { hp: 7 }))
    world.spawn(set(Health, { hp: 9 }))
    world.clear()
    expect(vistos.sort()).toEqual([7, 9])
  })

  test('resetea las columnas de todas las entidades destruidas', () => {
    const world = new World()
    const a = world.spawn(set(Position, { x: 10, y: 20 }), set(Label, { text: 'a' }))
    const b = world.spawn(set(Position, { x: 30, y: 40 }))
    world.clear()
    expect(Position.x[a]).toBe(0)
    expect(Position.x[b]).toBe(0)
    expect(Label.text[a]).toBeUndefined()
  })

  test('no toca las entidades de otro world', () => {
    const a = new World()
    const b = new World()
    a.spawn(set(Position, { x: 1, y: 1 }))
    const eb = b.spawn(set(Position, { x: 2, y: 2 }))
    a.clear()
    expect([...b.query(Position)]).toEqual([eb])
    expect(Position.x[eb]).toBe(2)
  })

  test('sobre un world vacio es un no-op', () => {
    const world = new World()
    expect(() => world.clear()).not.toThrow()
  })

  test('es repetible: dos clear seguidos dejan el world vacio igual', () => {
    const world = new World()
    world.spawn(set(Position, { x: 1, y: 1 }))
    world.clear()
    world.clear()
    expect(world.query(Position)).toHaveLength(0)
  })
})

describe('World.teardown', () => {
  test('destruye las entidades ANTES de correr los hooks de teardown', () => {
    const world = new World()
    const orden: string[] = []
    world.onRemove(Position, () => orden.push('onRemove'))
    world.onTeardown(() => orden.push('teardown'))
    world.spawn(set(Position, { x: 1, y: 1 }))
    world.teardown()
    expect(orden).toEqual(['onRemove', 'teardown'])
  })

  test('corre los hooks en orden de registro y una sola vez', () => {
    const world = new World()
    const orden: string[] = []
    world.onTeardown(() => orden.push('a'))
    world.onTeardown(() => orden.push('b'))
    world.teardown()
    world.teardown()
    expect(orden).toEqual(['a', 'b'])
  })

  test('la funcion que devuelve onTeardown da de baja el hook', () => {
    const world = new World()
    const hook = vi.fn()
    world.onTeardown(hook)()
    world.teardown()
    expect(hook).not.toHaveBeenCalled()
  })

  test('un hook que se da de baja a si mismo no se saltea a los que siguen', () => {
    const world = new World()
    const corridos: string[] = []
    const off = world.onTeardown(() => {
      corridos.push('primero')
      off()
    })
    world.onTeardown(() => corridos.push('segundo'))
    world.teardown()
    expect(corridos).toEqual(['primero', 'segundo'])
  })
})
