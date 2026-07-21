import { Asset, defineAssets } from '../../src/assets/index'

const A = defineAssets({
  player: { type: 'image', url: 'player.png' },
  jump: { type: 'audio', url: 'jump.wav' },
})

class Escena {
  // @ts-expect-error un AudioSpec carga un BaseSound, no una Texture
  @Asset(A.jump) mal!: Phaser.Textures.Texture

  // el tipo correcto compila
  @Asset(A.player) bien!: Phaser.Textures.Texture
}
void Escena
