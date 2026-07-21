import Phaser from 'phaser'
import {
  Asset,
  attachSprites,
  type Entity,
  GameScene,
  Position,
  Scene,
  set,
  sprite,
  Sprite,
  Velocity,
} from '../src/index'
import { A } from './assets'
import { Damage, Enemy, Health, Player } from './components'
import { ChaseSystem, DeathSystem, type Keys, PlayerInputSystem } from './systems'

const keys: Keys = { left: false, right: false, up: false, down: false }

/**
 * Un mismo par (atacante, victima) no puede volver a golpear antes de esto.
 * `overlap` de Arcade dispara en CADA frame mientras los cuerpos se tocan: sin
 * cooldown, 60 golpes por segundo vacian cualquier barra de vida en un frame y
 * medio.
 */
const COOLDOWN_GOLPE_MS = 400

@Scene({ key: 'juego' })
export class JuegoScene extends GameScene {
  // Los @Asset son lo unico que dispara la carga: sin estos campos el
  // manifest de assets.ts no llega nunca al loader y `sprite(A.player)`
  // pediria una textura inexistente.
  @Asset(A.player) playerTex!: Phaser.Textures.Texture
  @Asset(A.enemy) enemyTex!: Phaser.Textures.Texture

  /** `${atacante}>${victima}` -> timestamp del ultimo golpe aplicado. */
  private readonly ultimoGolpe = new Map<string, number>()

  protected onCreate(): void {
    const detach = attachSprites(this.world, (key, x, y) => this.physics.add.sprite(x, y, key))

    this.systems = [
      new PlayerInputSystem(keys),
      new ChaseSystem(),
      new DeathSystem(e => this.matar(e)),
    ]

    // Grupos planos (`add.group`, no `physics.add.group`): los cuerpos ya los
    // creo la factory del bridge con `physics.add.sprite`. El grupo se usa solo
    // como coleccion para el overlap, y aporta justo lo que hace falta aca: se
    // desuscribe solo cuando un hijo se destruye, asi que el collider nunca
    // queda apuntando al GameObject de una entidad muerta.
    const jugadores = this.add.group()
    const enemigos = this.add.group()

    const jugador = this.world.spawn(
      set(Position, { x: 400, y: 300 }),
      set(Velocity, { x: 0, y: 0 }),
      Player,
      set(Health, { hp: 100 }),
      set(Damage, { amount: 5 }),
      sprite(A.player),
    )
    jugadores.add(this.gameObjectDe(jugador))

    for (let i = 0; i < 5; i++) {
      const enemigo = this.world.spawn(
        set(Position, { x: 100 + i * 120, y: 80 }),
        set(Velocity, { x: 0, y: 0 }),
        set(Enemy, { chaseSpeed: 120 }),
        set(Health, { hp: 10 }),
        set(Damage, { amount: 20 }),
        sprite(A.enemy),
      )
      enemigos.add(this.gameObjectDe(enemigo))
    }

    this.physics.add.overlap(jugadores, enemigos, (a, b) => {
      this.contacto(a as Phaser.GameObjects.GameObject, b as Phaser.GameObjects.GameObject)
    })

    // El listener se registra aca a proposito: GameScene engancha el suyo
    // recien despues de onCreate(), asi que este corre primero y los systems
    // ven el teclado del frame actual y no el del anterior.
    const cursors = this.input.keyboard!.createCursorKeys()
    const leerTeclado = () => {
      keys.left = cursors.left.isDown
      keys.right = cursors.right.isDown
      keys.up = cursors.up.isDown
      keys.down = cursors.down.isDown
    }
    this.events.on(Phaser.Scenes.Events.PRE_UPDATE, leerTeclado)

    // ---------------------------------------------------------------------
    // LIMPIEZA DE CICLO DE VIDA, A MANO Y A PROPOSITO.
    //
    // GameScene no engancha NADA al SHUTDOWN: ni el `detach()` que devuelve
    // attachSprites, ni la destruccion de las entidades del world. Sin este
    // bloque, al hacer `scene.start('fin')` las entidades de esta escena
    // sobreviven a la escena (los entity ids son globales al proceso y solo se
    // reciclan al destruirse), el bridge queda enganchado a un world que ya no
    // corre, y `Sprite.go` sigue apuntando a GameObjects que Phaser destruyo.
    //
    // No es una particularidad del demo: es el hallazgo 12 de
    // docs/superpowers/notes/2026-07-21-demo-findings.md. Va explicito aca
    // para que se vea el trabajo que el framework le deja al usuario.
    // ---------------------------------------------------------------------
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // El orden importa: destruir PRIMERO (el observer onRemove del bridge
      // todavia esta enganchado y es el que libera Sprite.go y las sombras de
      // posicion), y recien despues soltar el bridge. Al reves, cada entidad
      // dejaria su GameObject y su sombra colgados para siempre.
      //
      // Se consulta por Position porque no hay forma de pedirle al world
      // "todas las entidades"; en este demo toda entidad tiene Position.
      // La copia con spread es obligatoria: query() devuelve el array vivo de
      // bitECS y destroy() lo muta.
      for (const e of [...this.world.query(Position)]) this.world.destroy(e)
      detach()
      this.events.off(Phaser.Scenes.Events.PRE_UPDATE, leerTeclado)
      this.ultimoGolpe.clear()
    })
  }

  /**
   * El GameObject que el bridge acaba de crear para la entidad, marcado con su
   * eid.
   *
   * El bridge no expone ningun mapeo GameObject -> entidad, y la factory de
   * `attachSprites` solo recibe `(key, x, y)`: no sabe para que entidad esta
   * creando el sprite. Como los callbacks de colision de Phaser hablan en
   * GameObjects y el ECS habla en eids, el puente lo tiene que armar el
   * usuario a mano, con `setData`.
   */
  private gameObjectDe(e: Entity): Phaser.GameObjects.GameObject {
    const go = Sprite.go[e] as unknown as Phaser.Physics.Arcade.Sprite
    go.setData('eid', e)
    return go
  }

  /** Overlap jugador <-> enemigo: los dos se hacen dano al tocarse. */
  private contacto(a: Phaser.GameObjects.GameObject, b: Phaser.GameObjects.GameObject): void {
    const jugador = a.getData('eid') as Entity
    const enemigo = b.getData('eid') as Entity
    const ahora = this.time.now
    this.golpear(ahora, enemigo, jugador)
    this.golpear(ahora, jugador, enemigo)
  }

  private golpear(ahora: number, atacante: Entity, victima: Entity): void {
    const clave = `${atacante}>${victima}`
    const ultimo = this.ultimoGolpe.get(clave)
    if (ultimo !== undefined && ahora - ultimo < COOLDOWN_GOLPE_MS) return
    this.ultimoGolpe.set(clave, ahora)
    Health.hp[victima] -= Damage.amount[atacante]
  }

  /** Lo llama DeathSystem cuando una entidad llega a 0 de vida. */
  private matar(e: Entity): void {
    const eraJugador = this.world.has(e, Player)
    this.world.destroy(e)
    if (!eraJugador) return
    // scene.start() no corta el frame en curso: el SceneManager encola el
    // cambio y lo procesa al empezar el proximo update. El resto de este frame
    // corre con el jugador ya destruido, que es justo lo que ChaseSystem
    // espera (sin jugador no hace nada).
    //
    // El conteo es el del instante exacto de la muerte: DeathSystem recorre su
    // query de Health en orden de eid, y el jugador (el primer spawn) cae
    // antes de que se procesen los enemigos que mueren en esa misma pasada.
    this.scene.start('fin', { enemigosVivos: this.world.query(Enemy).length })
  }
}
