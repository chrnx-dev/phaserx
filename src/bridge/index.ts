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
 * Ultima posicion que `postSync` leyo del GameObject, por entity id.
 *
 * Es la sombra contra la que `preSync` compara para decidir si el ECS cambio
 * la posicion desde el frame anterior. Ver el JSDoc de `preSync`.
 *
 * Son arrays JS planos y no columnas de un componente porque son estado
 * interno del bridge: no deben aparecer en ninguna query ni en el store de
 * `Position`.
 */
const shadowX: number[] = []
const shadowY: number[] = []

/**
 * Worlds que ya tienen el bridge enganchado, con su detach y su factory.
 *
 * `attachSprites` tiene que ser idempotente: `GameScene.create()` vuelve a
 * correr sobre el mismo `readonly world` en cada `scene.restart()`, asi que
 * sin esto la segunda pasada duplicaria observers y hooks. Con dos observers
 * onAdd una entidad crearia DOS GameObjects, el primero quedaria huerfano y
 * `destroy` solo mataria al segundo.
 *
 * Se guarda el detach real (no un no-op) porque justamente la llamada
 * duplicada del restart es la del ciclo de vida legitimo: es la que guarda el
 * handle para el SHUTDOWN. Devolver un no-op dejaria el bridge enganchado sin
 * forma de desengancharlo.
 */
type Attachment = { detach: () => void; factory: SpriteFactory }
const attached = new WeakMap<World, Attachment>()

/**
 * Conecta el ciclo de vida de los GameObjects al del world.
 *
 * Es idempotente: llamarla de nuevo sobre un world ya enganchado no duplica
 * nada y devuelve el mismo `detach()` de la primera llamada, que es lo que la
 * escena necesita para limpiar en el SHUTDOWN.
 *
 * Lanza si una llamada posterior trae una factory distinta de la registrada:
 * seguir usando la vieja en silencio haria que un restart con otra factory
 * pareciera funcionar y creara los GameObjects en la escena equivocada.
 * Para cambiar de factory hay que llamar a `detach()` primero.
 */
export function attachSprites(world: World, factory: SpriteFactory): () => void {
  const previo = attached.get(world)
  if (previo !== undefined) {
    if (previo.factory !== factory) {
      throw new Error(
        'attachSprites: el world ya esta enganchado con otra factory. ' +
          'Llamar a detach() antes de volver a enganchar con una factory distinta.',
      )
    }
    return previo.detach
  }

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
    // Position es un requisito duro, no una recomendacion de orden. Sin este
    // chequeo se leerian las celdas igual, y una entidad sin Position hereda
    // la posicion del ocupante anterior del eid (que con el entity index
    // compartido puede ser de otra escena): el GameObject nace en el lugar
    // del muerto y postSync jamas lo corrige, porque su query pide Position.
    if (!world.has(eid, Position)) {
      throw new Error(
        'Sprite: la entidad necesita Position. Usar set(Position, ...) antes de sprite() en el spawn.',
      )
    }
    const go = factory(key, Position.x[eid], Position.y[eid])
    Sprite.go[eid] = go
    // La sombra arranca sincronizada con Position: el GameObject acaba de
    // nacer en esa posicion, asi que el primer preSync no tiene nada que
    // copiar. Si la factory decidio otra posicion, esa gana (es el
    // GameObject quien mando desde el vamos), hasta que un system escriba
    // Position.
    shadowX[eid] = Position.x[eid]
    shadowY[eid] = Position.y[eid]
  })

  const offRemove = world.onRemove(Sprite, eid => {
    const go = Sprite.go[eid]
    if (go !== undefined) go.destroy()
    // Liberar las referencias: sin esto el array retiene el GameObject y la
    // entidad reciclada heredaria el sprite del ocupante anterior.
    delete Sprite.go[eid]
    delete Sprite.key[eid]
    delete shadowX[eid]
    delete shadowY[eid]
  })

  const detach = () => {
    if (attached.get(world)?.detach !== detach) return
    attached.delete(world)
    offPreSync()
    offPostSync()
    offAdd()
    offRemove()
  }
  attached.set(world, { detach, factory })
  return detach
}

/**
 * Crea el GameObject de la entidad a partir de un asset.
 *
 * La entidad DEBE tener tambien Position: el observer lee la posicion al
 * construir el GameObject, y sin Position el bridge lanza. Ademas el `set` de
 * Position tiene que ir antes en la lista de spawn, porque los componentes se
 * aplican de izquierda a derecha y el observer corre al agregarse Sprite:
 *
 * ```ts
 * world.spawn(set(Position, { x, y }), sprite({ key: 'hero' }))
 * ```
 */
export function sprite(spec: { key: string }): Setter {
  return set(Sprite, { key: spec.key })
}

/**
 * ECS -> GameObject. Lo corre GameScene en PRE_UPDATE, antes de la fisica.
 *
 * La posicion se copia SOLO si el ECS la cambio desde el frame anterior. La
 * regla es esa y no "copiar siempre" porque el GameObject tambien se mueve por
 * su cuenta: tweens, animaciones y fisica de Phaser: y copiar incondicional lo
 * devolveria a la posicion del ECS en cada frame, que es exactamente lo que el
 * bridge hibrido existe para no hacer.
 *
 * El dirty-check compara `Position` contra una sombra de lo ultimo que
 * `postSync` leyo del GameObject. Si son iguales, nadie escribio `Position`
 * desde el ECS y el GameObject manda. Si difieren, un system movio la entidad
 * (teleport, knockback, spawn point) y el GameObject se reposiciona.
 *
 * Consecuencia a tener presente: escribir en `Position` el mismo valor que ya
 * tenia no mueve el GameObject. Para forzarlo, escribir el valor deseado
 * despues de que el frame haya corrido, o mover el GameObject directamente.
 */
export function preSync(world: World): void {
  // Position se copia por separado de Velocity y con su propia query: un
  // teleport, un knockback o un spawn point escriben Position sin que la
  // entidad tenga por que tener Velocity. Si se hiciera en la query
  // (Sprite, Velocity), Position seria de solo lectura para esas entidades y
  // postSync le devolveria el valor viejo.
  for (const eid of world.query(Sprite, Position)) {
    const go = Sprite.go[eid]
    if (go !== undefined) {
      const x = Position.x[eid]
      const y = Position.y[eid]
      if (x !== shadowX[eid]) {
        go.x = x
        shadowX[eid] = x
      }
      if (y !== shadowY[eid]) {
        go.y = y
        shadowY[eid] = y
      }
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

/**
 * GameObject -> ECS. Lo corre GameScene en POST_UPDATE, despues de la fisica.
 *
 * Ademas de volcar la posicion resuelta al ECS, actualiza la sombra que usa
 * `preSync` para su dirty-check: despues de este paso, ECS y GameObject
 * coinciden, asi que cualquier diferencia en el proximo frame solo puede venir
 * de una escritura del ECS.
 */
export function postSync(world: World): void {
  for (const eid of world.query(Sprite, Position)) {
    const go = Sprite.go[eid]
    if (go !== undefined) {
      Position.x[eid] = go.x
      Position.y[eid] = go.y
      // La sombra se toma de la columna, no de `go.x`: Position.x es un
      // Float32Array y redondea, asi que guardar el double original haria que
      // preSync viera una diferencia espuria en cada frame.
      shadowX[eid] = Position.x[eid]
      shadowY[eid] = Position.y[eid]
    }
  }
}
