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
})
