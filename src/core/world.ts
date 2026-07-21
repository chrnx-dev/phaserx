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

export type Setter = { component: object; values: Record<string, unknown> }

/** Empareja un componente con los valores iniciales de sus columnas. */
export function set<S extends object>(component: S, values: Values<S>): Setter {
  return { component, values: values as Record<string, unknown> }
}

function isSetter(part: object | Setter): part is Setter {
  return 'component' in part && 'values' in part
}

export class World {
  readonly raw: BitWorld

  constructor() {
    this.raw = createWorld()
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
        addComponent(this.raw, eid, part.component)
      } else {
        addComponent(this.raw, eid, part)
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
    // bitECS puede devolver un Uint32Array (QueryResult) en vez de un array
    // plano; se normaliza para cumplir el tipo publico `readonly Entity[]`.
    return Array.from(query(this.raw, components))
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
