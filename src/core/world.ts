import {
  addComponent,
  addEntity,
  createEntityIndex,
  createWorld,
  hasComponent,
  observe,
  onAdd as bitOnAdd,
  onRemove as bitOnRemove,
  query,
  removeEntity,
  type World as BitWorld,
} from 'bitecs'
import type { Column } from './column'
import { getDefaults } from './component'

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

function removeFrom<T>(list: T[], item: T): void {
  const i = list.indexOf(item)
  if (i !== -1) list.splice(i, 1)
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

  private readonly preSyncHooks: Array<() => void> = []
  private readonly postSyncHooks: Array<() => void> = []

  constructor() {
    this.raw = createWorld(sharedEntityIndex)
  }

  /**
   * Registra trabajo que corre antes del step de fisica de Phaser.
   * Devuelve una funcion que quita el hook.
   */
  onPreSync(hook: () => void): () => void {
    this.preSyncHooks.push(hook)
    return () => removeFrom(this.preSyncHooks, hook)
  }

  /**
   * Registra trabajo que corre despues del step de fisica de Phaser.
   * Devuelve una funcion que quita el hook.
   */
  onPostSync(hook: () => void): () => void {
    this.postSyncHooks.push(hook)
    return () => removeFrom(this.postSyncHooks, hook)
  }

  runPreSync(): void {
    for (const hook of this.preSyncHooks) hook()
  }

  runPostSync(): void {
    for (const hook of this.postSyncHooks) hook()
  }

  /**
   * Crea una entidad con los componentes indicados.
   *
   * El orden importa: los componentes se aplican de izquierda a derecha, asi
   * que un componente cuyo observer lea datos de otro (por ejemplo Sprite
   * leyendo Position) debe ir despues de ese otro.
   */
  spawn(...parts: (object | Setter)[]): Entity {
    const eid = addEntity(this.raw)
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

  destroy(entity: Entity): void {
    removeEntity(this.raw, entity)
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
