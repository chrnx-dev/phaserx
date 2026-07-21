// @vitest-environment jsdom
//
// El paquete `phaser` ejecuta deteccion de dispositivo (window, document,
// Image, canvas...) en el top-level de su modulo. Bajo el entorno 'node'
// (el default de este proyecto, ver vitest.config.ts) esa deteccion revienta
// con ReferenceError apenas se importa `src/scene/index.ts`, aunque el test
// nunca instancie GameScene. jsdom es la unica pieza de este archivo que
// necesita ese DOM minimo; el resto de la suite sigue en 'node'.
import './setup'
import { describe, expect, test } from 'vitest'
import { f32 } from '../../src/core/column'
import { component } from '../../src/core/component'
import { Query, System, type QueryResult } from '../../src/core/system'
import { Asset, defineAssets, drainAssets } from '../../src/assets/index'
import { getSceneMeta, runSystems, Scene } from '../../src/scene/index'
import { set, World } from '../../src/core/world'

const A = defineAssets({ hero: { type: 'image', url: 'hero.png' } })
const Position = component(class { @f32 x = 0; @f32 y = 0 })

@System()
class Contador {
  @Query(Position) entities!: QueryResult
  llamadas = 0
  ultimoDt = 0
  update(dt: number) {
    this.llamadas++
    this.ultimoDt = dt
  }
}

@Scene({ key: 'juego', systems: [Contador] })
class Juego {
  @Asset(A.hero) hero!: Phaser.Textures.Texture
}

describe('@Scene', () => {
  test('registra la key', () => {
    expect(getSceneMeta(Juego)?.key).toBe('juego')
  })

  test('registra los systems declarados', () => {
    expect(getSceneMeta(Juego)?.systems).toEqual([Contador])
  })

  test('captura los bindings de @Asset de la clase', () => {
    expect(getSceneMeta(Juego)?.assets).toEqual([{ property: 'hero', spec: A.hero }])
  })

  test('no deja bindings colgando para la escena siguiente', () => {
    expect(drainAssets()).toEqual([])
  })

  test('una clase sin @Scene no tiene metadata', () => {
    class Suelta {}
    expect(getSceneMeta(Suelta)).toBeUndefined()
  })
})

describe('runSystems', () => {
  test('llama update de cada system con el delta en segundos', () => {
    const world = new World()
    world.spawn(set(Position, { x: 0, y: 0 }))
    const sys = new Contador()
    runSystems([sys], world, 500)
    expect(sys.llamadas).toBe(1)
    expect(sys.ultimoDt).toBeCloseTo(0.5)
  })

  test('inyecta el world para que las queries funcionen', () => {
    const world = new World()
    const e = world.spawn(set(Position, { x: 1, y: 1 }))
    const sys = new Contador()
    runSystems([sys], world, 16)
    expect([...sys.entities]).toEqual([e])
  })

  test('ignora systems sin update', () => {
    const world = new World()
    const sinUpdate = {}
    expect(() => runSystems([sinUpdate], world, 16)).not.toThrow()
  })

  test('respeta el orden de declaracion', () => {
    const order: string[] = []
    const a = { update: () => void order.push('a') }
    const b = { update: () => void order.push('b') }
    runSystems([a, b], new World(), 16)
    expect(order).toEqual(['a', 'b'])
  })
})
