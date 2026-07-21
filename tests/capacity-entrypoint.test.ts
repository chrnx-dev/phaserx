import { describe, expect, test, vi } from 'vitest'

/**
 * `configureCapacity` tiene un punto de entrada propio (`src/capacity.ts`,
 * publicado como `'phaserx/capacity'`) separado del barrel principal
 * (`src/index.ts`, `'phaserx'`) a proposito: el barrel reexporta el bridge, y
 * el bridge define `Position`, `Velocity` y `Sprite` al evaluarse. Como los
 * `import`/`export ... from` de un modulo se izan y se evaluan enteros antes
 * de que el cuerpo del modulo que importa corra una sola linea, traer
 * `configureCapacity` de `'phaserx'` evalua todo el barrel -bridge incluido-
 * antes de que la llamada llegue a correr, y para entonces esos tres
 * componentes ya estan definidos: la llamada lanza siempre, sin importar el
 * orden de las lineas. Ver el JSDoc de `configureCapacity` y de
 * `src/capacity.ts`, y la seccion "La capacidad es global al proceso" del
 * README.
 *
 * Cada test usa vi.resetModules() + import() dinamico para partir de un grafo
 * de modulos sin componentes definidos todavia: los demas archivos de test ya
 * importaron '../src/index' (component.ts es un singleton module-level) antes
 * de que estos corran.
 */
describe('phaserx/capacity: punto de entrada dedicado de configureCapacity', () => {
  test('configureCapacity importado del barrel completo (src/index) siempre lanza', async () => {
    vi.resetModules()
    const barrel = await import('../src/index')
    expect(() => barrel.configureCapacity(50_000)).toThrow(/ya se definieron 3 componente/)
  })

  test('configureCapacity importado de src/capacity no toca el bridge y funciona', async () => {
    vi.resetModules()
    const cap = await import('../src/capacity')
    cap.configureCapacity(50_000)
    // El barrel se importa DESPUES: sus componentes (Position, Velocity, del
    // bridge) recien se definen aca, con la capacidad ya configurada.
    const barrel = await import('../src/index')
    expect(barrel.Position.x.length).toBe(50_000)
    expect(barrel.Velocity.x.length).toBe(50_000)
  })

  test('la receta del README, calcada en archivos reales (capacity.ts + main.ts), funciona', async () => {
    // tests/fixtures/readme-capacity-recipe/ reproduce la forma exacta que
    // documenta la seccion "La capacidad es global al proceso": un modulo de
    // solo efecto (capacity.ts) que importa configureCapacity de
    // 'phaserx/capacity' y la llama en su cuerpo, importado PRIMERO desde el
    // entry (main.ts), antes que el modulo que define los componentes de
    // usuario (components.ts, que a su vez importa de 'phaserx' normal).
    vi.resetModules()
    const { Position } = await import('./fixtures/readme-capacity-recipe/main')
    expect(Position.x.length).toBe(50_000)
  })
})
