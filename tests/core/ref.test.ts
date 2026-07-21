import { describe, expect, test } from 'vitest'
import { f32, ref } from '../../src/core/column'
import { component } from '../../src/core/component'

describe('@ref', () => {
  test('produce un array plano, no un TypedArray', () => {
    const Named = component(class { @ref label!: string })
    expect(Array.isArray(Named.label)).toBe(true)
  })

  test('almacena objetos por entity id', () => {
    const Holder = component(class { @ref target!: { id: number } })
    const obj = { id: 99 }
    Holder.target[3] = obj
    expect(Holder.target[3]).toBe(obj)
    expect(Holder.target[4]).toBeUndefined()
  })

  test('convive con columnas numericas en el mismo componente', () => {
    const Mixed = component(class { @f32 x = 0; @ref name!: string })
    expect(Mixed.x).toBeInstanceOf(Float32Array)
    expect(Array.isArray(Mixed.name)).toBe(true)
    Mixed.x[1] = 5
    Mixed.name[1] = 'uno'
    expect(Mixed.x[1]).toBe(5)
    expect(Mixed.name[1]).toBe('uno')
  })
})
