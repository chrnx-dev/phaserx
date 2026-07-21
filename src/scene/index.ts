import Phaser from 'phaser'
import { type AssetBinding, drainAssets } from '../assets/index'
import { bindWorld, type SystemInstance } from '../core/system'
import { World } from '../core/world'

export type SceneConfig = {
  key: string
  systems?: Array<new () => SystemInstance>
}

export type SceneMeta = {
  key: string
  systems: Array<new () => SystemInstance>
  assets: AssetBinding[]
}

const metas = new WeakMap<Function, SceneMeta>()

/**
 * Registra una escena: su key, sus systems y los @Asset que declaro.
 *
 * Solo guarda metadata. Los miembros tipados (this.world, this.add, ...) los
 * aporta la clase base GameScene, porque un class decorator no puede agregar
 * miembros al tipo de la clase decorada.
 */
export function Scene(config: SceneConfig) {
  return function (value: Function, _ctx: ClassDecoratorContext): void {
    metas.set(value, {
      key: config.key,
      systems: config.systems ?? [],
      assets: drainAssets(),
    })
  }
}

export function getSceneMeta(cls: Function): SceneMeta | undefined {
  return metas.get(cls)
}

/** Corre los systems en orden de declaracion. `deltaMs` viene de Phaser. */
export function runSystems(systems: object[], world: World, deltaMs: number): void {
  const dt = deltaMs / 1000
  for (const system of systems) {
    bindWorld(system, world)
    const update = (system as SystemInstance).update
    if (typeof update === 'function') update.call(system, dt)
  }
}

/**
 * Clase base de toda escena de PhaserX.
 *
 * Aporta el world, corre los systems y resuelve los @Asset. Las subclases
 * usan onCreate() en lugar de create() para no tener que llamar a super.
 */
export abstract class GameScene extends Phaser.Scene {
  readonly world = new World()
  protected systems: SystemInstance[] = []

  constructor() {
    // new.target es la subclase concreta y esta disponible antes de super(),
    // asi que la key llega al constructor de Phaser por la via normal en vez
    // de mutar sys.settings despues.
    const meta = getSceneMeta(new.target)
    if (meta === undefined) {
      throw new Error(`${new.target.name}: falta el decorador @Scene`)
    }
    super(meta.key)
  }

  private get meta(): SceneMeta {
    return getSceneMeta(this.constructor)!
  }

  preload(): void {
    for (const { spec } of this.meta.assets) {
      switch (spec.type) {
        case 'image':
          this.load.image(spec.key, spec.url)
          break
        case 'spritesheet':
          this.load.spritesheet(spec.key, spec.url, {
            frameWidth: spec.frameWidth,
            frameHeight: spec.frameHeight ?? spec.frameWidth,
          })
          break
        case 'audio':
          this.load.audio(spec.key, spec.url)
          break
      }
    }
  }

  create(): void {
    for (const { property, spec } of this.meta.assets) {
      const target = this as unknown as Record<string, unknown>
      // Con useDefineForClassFields (tsconfig strict) un campo `@Asset`
      // declarado por esta clase se emite como propiedad propia de la
      // instancia, asi que 'in' da true para el. Un binding que nombra una
      // propiedad ausente no puede venir de esta clase: es huerfano porque
      // pertenece a otra clase que declaro @Asset sin @Scene, y por lo
      // tanto nunca dreno el buffer (ver src/assets/index.ts) — el proximo
      // @Scene que se definio, esta, se lo llevo por delante.
      if (!(property in target)) {
        throw new Error(
          `${this.constructor.name}: el binding de @Asset para la propiedad '${property}' ` +
            `(asset '${spec.key}') no corresponde a esta clase. Probablemente otra clase ` +
            `declaro @Asset sin el decorador @Scene, y este binding quedo huerfano en el ` +
            `buffer hasta que la proxima @Scene lo heredo.`,
        )
      }
      target[property] =
        spec.type === 'audio' ? this.sound.add(spec.key) : this.textures.get(spec.key)
    }
    this.systems = this.meta.systems.map(S => new S())
    this.onCreate?.()

    // No se puede usar update() para esto: Systems#step() de Phaser emite
    // PRE_UPDATE, luego UPDATE (donde ArcadePhysics engancha su propio
    // world.update), luego recien llama a scene.update(), y por ultimo
    // emite POST_UPDATE (donde ArcadePhysics engancha world.postUpdate). O
    // sea que update() corre DESPUES del step de fisica: desde ahi no hay
    // forma de anteponer PreSync ni intercalar PostSync antes del proximo
    // frame. Enganchando PRE_UPDATE y POST_UPDATE directamente logramos el
    // orden que pide el proyecto: systems -> PreSync -> fisica -> PostSync.
    // ArcadePhysics registra su listener de POST_UPDATE durante el boot de
    // la escena (antes de que create() corra), asi que en ese evento su
    // callback siempre queda antes que el nuestro.
    this.events.on(Phaser.Scenes.Events.PRE_UPDATE, (_time: number, delta: number) => {
      runSystems(this.systems, this.world, delta)
      this.onUpdate?.(delta / 1000)
      this.world.runPreSync()
    })
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, () => {
      this.world.runPostSync()
    })
  }

  /** Hook de la subclase. Corre despues de resolver assets y construir systems. */
  protected onCreate?(): void
  /** Hook opcional de la subclase, con el delta ya en segundos. */
  protected onUpdate?(dt: number): void
}
