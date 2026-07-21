import Phaser from 'phaser'
import { Asset, attachSprites, GameScene, Position, Scene, set, sprite, Velocity } from '../src/index'
import { A } from './assets'

/**
 * Segunda escena, a la que se llega cuando el jugador muere.
 *
 * Existe sobre todo para ejercitar el ciclo de vida completo: world nuevo,
 * `attachSprites` sobre otro world, y entity ids que se reciclan entre
 * escenas (los ids son globales al proceso, ver World en src/core/world.ts).
 *
 * No ofrece "reiniciar" a proposito: volver a entrar a una escena de PhaserX
 * duplica los listeners de frame que `GameScene#create()` registra, y los
 * systems pasan a correr dos veces por frame. Es el hallazgo 13 de
 * docs/superpowers/notes/2026-07-21-demo-findings.md.
 */
@Scene({ key: 'fin' })
export class FinScene extends GameScene {
  // El asset se vuelve a declarar aca porque los @Asset son por escena. El
  // loader de Phaser saltea la descarga si la key ya esta en el TextureManager.
  @Asset(A.enemy) enemyTex!: Phaser.Textures.Texture

  private enemigosVivos = 0

  /** `init` es de Phaser, no de PhaserX: recibe el data de `scene.start()`. */
  init(data?: { enemigosVivos?: number }): void {
    this.enemigosVivos = data?.enemigosVivos ?? 0
  }

  protected onCreate(): void {
    const detach = attachSprites(this.world, (key, x, y) => this.physics.add.sprite(x, y, key))

    this.add.text(400, 220, 'GAME OVER', { fontSize: '48px', color: '#ffffff' }).setOrigin(0.5)
    this.add
      .text(400, 280, `enemigos vivos cuando caiste: ${this.enemigosVivos}`, {
        fontSize: '20px',
        color: '#bbbbbb',
      })
      .setOrigin(0.5)

    // Una sola entidad con sprite, en una posicion que la escena anterior no
    // uso nunca. Es la sonda del ciclo de vida: si el world nuevo arrastrara
    // algo de la escena vieja (un eid reciclado con la Position del muerto, un
    // GameObject huerfano), se veria justo aca.
    this.world.spawn(
      set(Position, { x: 400, y: 380 }),
      set(Velocity, { x: 0, y: 0 }),
      sprite(A.enemy),
    )

    // Misma limpieza manual que en JuegoScene, por el mismo motivo (hallazgo
    // 12): GameScene no engancha nada al SHUTDOWN.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const e of [...this.world.query(Position)]) this.world.destroy(e)
      detach()
    })
  }
}
