import { describe, expect, test } from 'vitest'
import { f32, i16, u8 } from '../../src/core/column'
import { component, DEFAULT_CAPACITY } from '../../src/core/component'

describe('component()', () => {
  test('crea una columna TypedArray por campo', () => {
    const Position = component(class { @f32 x = 0; @f32 y = 0 })
    expect(Position.x).toBeInstanceOf(Float32Array)
    expect(Position.y).toBeInstanceOf(Float32Array)
    expect(Position.x.length).toBe(DEFAULT_CAPACITY)
  })

  test('respeta el tipo numerico de cada decorador', () => {
    const Mixed = component(class { @f32 a = 0; @i16 b = 0; @u8 c = 0 })
    expect(Mixed.a).toBeInstanceOf(Float32Array)
    expect(Mixed.b).toBeInstanceOf(Int16Array)
    expect(Mixed.c).toBeInstanceOf(Uint8Array)
  })

  test('almacena y lee valores por entity id', () => {
    const Health = component(class { @i16 hp = 0 })
    Health.hp[7] = 250
    expect(Health.hp[7]).toBe(250)
    expect(Health.hp[8]).toBe(0)
  })

  test('no filtra columnas entre componentes', () => {
    const A = component(class { @f32 x = 0 })
    const B = component(class { @f32 y = 0 })
    expect(Object.keys(A)).toEqual(['x'])
    expect(Object.keys(B)).toEqual(['y'])
  })

  test('acepta capacidad personalizada', () => {
    const Small = component(class { @f32 x = 0 }, 16)
    expect(Small.x.length).toBe(16)
  })

  test('un componente sin campos es un objeto vacio usable como tag', () => {
    const Tag = component(class {})
    expect(Object.keys(Tag)).toEqual([])
  })
})
