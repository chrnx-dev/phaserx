import { beforeEach, describe, expect, test, vi } from 'vitest'
import { f32, i16, ref } from '../../src/core/column'
import { component } from '../../src/core/component'
import { set, World } from '../../src/core/world'

const Position = component(class { @f32 x = 0; @f32 y = 0 })
const Velocity = component(class { @f32 x = 0; @f32 y = 0 })
const Health = component(class { @i16 hp = 0 })
const Label = component(class { @ref text!: string })
const Enemy = component(class {})

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
})
