import type { Entity, World } from './world'

/** Clave donde la escena deposita el world de cada system. */
export const WORLD = Symbol('phaserx.world')

export type QueryResult = Iterable<Entity> & { readonly length: number }

export interface SystemInstance {
  update?(dt: number): void
}

/** Marca una clase como system. Registrar es todo lo que hace. */
const systems = new WeakSet<Function>()

export function System() {
  return function (value: Function, _ctx: ClassDecoratorContext): void {
    systems.add(value)
  }
}

export function isSystem(cls: Function): boolean {
  return systems.has(cls)
}

/** Inyecta el world en un system ya construido. */
export function bindWorld(system: object, world: World): void {
  ;(system as Record<symbol, World>)[WORLD] = world
}

class LazyQuery implements QueryResult {
  constructor(
    private readonly owner: object,
    private readonly components: object[],
  ) {}

  private resolve(): readonly Entity[] {
    const world = (this.owner as Record<symbol, World | undefined>)[WORLD]
    if (world === undefined) {
      throw new Error('@Query: system sin world. Falta bindWorld() o registrarlo en una escena.')
    }
    return world.query(...this.components)
  }

  [Symbol.iterator](): Iterator<Entity> {
    return this.resolve()[Symbol.iterator]()
  }

  get length(): number {
    return this.resolve().length
  }
}

/**
 * Expone las entidades que tienen todos los componentes indicados.
 *
 * Resuelve en cada acceso, no en construccion: el world se inyecta despues
 * de construir el system y las entidades cambian cada frame.
 */
export function Query(...components: object[]) {
  return function <T extends object>(
    _value: undefined,
    _ctx: ClassFieldDecoratorContext<T, QueryResult>,
  ) {
    return function (this: T): QueryResult {
      return new LazyQuery(this, components)
    }
  }
}
