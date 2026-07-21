import { f32, ref } from '../core/column'
import { component } from '../core/component'
import { set, type Setter, type World } from '../core/world'

export const Position = component(class { @f32 x = 0; @f32 y = 0 })
export const Velocity = component(class { @f32 x = 0; @f32 y = 0 })

/** Lo minimo que el bridge necesita de un GameObject. Facilita testear sin canvas. */
export interface SpriteLike {
  x: number
  y: number
  destroy(): void
  body?: { velocity: { x: number; y: number } } | null
}

export const Sprite = component(
  class {
    @ref key!: string
    @ref go!: SpriteLike
  },
)

export type SpriteFactory = (key: string, x: number, y: number) => SpriteLike

/**
 * Worlds que ya tienen el bridge enganchado.
 *
 * `attachSprites` tiene que ser idempotente: `GameScene.create()` vuelve a
 * correr sobre el mismo `readonly world` en cada `scene.restart()`, asi que
 * sin esto la segunda pasada duplicaria observers y hooks. Con dos observers
 * onAdd una entidad crearia DOS GameObjects, el primero quedaria huerfano y
 * `destroy` solo mataria al segundo.
 */
const attached = new WeakSet<World>()

/**
 * Conecta el ciclo de vida de los GameObjects al del world.
 *
 * Es idempotente: llamarla de nuevo sobre un world ya enganchado no hace nada.
 * Devuelve `detach()`, que desengancha observers y hooks para que una escena
 * pueda limpiar al apagarse (y permite volver a enganchar despues).
 */
export function attachSprites(world: World, factory: SpriteFactory): () => void {
  if (attached.has(world)) return () => {}
  attached.add(world)

  // El bridge se auto-registra en los hooks de frame del world. GameScene los
  // corre en PRE_UPDATE y POST_UPDATE, que es donde caen a ambos lados del
  // step de fisica de Phaser. Asi el usuario no tiene que acordarse del orden.
  const offPreSync = world.onPreSync(() => preSync(world))
  const offPostSync = world.onPostSync(() => postSync(world))

  const offAdd = world.onAdd(Sprite, eid => {
    // World.spawn escribe las columnas antes de addComponent, asi que 'key'
    // ya esta puesta cuando corre este observer.
    const key = Sprite.key[eid]
    if (key === undefined) {
      throw new Error('Sprite: falta la textura. Usar el helper sprite().')
    }
    Sprite.go[eid] = factory(key, Position.x[eid], Position.y[eid])
  })

  const offRemove = world.onRemove(Sprite, eid => {
    const go = Sprite.go[eid]
    if (go !== undefined) go.destroy()
    // Liberar las referencias: sin esto el array retiene el GameObject y la
    // entidad reciclada heredaria el sprite del ocupante anterior.
    delete Sprite.go[eid]
    delete Sprite.key[eid]
  })

  return () => {
    if (!attached.has(world)) return
    attached.delete(world)
    offPreSync()
    offPostSync()
    offAdd()
    offRemove()
  }
}

/**
 * Crea el GameObject de la entidad a partir de un asset.
 *
 * Debe ir despues de Position en la lista de spawn: el observer lee la
 * posicion de la entidad al construir el GameObject.
 */
export function sprite(spec: { key: string }): Setter {
  return set(Sprite, { key: spec.key })
}

/** ECS -> GameObject. Lo corre GameScene en PRE_UPDATE, antes de la fisica. */
export function preSync(world: World): void {
  // Position se copia por separado de Velocity y con su propia query: un
  // teleport, un knockback o un spawn point escriben Position sin que la
  // entidad tenga por que tener Velocity. Si se hiciera en la query
  // (Sprite, Velocity), Position seria de solo lectura para esas entidades y
  // postSync le devolveria el valor viejo.
  for (const eid of world.query(Sprite, Position)) {
    const go = Sprite.go[eid]
    if (go !== undefined) {
      go.x = Position.x[eid]
      go.y = Position.y[eid]
    }
  }
  for (const eid of world.query(Sprite, Velocity)) {
    const go = Sprite.go[eid]
    if (go?.body) {
      go.body.velocity.x = Velocity.x[eid]
      go.body.velocity.y = Velocity.y[eid]
    }
  }
}

/** GameObject -> ECS. Lo corre GameScene en POST_UPDATE, despues de la fisica. */
export function postSync(world: World): void {
  for (const eid of world.query(Sprite, Position)) {
    const go = Sprite.go[eid]
    if (go !== undefined) {
      Position.x[eid] = go.x
      Position.y[eid] = go.y
    }
  }
}
