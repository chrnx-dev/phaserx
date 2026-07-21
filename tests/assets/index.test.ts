import { describe, expect, test } from 'vitest'
import { Asset, defineAssets, drainAssets } from '../../src/assets/index'

const A = defineAssets({
  player: { type: 'image', url: 'player.png' },
  tiles: { type: 'spritesheet', url: 'tiles.png', frameWidth: 32, frameHeight: 32 },
  jump: { type: 'audio', url: 'jump.wav' },
})

describe('assets', () => {
  test('defineAssets estampa la key desde el nombre del campo', () => {
    expect(A.player.key).toBe('player')
    expect(A.tiles.key).toBe('tiles')
  })

  test('defineAssets preserva el resto del spec', () => {
    expect(A.tiles.url).toBe('tiles.png')
    expect(A.tiles.frameWidth).toBe(32)
  })

  test('@Asset registra el binding de propiedad a spec', () => {
    drainAssets() // limpiar residuos de otros tests
    class Escena {
      @Asset(A.player) tex!: Phaser.Textures.Texture
      @Asset(A.jump) sfx!: Phaser.Sound.BaseSound
    }
    void Escena
    const bindings = drainAssets()
    expect(bindings).toEqual([
      { property: 'tex', spec: A.player },
      { property: 'sfx', spec: A.jump },
    ])
  })

  test('drainAssets vacia el buffer', () => {
    drainAssets()
    expect(drainAssets()).toEqual([])
  })

  test('una clase rechazada no filtra sus bindings a la proxima escena', () => {
    const badSpec = { type: 'image', url: 'ghost.png' } as unknown as typeof A.player

    drainAssets() // limpiar residuos de otros tests
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      class BrokenScene {
        @Asset(A.player) leaked!: Phaser.Textures.Texture
        @Asset(badSpec) bad!: Phaser.Textures.Texture
      }
    }).toThrow(/key/)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    class NextScene {}
    void NextScene
    expect(drainAssets()).toEqual([])
  })
})
