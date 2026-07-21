import { describe, expect, test, vi } from 'vitest'
import { f32, i16, ref, u8 } from '../../src/core/column'
import {
  component,
  configureCapacity,
  DEFAULT_CAPACITY,
  getConfiguredCapacity,
  getDefaults,
} from '../../src/core/component'

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

  // Estos dos tests necesitan un modulo de component.ts sin ningun componente
  // definido todavia: los demas tests de este archivo ya llamaron a
  // component() antes de que estos corran (module-level, mismo registro de
  // vitest), y desde el arreglo del bloqueante de configureCapacity() eso
  // basta para que la funcion lance. vi.resetModules() + import() dinamico
  // consigue una instancia nueva, aislada de esa contaminacion. column.ts se
  // importa del mismo modo y en el mismo momento para que sus decoradores
  // (@f32 aca) empujen a la misma instancia de `pending` que va a drenar el
  // component() de esa instancia fresca.
  test('configureCapacity antes de definir componentes cambia la capacidad del siguiente', async () => {
    vi.resetModules()
    const column = await import('../../src/core/column')
    const comp = await import('../../src/core/component')
    comp.configureCapacity(16)
    const Small = comp.component(class { @column.f32 x = 0 })
    expect(Small.x.length).toBe(16)
  })

  test('configureCapacity lanza si ya hay componentes definidos', async () => {
    vi.resetModules()
    const column = await import('../../src/core/column')
    const comp = await import('../../src/core/component')
    comp.component(class { @column.f32 x = 0 })
    expect(() => comp.configureCapacity(50_000)).toThrow(/ya se definieron 1 componente/)
    expect(() => comp.configureCapacity(50_000)).toThrow(/configureCapacity/)
    // El rechazo no cambia la capacidad vigente: el componente ya definido
    // sigue siendo la unica fuente de verdad de con que capacidad se creo.
    expect(comp.getConfiguredCapacity()).toBe(comp.DEFAULT_CAPACITY)
  })

  test('configureCapacity rechaza valores que no sean enteros positivos', () => {
    expect(() => configureCapacity(0)).toThrow(/entero positivo/)
    expect(() => configureCapacity(-5)).toThrow(/entero positivo/)
    expect(() => configureCapacity(1.5)).toThrow(/entero positivo/)
    // Un rechazo no cambia la capacidad vigente.
    expect(getConfiguredCapacity()).toBe(DEFAULT_CAPACITY)
  })

  test('un componente sin campos es un objeto vacio usable como tag', () => {
    const Tag = component(class {})
    expect(Object.keys(Tag)).toEqual([])
  })

  test('un campo static es rechazado y aborta la definicion de la clase', () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class Bad {
        @f32 leaked = 0
        @f32 static bad = 0
      }
    }).toThrow(/static/)
  })

  test('un campo privado es rechazado y aborta la definicion de la clase', () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class Bad {
        @f32 leaked = 0
        @f32 #bad = 0
      }
    }).toThrow(/privado/)
  })

  test('captura los valores iniciales de la clase como defaults', () => {
    const Stats = component(class { @i16 hp = 100; @f32 speed = 2.5; @ref name!: string })
    expect(getDefaults(Stats)).toEqual({ hp: 100, speed: 2.5, name: undefined })
  })

  test('los defaults no aparecen como propiedad del store', () => {
    const Stats = component(class { @i16 hp = 100 })
    expect(Object.keys(Stats)).toEqual(['hp'])
  })

  test('getDefaults devuelve undefined para un store ajeno', () => {
    expect(getDefaults({})).toBeUndefined()
  })

  test('una clase rechazada no filtra sus columnas al siguiente componente', () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class Bad {
        @f32 leaked = 0
        @f32 static bad = 0
      }
    }).toThrow()

    const Good = component(class { @f32 x = 0 })
    expect(Object.keys(Good)).toEqual(['x'])
  })
})
