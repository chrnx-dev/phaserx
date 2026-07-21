import Phaser from 'phaser'
import { Asset, attachSprites, GameScene, Position, Scene, set, sprite, Velocity } from '../src/index'
import { A } from './assets'
import { Enemy, Health, Player } from './components'
import { ChaseSystem, DeathSystem, type Keys, PlayerInputSystem } from './systems'

const keys: Keys = { left: false, right: false, up: false, down: false }

@Scene({ key: 'juego' })
export class JuegoScene extends GameScene {
  // Los @Asset son lo unico que dispara la carga: sin estos campos el
  // manifest de assets.ts no llega nunca al loader y `sprite(A.player)`
  // pediria una textura inexistente.
  @Asset(A.player) playerTex!: Phaser.Textures.Texture
  @Asset(A.enemy) enemyTex!: Phaser.Textures.Texture

  protected onCreate(): void {
    attachSprites(this.world, (key, x, y) => this.physics.add.sprite(x, y, key))

    this.systems = [
      new PlayerInputSystem(keys),
      new ChaseSystem(),
      new DeathSystem(e => this.world.destroy(e)),
    ]

    this.world.spawn(
      set(Position, { x: 400, y: 300 }),
      set(Velocity, { x: 0, y: 0 }),
      Player,
      set(Health, { hp: 100 }),
      sprite(A.player),
    )

    for (let i = 0; i < 5; i++) {
      this.world.spawn(
        set(Position, { x: 100 + i * 120, y: 80 }),
        set(Velocity, { x: 0, y: 0 }),
        set(Enemy, { chaseSpeed: 60 }),
        set(Health, { hp: 10 }),
        sprite(A.enemy),
      )
    }

    // El listener se registra aca a proposito: GameScene engancha el suyo
    // recien despues de onCreate(), asi que este corre primero y los systems
    // ven el teclado del frame actual y no el del anterior.
    const cursors = this.input.keyboard!.createCursorKeys()
    this.events.on(Phaser.Scenes.Events.PRE_UPDATE, () => {
      keys.left = cursors.left.isDown
      keys.right = cursors.right.isDown
      keys.up = cursors.up.isDown
      keys.down = cursors.down.isDown
    })

    // Solo para verificar el demo desde afuera (navegador / automatizacion).
    ;(globalThis as unknown as Record<string, unknown>).demo = {
      snapshot: () =>
        [...this.world.query(Position)].map(e => ({
          e,
          x: Position.x[e],
          y: Position.y[e],
          enemy: this.world.has(e, Enemy),
        })),
    }
  }
}
