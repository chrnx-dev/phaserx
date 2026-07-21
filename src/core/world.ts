import {
  addComponent,
  addEntity,
  createEntityIndex,
  createWorld,
  entityExists,
  getAllEntities,
  getEntityComponents,
  hasComponent,
  observe,
  onAdd as bitOnAdd,
  onRemove as bitOnRemove,
  query,
  removeEntity,
  type World as BitWorld,
} from 'bitecs'
import type { Column } from './column'
import { getCapacity, getDefaults } from './component'

export type Entity = number

/** Valores admitidos al inicializar un componente. */
export type Values<S> = {
  [K in keyof S]?: S[K] extends Column ? number : S[K] extends Array<infer U> ? U : never
}

const SETTER = Symbol('phaserx.setter')

export type Setter = { [SETTER]: true; component: object; values: Record<string, unknown> }

/** Empareja un componente con los valores iniciales de sus columnas. */
export function set<S extends object>(component: S, values: Values<S>): Setter {
  return { [SETTER]: true, component, values: values as Record<string, unknown> }
}

function isSetter(part: object | Setter): part is Setter {
  return SETTER in part
}

type Hook = () => void

/**
 * Lista de hooks de frame resistente a que un hook quite a otro mientras corre.
 *
 * Quitar por `splice` desplaza el array in-place, y un recorrido que ya empezo
 * se saltea al hook que ocupa el hueco (o, si se recorre hacia atras, lo corre
 * dos veces). Escenario real y no rebuscado: el `detach` del bridge es el hook
 * cero, y cualquier hook de usuario que lo llame silencia a los que vienen
 * despues.
 *
 * La baja marca la posicion con `null` en vez de compactar, y la compactacion
 * ocurre al terminar el recorrido. Asi los indices son estables durante todo
 * el frame, el orden de registro se respeta y no se copia nada: el costo es un
 * chequeo de nulidad por hook, dos veces por frame.
 */
type HookList = { hooks: Array<Hook | null>; holes: boolean }

function addHook(list: HookList, hook: Hook): () => void {
  list.hooks.push(hook)
  return () => {
    const i = list.hooks.indexOf(hook)
    if (i !== -1) {
      list.hooks[i] = null
      list.holes = true
    }
  }
}

function runHooks(list: HookList): void {
  const hooks = list.hooks
  // `hooks.length` se lee en cada vuelta a proposito: un hook puede registrar
  // otro, y ese corre en el mismo frame (era el comportamiento del for-of).
  for (let i = 0; i < hooks.length; i++) hooks[i]?.()
  if (!list.holes) return
  list.holes = false
  let w = 0
  for (let r = 0; r < hooks.length; r++) {
    const hook = hooks[r]
    if (hook !== null) hooks[w++] = hook
  }
  hooks.length = w
}

/**
 * Devuelve las columnas del componente a su valor declarado para ese eid.
 *
 * Los entity ids se reciclan y las columnas son buffers module-level que nadie
 * limpia al destruir una entidad, asi que sin esto una entidad nueva heredaria
 * la posicion, la velocidad y la vida del ocupante anterior de su id.
 */
function resetToDefaults(component: object, eid: Entity): void {
  const initial = getDefaults(component)
  if (initial === undefined) return
  const store = component as Record<string, { [i: number]: unknown }>
  for (const key of Object.keys(initial)) {
    const column = store[key]
    const value = initial[key]
    if (value !== undefined) {
      column[eid] = value
    } else if (Array.isArray(column)) {
      // Campo por referencia sin inicializador: borrar la celda en vez de
      // dejar `undefined` explicito evita retener el objeto anterior.
      delete (column as unknown[])[eid]
    } else {
      // Un TypedArray no puede guardar `undefined`: asignarlo daria NaN.
      column[eid] = 0
    }
  }
}

/**
 * Falla temprano si el entity id cae fuera de las columnas del componente.
 *
 * Sin este guard el desborde es completamente silencioso: escribir en un
 * TypedArray fuera de rango es un no-op y leer devuelve `undefined`, pero las
 * columnas `@ref` son arrays JS y si crecen. El resultado es una entidad que
 * existe, con su GameObject creado, cuya posicion es NaN: desaparece del
 * render sin un solo error en consola.
 *
 * Es una comparacion por componente por spawn, despreciable frente al costo
 * de `addComponent`.
 */
function assertCapacity(component: object, eid: Entity): void {
  const capacity = getCapacity(component)
  if (capacity !== undefined && eid >= capacity) {
    throw new Error(
      `spawn: el entity id ${eid} excede la capacidad ${capacity} de las columnas del componente. ` +
        'El techo no es cuantas entidades tienen este componente, sino el espacio de entity ids ' +
        'del proceso: hay un unico index compartido por todas las escenas vivas, y un id solo se ' +
        'libera al destruir su entidad. Subi el techo con configureCapacity(n) antes de definir ' +
        'los componentes, o destrui las entidades que ya no uses.',
    )
  }
}

/**
 * Entity index compartido por TODOS los World. Deliberado, no un descuido.
 *
 * Las columnas de un componente son estado module-level: `Position.x` es un
 * unico Float32Array indexado por entity id, comun a todo el proceso. Los
 * World, en cambio, son uno por escena. Si cada World tuviera su propio index,
 * dos escenas vivas a la vez (lo normal en Phaser: HUD sobre gameplay, o un
 * `scene.launch`) empezarian ambas en el eid 1 y se pisarian las columnas: el
 * spawn de una sobreescribe `Sprite.go` de la otra, el GameObject pisado queda
 * huerfano y nunca se destruye, y `destroy` en una mata el sprite de la otra.
 *
 * Compartir el index hace que los eids sean unicos a nivel proceso, asi que
 * dos worlds nunca indexan la misma celda. El costo es un espacio de ids
 * comun (la capacidad de las columnas se reparte entre escenas), que es
 * exactamente el trade-off que impone tener columnas module-level.
 *
 * No lo cambies a un index por World sin antes hacer las columnas por World.
 */
const sharedEntityIndex = createEntityIndex()

export class World {
  readonly raw: BitWorld

  private readonly preSyncHooks: HookList = { hooks: [], holes: false }
  private readonly postSyncHooks: HookList = { hooks: [], holes: false }
  private readonly teardownHooks: HookList = { hooks: [], holes: false }

  constructor() {
    this.raw = createWorld(sharedEntityIndex)
  }

  /**
   * Registra trabajo que corre antes del step de fisica de Phaser.
   * Devuelve una funcion que quita el hook.
   */
  onPreSync(hook: () => void): () => void {
    return addHook(this.preSyncHooks, hook)
  }

  /**
   * Registra trabajo que corre despues del step de fisica de Phaser.
   * Devuelve una funcion que quita el hook.
   */
  onPostSync(hook: () => void): () => void {
    return addHook(this.postSyncHooks, hook)
  }

  /**
   * Registra limpieza que corre cuando el world se apaga (`teardown`).
   *
   * Es el punto de extension que usan las capas de arriba (el bridge registra
   * aca su `detach`) para que el dueno del ciclo de vida (`GameScene`, en el
   * SHUTDOWN de Phaser) pueda apagar todo con una sola llamada, sin conocer
   * quien se engancho ni tener que importarlo.
   *
   * Devuelve una funcion que quita el hook.
   */
  onTeardown(hook: () => void): () => void {
    return addHook(this.teardownHooks, hook)
  }

  runPreSync(): void {
    runHooks(this.preSyncHooks)
  }

  runPostSync(): void {
    runHooks(this.postSyncHooks)
  }

  /**
   * Crea una entidad con los componentes indicados.
   *
   * El orden importa: los componentes se aplican de izquierda a derecha, asi
   * que un componente cuyo observer lea datos de otro (por ejemplo Sprite
   * leyendo Position) debe ir despues de ese otro.
   *
   * Es atomico: si algo lanza (el guard de capacidad, una columna que no
   * existe, o el observer `onAdd` de un componente que rechaza la entidad),
   * la entidad se destruye antes de propagar el error. Sin eso quedaria viva
   * y a medio construir, visible en las queries y con los GameObjects que sus
   * observers alcanzaron a crear ya enganchados a ella.
   */
  spawn(...parts: (object | Setter)[]): Entity {
    const eid = addEntity(this.raw)
    try {
      return this.build(eid, parts)
    } catch (err) {
      // `destroy` y no `removeEntity`: dispara los observers `onRemove` (asi
      // el bridge destruye el GameObject que su `onAdd` alcanzo a crear) y
      // devuelve las columnas ya escritas a sus defaults. Si la limpieza
      // fallara, el error que importa sigue siendo el original.
      try {
        this.destroy(eid)
      } catch {
        /* la causa real es err */
      }
      throw err
    }
  }

  private build(eid: Entity, parts: (object | Setter)[]): Entity {
    // Antes de tocar una sola columna: si el id no entra, todo lo que sigue
    // seria escritura al vacio.
    for (const part of parts) assertCapacity(isSetter(part) ? part.component : part, eid)
    for (const part of parts) {
      if (isSetter(part)) {
        // Resetear ANTES de aplicar los valores: el eid puede venir reciclado
        // con basura del ocupante anterior, y un set parcial solo pisa las
        // columnas que nombra. Lo que no nombra debe quedar en su default
        // declarado, no en el valor del muerto.
        resetToDefaults(part.component, eid)
        // Los valores se escriben ANTES de addComponent a proposito: los
        // observers onAdd se disparan dentro de addComponent y deben ver el
        // componente ya inicializado. Escribir columnas no requiere que el
        // componente este agregado; son arrays planos indexados por eid.
        const store = part.component as Record<string, { [i: number]: unknown }>
        for (const key of Object.keys(part.values)) {
          const column = store[key]
          if (column === undefined) {
            throw new Error(`spawn: el componente no tiene la columna '${key}'`)
          }
          column[eid] = part.values[key]
        }
        // bitECS.addComponent hace su propio duck-typing interno
        // (`"component" in componentOrSet`) para distinguir un componente
        // suelto de su propio azucar `{component, data}` (ComponentSetter,
        // ver docs/API.md). Si el store del componente de dominio tiene una
        // columna llamada justo 'component', pasarlo suelto haria que
        // bitECS lo interprete como ese wrapper y extraiga la columna en
        // vez del store real. Envolver explicitamente en `{ component }`
        // (sin 'data') fija la desambiguacion sin importar los nombres de
        // columna del store.
        addComponent(this.raw, eid, { component: part.component })
      } else {
        // Un componente crudo tambien arranca limpio: sin valores explicitos,
        // todas sus columnas valen su default declarado.
        resetToDefaults(part, eid)
        addComponent(this.raw, eid, { component: part })
      }
    }
    return eid
  }

  /**
   * Destruye la entidad y devuelve sus columnas a los valores declarados.
   *
   * El reseteo tambien corre en `spawn` (un eid reciclado puede traer basura
   * del ocupante anterior), pero eso no alcanza para las referencias: un
   * objeto grande guardado en un `@ref` queda retenido para siempre si nadie
   * vuelve a spawnear ese mismo eid con ese mismo componente. Resetear aca
   * hace que la vida del dato termine con la de la entidad.
   *
   * El reseteo va DESPUES de `removeEntity` a proposito: los observers
   * `onRemove` corren dentro de `removeEntity` y necesitan ver los datos de la
   * entidad que se va (asi es como el bridge llega a `Sprite.go[eid].destroy()`).
   * La lista de componentes se captura antes porque `removeEntity` la vacia,
   * y se copia porque bitECS devuelve una referencia viva.
   */
  destroy(entity: Entity): void {
    // `getEntityComponents` lanza si la entidad no existe, mientras que
    // `removeEntity` la ignora. Destruir dos veces (o destruir algo que ya
    // murio por otro camino) es corriente en un juego, asi que se mantiene el
    // no-op.
    if (!entityExists(this.raw, entity)) return
    const components = [...getEntityComponents(this.raw, entity)] as object[]
    removeEntity(this.raw, entity)
    for (const component of components) resetToDefaults(component, entity)
  }

  /**
   * Destruye todas las entidades vivas del world.
   *
   * Es `destroy` sobre cada una, asi que corren los observers `onRemove` (el
   * bridge destruye ahi los GameObjects) y se resetean las columnas. Sin esto
   * la unica forma de vaciar un world era consultar por algun componente que
   * uno supiera comun a todas las entidades: `query()` exige al menos uno, y
   * una entidad que no lo tenga sobrevive en silencio, reteniendo su eid para
   * siempre (el entity index es compartido y las columnas tienen capacidad
   * fija).
   *
   * La lista se copia antes de iterar porque `destroy` la muta.
   */
  clear(): void {
    for (const entity of [...getAllEntities(this.raw)] as Entity[]) this.destroy(entity)
  }

  /**
   * Apaga el world: destruye sus entidades y corre los hooks de `onTeardown`.
   *
   * El orden no es negociable y por eso vive aca y no en el usuario: las
   * entidades se destruyen ANTES de los hooks, porque el `detach` del bridge
   * (que es un hook de teardown) quita el observer `onRemove` que destruye los
   * GameObjects. Al reves, cada entidad dejaria su GameObject y sus sombras de
   * posicion colgados para siempre.
   *
   * Los hooks corren una sola vez: despues de correrlos la lista queda vacia,
   * asi que un segundo `teardown()` solo vuelve a vaciar las entidades.
   */
  teardown(): void {
    this.clear()
    runHooks(this.teardownHooks)
    this.teardownHooks.hooks.length = 0
    this.teardownHooks.holes = false
  }

  has(entity: Entity, component: object): boolean {
    return hasComponent(this.raw, entity, component)
  }

  query(...components: object[]): readonly Entity[] {
    // bitECS documenta (docs/API.md, `query`) que sin `buffered: true` el
    // resultado siempre es number[]; este wrapper nunca pasa esa opcion.
    // Es la referencia viva que bitECS reutiliza y muta in-place: consultar
    // e iterar, nunca retener entre frames.
    return query(this.raw, components) as readonly Entity[]
  }

  /** Observa el alta del componente. Devuelve la funcion de desuscripcion. */
  onAdd(component: object, callback: (entity: Entity) => void): () => void {
    return observe(this.raw, bitOnAdd(component), (eid: number) => {
      callback(eid)
    })
  }

  /** Observa la baja del componente. Devuelve la funcion de desuscripcion. */
  onRemove(component: object, callback: (entity: Entity) => void): () => void {
    return observe(this.raw, bitOnRemove(component), (eid: number) => {
      callback(eid)
    })
  }
}
