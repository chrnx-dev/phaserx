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
 * Conecta el ciclo de vida de los GameObjects al del world.
 *
 * Debe llamarse una vez por world, antes del primer spawn con sprite().
 */
export function attachSprites(world: World, factory: SpriteFactory): void {
  // El bridge se auto-registra en los hooks de frame del world. GameScene los
  // corre en PRE_UPDATE y POST_UPDATE, que es donde caen a ambos lados del
  // step de fisica de Phaser. Asi el usuario no tiene que acordarse del orden.
  world.onPreSync(() => preSync(world))
  world.onPostSync(() => postSync(world))

  world.onAdd(Sprite, eid => {
    // World.spawn escribe las columnas antes de addComponent, asi que 'key'
    // ya esta puesta cuando corre este observer.
    const key = Sprite.key[eid]
    if (key === undefined) {
      throw new Error('Sprite: falta la textura. Usar el helper sprite().')
    }
    Sprite.go[eid] = factory(key, Position.x[eid], Position.y[eid])
  })

  world.onRemove(Sprite, eid => {
    const go = Sprite.go[eid]
    if (go !== undefined) go.destroy()
    // Liberar las referencias: sin esto el array retiene el GameObject y la
    // entidad reciclada heredaria el sprite del ocupante anterior.
    delete Sprite.go[eid]
    delete Sprite.key[eid]
  })
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
