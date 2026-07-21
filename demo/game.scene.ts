import Phaser from 'phaser'
import {
  Asset,
  attachSprites,
  type Entity,
  entityOf,
  GameScene,
  Position,
  Scene,
  set,
  sprite,
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

  /** Listener propio del demo, el unico que esta escena da de baja a mano. */
  private leerTeclado?: () => void

  protected onCreate(): void {
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

    // La factory recibe el entity id, asi que el GameObject entra al grupo que
    // le corresponde en el mismo momento en que nace, consultando el world con
    // ese eid. No hace falta ningun mapeo a mano ni ningun cast: el tipo que
    // llega al grupo es el que devuelve `physics.add.sprite`.
    attachSprites(this.world, (key, x, y, e) => {
      const go = this.physics.add.sprite(x, y, key)
      if (this.world.has(e, Player)) jugadores.add(go)
      else enemigos.add(go)
      return go
    })

    this.world.spawn(
      set(Position, { x: 400, y: 300 }),
      set(Velocity, { x: 0, y: 0 }),
      Player,
      set(Health, { hp: 100 }),
      set(Damage, { amount: 5 }),
      sprite(A.player),
    )

    for (let i = 0; i < 5; i++) {
      this.world.spawn(
        set(Position, { x: 100 + i * 120, y: 80 }),
        set(Velocity, { x: 0, y: 0 }),
        set(Enemy, { chaseSpeed: 120 }),
        set(Health, { hp: 10 }),
        set(Damage, { amount: 20 }),
        sprite(A.enemy),
      )
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
    this.leerTeclado = leerTeclado
  }

  /**
   * Lo unico que esta escena tiene para limpiar: su propio listener de teclado.
   *
   * Las entidades del world y el `detach()` del bridge los apaga GameScene en
   * el SHUTDOWN de Phaser (`world.teardown()`), asi que aca no hay una sola
   * linea de ciclo de vida del framework.
   */
  protected onShutdown(): void {
    if (this.leerTeclado) this.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.leerTeclado)
    this.ultimoGolpe.clear()
  }

  /** Overlap jugador <-> enemigo: los dos se hacen dano al tocarse. */
  private contacto(a: Phaser.GameObjects.GameObject, b: Phaser.GameObjects.GameObject): void {
    // entityOf acepta cualquier objeto: el GameObject que llega del callback de
    // Arcade entra tal cual, sin casts, y devuelve undefined si la entidad ya
    // murio en este mismo frame.
    const jugador = entityOf(a)
    const enemigo = entityOf(b)
    if (jugador === undefined || enemigo === undefined) return
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
