import {
  addComponent,
  addEntity,
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

export class World {
  readonly raw: BitWorld

  private readonly preSyncHooks: Array<() => void> = []
  private readonly postSyncHooks: Array<() => void> = []

  constructor() {
    this.raw = createWorld()
  }

  /** Registra trabajo que corre antes del step de fisica de Phaser. */
  onPreSync(hook: () => void): void {
    this.preSyncHooks.push(hook)
  }

  /** Registra trabajo que corre despues del step de fisica de Phaser. */
  onPostSync(hook: () => void): void {
    this.postSyncHooks.push(hook)
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

  onAdd(component: object, callback: (entity: Entity) => void): void {
    observe(this.raw, bitOnAdd(component), (eid: number) => {
      callback(eid)
    })
  }

  onRemove(component: object, callback: (entity: Entity) => void): void {
    observe(this.raw, bitOnRemove(component), (eid: number) => {
      callback(eid)
    })
  }
}
